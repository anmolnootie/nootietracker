import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { addDays } from 'date-fns';

import { POMasterEntity } from '../../database/entities/po-master.entity';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { LogisticsTrackerEntity } from '../../database/entities/logistics-tracker.entity';
import { GRNTrackerEntity } from '../../database/entities/grn-tracker.entity';

import { POStatus, TaskType } from '@po-control-tower/shared';
import { POService } from '../po/po.service';
import { TasksService } from '../tasks/tasks.service';
import { ReturnsService } from '../returns/returns.service';
import { NotificationsService } from '../notifications/notifications.service';

const TERMINAL_STATUSES = [POStatus.CLOSED, POStatus.CANCELLED, POStatus.RETURNED, POStatus.RECONCILED];

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    @InjectRepository(POMasterEntity) private readonly poRepository: Repository<POMasterEntity>,
    @InjectRepository(AppointmentEntity) private readonly appointmentRepository: Repository<AppointmentEntity>,
    @InjectRepository(DispatchEntity) private readonly dispatchRepository: Repository<DispatchEntity>,
    @InjectRepository(LogisticsTrackerEntity) private readonly logisticsRepository: Repository<LogisticsTrackerEntity>,
    @InjectRepository(GRNTrackerEntity) private readonly grnRepository: Repository<GRNTrackerEntity>,
    private readonly poService: POService,
    private readonly tasksService: TasksService,
    private readonly returnsService: ReturnsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async recomputeRiskAndStatus() {
    const pos = await this.poRepository.find();
    for (const po of pos) {
      if (TERMINAL_STATUSES.includes(po.status)) continue;
      await this.poService.recomputeStatus(po.id);
      await this.poService.recomputeRisk(po.id);
      // Dispatch window/status must stay live against today's date and the
      // Location Master's current TAT config, not whatever was true at PO creation.
      await this.poService.recomputeDispatchPlan(po.id);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async escalateOverdueTasks() {
    const overdue = await this.tasksService.findOverdueOpenTasks();
    for (const task of overdue) {
      // AVV follow-up runs its own repeating nag cycle (see avvFollowUpCheck) rather
      // than the L1-L4 escalation ladder, so it's excluded here.
      if (task.taskType === TaskType.AVV_FOLLOWUP) continue;
      await this.tasksService.escalate(task.id);
      this.logger.log(`Escalated overdue task ${task.id} (${task.taskType}) for PO ${task.poId}`);
    }
  }

  /**
   * AVV Follow-up Rule: Dispatch Date + 3 days -> first reminder.
   * If unchecked, repeat every 2 days until "Received & Actioned" or PO closed.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async avvFollowUpCheck() {
    const pending = await this.logisticsRepository.find({ where: { receivedAndActioned: false } });
    for (const logistics of pending) {
      const dispatch = await this.dispatchRepository.findOneBy({ poId: logistics.poId });
      if (!dispatch?.actualDispatchDate) continue;

      const firstDueAt = addDays(dispatch.actualDispatchDate, 3);
      if (firstDueAt > new Date()) continue;

      const openTask = await this.tasksService.findOpenByPoAndType(logistics.poId, TaskType.AVV_FOLLOWUP);
      const po = await this.poRepository.findOneBy({ id: logistics.poId });
      if (!po || TERMINAL_STATUSES.includes(po.status)) continue;

      if (!openTask) {
        await this.tasksService.create({
          poId: logistics.poId,
          taskType: TaskType.AVV_FOLLOWUP,
          ownerId: po.logisticsOwnerId || po.overallOwnerId,
          status: 'OPEN',
          slaDueAt: new Date(),
          notes: `Please check AVV ${logistics.docketNumber} - is it received and actioned?`,
        });
      } else if (openTask.slaDueAt <= new Date()) {
        await this.notificationsService.notify({
          userId: openTask.ownerId,
          type: 'AVV_FOLLOWUP_REMINDER',
          title: `AVV follow-up: ${logistics.docketNumber}`,
          message: `Please check AVV ${logistics.docketNumber} - is it received and actioned?`,
          poId: logistics.poId,
          taskId: openTask.id,
        });
        await this.tasksService.pushSlaDueAt(openTask.id, addDays(new Date(), 2));
      }
    }
  }

  /**
   * Appointment Extension Rule: if no slot booked and we're inside the
   * 3-4-day-before-expiry window, auto-create an Extension Request before expiry hits.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async appointmentExtensionCheck() {
    const appointments = await this.appointmentRepository.find({ where: { confirmedAt: IsNull(), extensionRequested: false } });
    for (const appointment of appointments) {
      const po = await this.poRepository.findOneBy({ id: appointment.poId });
      if (!po || TERMINAL_STATUSES.includes(po.status)) continue;

      const daysToExpiry = Math.ceil((po.poExpiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysToExpiry > 4 || daysToExpiry < 0) continue;

      appointment.extensionRequested = true;
      await this.appointmentRepository.save(appointment);

      await this.tasksService.create({
        poId: po.id,
        taskType: TaskType.APPOINTMENT,
        ownerId: po.appointmentOwnerId || po.overallOwnerId,
        status: 'OPEN',
        slaDueAt: new Date(),
        notes: `Extension Request: no appointment slot booked with ${daysToExpiry} day(s) to expiry. Request PO validity extension.`,
      });
    }
  }

  /**
   * GRN Ageing Rule: once a PO is delivered, someone must be tracking GRN to close.
   * Flag ageing at 24h if still no outcome recorded.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async grnAgeingCheck() {
    const openGrns = await this.grnRepository.find({ where: { outcome: IsNull() } });
    for (const grn of openGrns) {
      const po = await this.poRepository.findOneBy({ id: grn.poId });
      if (!po || TERMINAL_STATUSES.includes(po.status)) continue;

      const ageHours = (Date.now() - grn.createdAt.getTime()) / (1000 * 60 * 60);
      if (ageHours < 24) continue;

      const openTask = await this.tasksService.findOpenByPoAndType(grn.poId, TaskType.GRN);
      if (!openTask) {
        await this.tasksService.create({
          poId: grn.poId,
          taskType: TaskType.GRN,
          ownerId: po.grnOwnerId || po.overallOwnerId,
          status: 'OPEN',
          slaDueAt: new Date(),
          notes: `GRN pending ${Math.floor(ageHours)}h since delivery - record GRN outcome.`,
        });
      }
    }
  }

  /**
   * Recall + CN Rule: PO expired with no successful delivery and no granted
   * extension -> auto-flag as Recall, open a Return Tracker row, and raise a CN task.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async recallCheck() {
    const pos = await this.poRepository.find();
    for (const po of pos) {
      if (TERMINAL_STATUSES.includes(po.status)) continue;
      if (po.poExpiryDate > new Date()) continue;

      const dispatch = await this.dispatchRepository.findOneBy({ poId: po.id });
      if (dispatch?.actualDispatchDate) continue; // was dispatched - not an undelivered recall case

      const appointment = await this.appointmentRepository.findOneBy({ poId: po.id });
      if (appointment?.extensionGranted && appointment.newExpiryDate && appointment.newExpiryDate > new Date()) {
        continue; // extension covers this PO for now
      }

      await this.returnsService.create(po.id, { returnType: 'RECALL_NOT_DELIVERED' });
      await this.tasksService.create({
        poId: po.id,
        taskType: TaskType.RETURN_CN,
        ownerId: po.overallOwnerId,
        status: 'OPEN',
        slaDueAt: new Date(),
        notes: 'PO expired without delivery - confirm recall and raise Credit Note.',
      });
      this.logger.log(`Auto-recalled expired undelivered PO ${po.poNumber}`);
    }
  }
}
