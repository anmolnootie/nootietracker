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

/** Maps the free-text status the master tracker sheet uses onto the tracker's own status values. */
function trackedStatusFromSheet(raw: string | null): string {
  const s = (raw ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  return s === 'DELIVERED' ? 'DELIVERED' : s === 'INTRANSIT' ? 'IN_TRANSIT' : 'DISPATCHED';
}

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
   * An appointment task escalates once its SLA passes, and that used to be the last
   * step - nothing closed it when the reason went away. Close any that are moot: the
   * PO is no longer open, a slot has been booked (the queue would otherwise show POs
   * that already have an appointment), or the PO has already shipped.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async closeMootAppointmentTasks() {
    const tasks = await this.tasksService.findUnresolvedByType(TaskType.APPOINTMENT);
    for (const task of tasks) {
      const [po, appointment, dispatch] = await Promise.all([
        this.poRepository.findOneBy({ id: task.poId }),
        this.appointmentRepository.findOneBy({ poId: task.poId }),
        this.dispatchRepository.findOneBy({ poId: task.poId }),
      ]);
      let reason: string | null = null;
      if (!po || po.isDeleted || TERMINAL_STATUSES.includes(po.status)) reason = 'the PO is no longer open';
      else if (appointment?.confirmedAt || appointment?.appointmentDate) reason = 'an appointment is booked';
      else if (dispatch?.actualDispatchDate) reason = 'the PO has already been dispatched';
      if (reason) await this.tasksService.complete(task.id, `Closed automatically - ${reason}.`);
    }
  }

  /**
   * Dispatched-shipment Rule: a logistics tracking row is only created by a manual
   * dispatch on the PO screen (or a bulk-import delivery), so a PO the master tracker
   * sheet dispatches was missing from Logistics Tracking - and from the AVV follow-up
   * below, which runs off these rows. Any dispatched PO whose GRN isn't recorded yet
   * (in transit, or delivered and awaiting GRN) gets one; shipments with a GRN or in a
   * terminal status need no tracking. A shipment the sheet has since marked Delivered
   * is moved on to DELIVERED so the page doesn't keep showing it in transit.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async dispatchedShipmentsTrackingCheck() {
    const untracked = await this.dispatchRepository
      .createQueryBuilder('dsp')
      .innerJoinAndSelect('dsp.po', 'po')
      .leftJoin(LogisticsTrackerEntity, 'l', 'l.poId = dsp.poId')
      .leftJoin(GRNTrackerEntity, 'g', 'g.poId = dsp.poId')
      .where('po.isDeleted = false')
      .andWhere('po.status NOT IN (:...terminal)', { terminal: TERMINAL_STATUSES })
      .andWhere('dsp.actualDispatchDate IS NOT NULL')
      .andWhere('l.id IS NULL')
      .andWhere('g.grnDate IS NULL')
      .getMany();

    let created = 0;
    for (const dsp of untracked) {
      // The tracker is keyed on the docket; a dispatch with none can't be tracked yet.
      const docketNumber = (dsp.awbNumber || dsp.docketNumber || '').trim();
      if (!docketNumber) continue;
      await this.logisticsRepository.save(
        this.logisticsRepository.create({
          poId: dsp.poId,
          docketNumber,
          transporterId: dsp.transporterId || 'UNKNOWN',
          lastTrackedStatus: trackedStatusFromSheet(dsp.dispatchStatus),
          // When we last heard about this shipment - not "now", or an old
          // shipment would look freshly updated and dodge the STALE flag.
          lastUpdateTime: dsp.updatedAt,
          receivedAndActioned: false,
        }),
      );
      created++;
    }
    if (created) this.logger.log(`Added ${created} dispatched shipment(s) to Logistics Tracking`);

    const nowDelivered = await this.logisticsRepository
      .createQueryBuilder('l')
      .innerJoin(DispatchEntity, 'dsp', 'dsp.poId = l.poId')
      .where(`UPPER(TRIM(dsp.dispatchStatus)) = 'DELIVERED'`)
      .andWhere(`l.lastTrackedStatus IS DISTINCT FROM 'DELIVERED'`)
      .getMany();
    for (const tracker of nowDelivered) {
      tracker.lastTrackedStatus = 'DELIVERED';
      tracker.lastUpdateTime = new Date();
      await this.logisticsRepository.save(tracker);
    }
    if (nowDelivered.length) this.logger.log(`Marked ${nowDelivered.length} shipment(s) delivered per the master tracker`);
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
    // "No slot booked" = no appointment date. The bulk import and the master tracker
    // sheet both record a booked slot as an appointment date, and the sheet doesn't
    // stamp confirmedAt, so checking confirmedAt alone flags POs that do have a slot.
    const appointments = await this.appointmentRepository.find({
      where: { confirmedAt: IsNull(), appointmentDate: IsNull(), extensionRequested: false },
    });
    for (const appointment of appointments) {
      const po = await this.poRepository.findOneBy({ id: appointment.poId });
      if (!po || TERMINAL_STATUSES.includes(po.status)) continue;

      const daysToExpiry = Math.ceil((po.poExpiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysToExpiry > 4 || daysToExpiry < 0) continue;

      // Already shipped - the appointment is behind it, an extension can't matter.
      const dispatch = await this.dispatchRepository.findOneBy({ poId: po.id });
      if (dispatch?.actualDispatchDate) continue;

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
   * Delivered-awaiting-GRN Rule: only logistics tracking creates a GRN record and
   * task when a PO is delivered. A PO the master tracker sheet marks Delivered never
   * goes through that, so it had neither and never reached the GRN Queue. Whatever
   * the source, a delivered PO with no GRN recorded gets a tracker and an open task.
   * Tasks are created quietly and each owner gets one summary notification, so a
   * first run over a large backlog doesn't send hundreds.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async deliveredAwaitingGrnCheck() {
    const pending = await this.poRepository
      .createQueryBuilder('po')
      .leftJoin(DispatchEntity, 'dsp', 'dsp.poId = po.id')
      .leftJoin(GRNTrackerEntity, 'g', 'g.poId = po.id')
      .where('po.isDeleted = false')
      .andWhere('po.status NOT IN (:...terminal)', { terminal: TERMINAL_STATUSES })
      .andWhere(`(UPPER(TRIM(dsp.dispatchStatus)) = 'DELIVERED' OR po.status IN (:...delivered))`, {
        delivered: [POStatus.DELIVERED, POStatus.GRN_PENDING],
      })
      .andWhere('g.grnDate IS NULL')
      .andWhere(`NOT EXISTS (SELECT 1 FROM tasks t WHERE t."poId" = po.id AND t."taskType" = :grn AND t.status <> 'COMPLETED')`, { grn: TaskType.GRN })
      .getMany();
    if (pending.length === 0) return;

    const perOwner = new Map<string, number>();
    for (const po of pending) {
      if (!(await this.grnRepository.findOneBy({ poId: po.id }))) {
        await this.grnRepository.save(this.grnRepository.create({ poId: po.id, slaStatus: 'ON_TIME' }));
      }
      const ownerId = po.grnOwnerId || po.overallOwnerId;
      await this.tasksService.create(
        {
          poId: po.id,
          taskType: TaskType.GRN,
          ownerId,
          status: 'OPEN',
          slaDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          notes: 'PO delivered - record GRN outcome.',
        },
        false,
      );
      if (ownerId) perOwner.set(ownerId, (perOwner.get(ownerId) ?? 0) + 1);
    }

    for (const [userId, count] of perOwner) {
      await this.notificationsService.notify({
        userId,
        type: 'TASK_CREATED',
        title: 'POs awaiting GRN',
        message: `${count} delivered PO${count === 1 ? '' : 's'} ${count === 1 ? 'is' : 'are'} awaiting GRN - see the GRN Queue`,
      });
    }
    this.logger.log(`Queued ${pending.length} delivered PO(s) for GRN`);
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

      const openTask = await this.tasksService.findUnresolvedByPoAndType(grn.poId, TaskType.GRN);
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
