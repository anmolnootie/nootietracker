import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';

import { POMasterEntity } from '../../database/entities/po-master.entity';
import { POLineItemEntity } from '../../database/entities/po-line-item.entity';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { LogisticsTrackerEntity } from '../../database/entities/logistics-tracker.entity';
import { GRNTrackerEntity } from '../../database/entities/grn-tracker.entity';
import { TaskEntity } from '../../database/entities/task.entity';
import { CustomerMasterEntity } from '../../database/entities/customer-master.entity';
import { TransporterMasterEntity } from '../../database/entities/transporter-master.entity';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';

import { CreatePORequest, POStatus, TaskType } from '@po-control-tower/shared';
import { StatusEngine } from '../../engines/status.engine';
import { RiskEngine } from '../../engines/risk.engine';
import { DispatchPlanningEngine } from '../../engines/dispatch-planning.engine';

@Injectable()
export class POService {
  constructor(
    @InjectRepository(POMasterEntity)
    private poRepository: Repository<POMasterEntity>,

    @InjectRepository(POLineItemEntity)
    private poLineItemRepository: Repository<POLineItemEntity>,

    @InjectRepository(AppointmentEntity)
    private appointmentRepository: Repository<AppointmentEntity>,

    @InjectRepository(DispatchEntity)
    private dispatchRepository: Repository<DispatchEntity>,

    @InjectRepository(LogisticsTrackerEntity)
    private logisticsRepository: Repository<LogisticsTrackerEntity>,

    @InjectRepository(GRNTrackerEntity)
    private grnRepository: Repository<GRNTrackerEntity>,

    @InjectRepository(TaskEntity)
    private taskRepository: Repository<TaskEntity>,

    @InjectRepository(CustomerMasterEntity)
    private customerRepository: Repository<CustomerMasterEntity>,

    @InjectRepository(TransporterMasterEntity)
    private transporterRepository: Repository<TransporterMasterEntity>,

    @InjectRepository(AuditLogEntity)
    private auditLogRepository: Repository<AuditLogEntity>,

    private statusEngine: StatusEngine,
    private riskEngine: RiskEngine,
    private dispatchPlanningEngine: DispatchPlanningEngine,
  ) {}

  /**
   * Create a new PO
   * This is the "PO Compilation" step where minimal data is entered:
   * - PO Date, Expiry Date, Location, Value, SKU list
   */
  async createPO(createPODto: CreatePORequest, userId: string): Promise<POMasterEntity> {
    // Check if PO number already exists
    const existing = await this.poRepository.findOneBy({
      poNumber: createPODto.poNumber,
    });

    if (existing) {
      throw new ConflictException(`PO ${createPODto.poNumber} already exists`);
    }

    // Validate required fields
    if (!createPODto.poNumber || !createPODto.poDate || !createPODto.poExpiryDate) {
      throw new BadRequestException('Missing required fields');
    }

    if (new Date(createPODto.poExpiryDate) <= new Date(createPODto.poDate)) {
      throw new BadRequestException('PO Expiry Date must be after PO Date');
    }

    if (!createPODto.lineItems || createPODto.lineItems.length === 0) {
      throw new BadRequestException('PO must have at least one line item');
    }

    // Create PO entity
    const po = this.poRepository.create({
      id: uuid(),
      poNumber: createPODto.poNumber,
      poDate: new Date(createPODto.poDate),
      poExpiryDate: new Date(createPODto.poExpiryDate),
      channelId: createPODto.channelId,
      customerId: createPODto.customerId,
      location: createPODto.location,
      poValue: createPODto.poValue,
      overallOwnerId: userId, // Initially assigned to the user creating it
      status: POStatus.RECEIVED,
      riskStatus: 'GREEN',
      lastStatusChangeAt: new Date(),
    });

    const savedPO = await this.poRepository.save(po);

    // Create line items and check availability
    for (const lineItem of createPODto.lineItems) {
      await this.poLineItemRepository.save({
        id: uuid(),
        poId: savedPO.id,
        skuCode: lineItem.skuCode,
        skuName: lineItem.skuName,
        quantity: lineItem.quantity,
        availability: 'NOT_AVAILABLE', // Will be checked/updated by warehouse
      });
    }

    // Create Appointment record (automatically starts appointment tracking)
    await this.appointmentRepository.save({
      id: uuid(),
      poId: savedPO.id,
      requestedAt: null,
      confirmedAt: null,
      slaStatus: 'ON_TIME',
    });

    // Calculate and create Dispatch record
    const transporter = await this.transporterRepository.findOne({
      where: { name: 'DEFAULT' }, // Fallback to default transporter
    });

    const transitTimeDays = transporter?.transitTimeDays || 2;

    const dispatch = await this.dispatchRepository.save({
      id: uuid(),
      poId: savedPO.id,
      idealDispatchDate: this.dispatchPlanningEngine.calculateIdealDispatchDate(
        new Date(createPODto.poDate),
        transitTimeDays,
      ),
      latestSafeDispatchDate: this.dispatchPlanningEngine.calculateLatestSafeDispatchDate(
        new Date(createPODto.poExpiryDate),
        3, // appointment requirement days
        transitTimeDays,
        1, // safety buffer
      ),
    });

    // Create task for appointment
    await this.taskRepository.save({
      id: uuid(),
      poId: savedPO.id,
      taskType: TaskType.APPOINTMENT,
      ownerId: userId,
      status: 'OPEN',
      slaDueAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours SLA
    });

    // Recompute risk
    await this.recomputeRisk(savedPO.id);

    return this.getPOById(savedPO.id);
  }

  async getPOById(poId: string): Promise<POMasterEntity> {
    const po = await this.poRepository.findOneBy({ id: poId });
    if (!po) {
      throw new NotFoundException(`PO ${poId} not found`);
    }
    return po;
  }

  async getAllPOs(filters?: {
    channelId?: string;
    customerId?: string;
    status?: POStatus;
    risk?: string;
  }): Promise<POMasterEntity[]> {
    let query = this.poRepository.createQueryBuilder('po');

    if (filters?.channelId) {
      query = query.where('po.channelId = :channelId', { channelId: filters.channelId });
    }
    if (filters?.customerId) {
      query = query.andWhere('po.customerId = :customerId', { customerId: filters.customerId });
    }
    if (filters?.status) {
      query = query.andWhere('po.status = :status', { status: filters.status });
    }
    if (filters?.risk) {
      query = query.andWhere('po.riskStatus = :risk', { risk: filters.risk });
    }

    return query.orderBy('po.priorityScore', 'DESC').addOrderBy('po.poExpiryDate', 'ASC').getMany();
  }

  async getPOLineItems(poId: string): Promise<POLineItemEntity[]> {
    return this.poLineItemRepository.findBy({ poId });
  }

  /**
   * Request appointment for a PO
   */
  async requestAppointment(poId: string): Promise<AppointmentEntity> {
    const appointment = await this.appointmentRepository.findOneBy({ poId });
    if (!appointment) {
      throw new NotFoundException('Appointment record not found');
    }

    appointment.requestedAt = new Date();
    return this.appointmentRepository.save(appointment);
  }

  /**
   * Confirm appointment for a PO
   */
  async confirmAppointment(
    poId: string,
    appointmentDate: Date,
  ): Promise<AppointmentEntity> {
    const appointment = await this.appointmentRepository.findOneBy({ poId });
    if (!appointment) {
      throw new NotFoundException('Appointment record not found');
    }

    appointment.confirmedAt = new Date();
    appointment.appointmentDate = new Date(appointmentDate);

    const saved = await this.appointmentRepository.save(appointment);

    // Recompute PO status and risk
    await this.recomputeStatus(poId);
    await this.recomputeRisk(poId);

    return saved;
  }

  /**
   * Mark PO as dispatched
   */
  async markDispatched(
    poId: string,
    docketNumber: string,
    transporterId: string,
  ): Promise<DispatchEntity> {
    const dispatch = await this.dispatchRepository.findOneBy({ poId });
    if (!dispatch) {
      throw new NotFoundException('Dispatch record not found');
    }

    dispatch.actualDispatchDate = new Date();
    dispatch.docketNumber = docketNumber;
    dispatch.transporterId = transporterId;

    const saved = await this.dispatchRepository.save(dispatch);

    // Create logistics tracker
    await this.logisticsRepository.save({
      id: uuid(),
      poId,
      docketNumber,
      transporterId,
      lastTrackedStatus: 'DISPATCHED',
      lastUpdateTime: new Date(),
      receivedAndActioned: false,
    });

    // Recompute status and risk
    await this.recomputeStatus(poId);
    await this.recomputeRisk(poId);

    return saved;
  }

  /**
   * Update logistics tracking status
   */
  async updateLogisticsStatus(
    poId: string,
    status: string,
  ): Promise<LogisticsTrackerEntity> {
    const logistics = await this.logisticsRepository.findOneBy({ poId });
    if (!logistics) {
      throw new NotFoundException('Logistics record not found');
    }

    logistics.lastTrackedStatus = status;
    logistics.lastUpdateTime = new Date();
    logistics.hoursWithoutMovement = 0;

    const saved = await this.logisticsRepository.save(logistics);

    // Recompute status and risk
    await this.recomputeStatus(poId);

    return saved;
  }

  /**
   * Mark AVV as received and actioned
   */
  async markAVVReceived(poId: string): Promise<LogisticsTrackerEntity> {
    const logistics = await this.logisticsRepository.findOneBy({ poId });
    if (!logistics) {
      throw new NotFoundException('Logistics record not found');
    }

    logistics.receivedAndActioned = true;
    logistics.receivedAndActionedAt = new Date();

    return this.logisticsRepository.save(logistics);
  }

  /**
   * Record GRN
   */
  async recordGRN(
    poId: string,
    grnData: {
      grnNumber: string;
      grnValue: number;
      outcome: string;
      discrepancyReason?: string;
      discrepancyAmount?: number;
    },
  ): Promise<GRNTrackerEntity> {
    const grn = await this.grnRepository.findOneBy({ poId });
    if (!grn) {
      throw new NotFoundException('GRN record not found');
    }

    grn.grnNumber = grnData.grnNumber;
    grn.grnValue = grnData.grnValue;
    grn.grnDate = new Date();
    grn.outcome = grnData.outcome as any;
    grn.discrepancyReason = grnData.discrepancyReason;
    grn.discrepancyAmount = grnData.discrepancyAmount;

    const saved = await this.grnRepository.save(grn);

    // Recompute status and risk
    await this.recomputeStatus(poId);
    await this.recomputeRisk(poId);

    return saved;
  }

  /**
   * Recompute PO status based on current state
   */
  async recomputeStatus(poId: string): Promise<void> {
    const po = await this.getPOById(poId);
    const appointment = await this.appointmentRepository.findOneBy({ poId });
    const dispatch = await this.dispatchRepository.findOneBy({ poId });
    const logistics = await this.logisticsRepository.findOneBy({ poId });
    const grn = await this.grnRepository.findOneBy({ poId });

    const newStatus = this.statusEngine.deriveStatus(po, appointment, dispatch, logistics, grn);

    if (newStatus !== po.status) {
      po.status = newStatus;
      po.lastStatusChangeAt = new Date();
      await this.poRepository.save(po);
    }
  }

  /**
   * Recompute PO risk based on current state
   */
  async recomputeRisk(poId: string): Promise<void> {
    const po = await this.getPOById(poId);
    const daysToExpiry = this.riskEngine.getDaysToExpiry(po.poExpiryDate);

    const dispatch = await this.dispatchRepository.findOneBy({ poId });
    const hasDelays = dispatch && dispatch.latestSafeDispatchDate < new Date() && !dispatch.actualDispatchDate;

    const { riskStatus, priorityScore } = this.riskEngine.computeRisk(
      po,
      daysToExpiry,
      po.status,
      hasDelays,
      false, // hasDiscrepancies (would need to check GRN)
    );

    po.riskStatus = riskStatus;
    po.priorityScore = priorityScore;
    await this.poRepository.save(po);
  }

  /**
   * Get PO dashboard metrics
   */
  async getDashboardMetrics(): Promise<any> {
    const allPOs = await this.poRepository.find();

    const metrics = {
      totalPOs: allPOs.length,
      byRisk: {
        black: allPOs.filter(p => p.riskStatus === 'BLACK').length,
        red: allPOs.filter(p => p.riskStatus === 'RED').length,
        orange: allPOs.filter(p => p.riskStatus === 'ORANGE').length,
        yellow: allPOs.filter(p => p.riskStatus === 'YELLOW').length,
        green: allPOs.filter(p => p.riskStatus === 'GREEN').length,
      },
      byStatus: {
        received: allPOs.filter(p => p.status === POStatus.RECEIVED).length,
        appointmentRequested: allPOs.filter(p => p.status === POStatus.APPOINTMENT_REQUESTED).length,
        appointmentConfirmed: allPOs.filter(p => p.status === POStatus.APPOINTMENT_CONFIRMED).length,
        readyForDispatch: allPOs.filter(p => p.status === POStatus.READY_FOR_DISPATCH).length,
        dispatched: allPOs.filter(p => p.status === POStatus.DISPATCHED).length,
        inTransit: allPOs.filter(p => p.status === POStatus.IN_TRANSIT).length,
        delivered: allPOs.filter(p => p.status === POStatus.DELIVERED).length,
        grnPending: allPOs.filter(p => p.status === POStatus.GRN_PENDING).length,
        reconciled: allPOs.filter(p => p.status === POStatus.RECONCILED).length,
        closed: allPOs.filter(p => p.status === POStatus.CLOSED).length,
      },
      totalValue: allPOs.reduce((sum, p) => sum + p.poValue, 0),
      expiringToday: allPOs.filter(p => {
        const daysToExpiry = this.riskEngine.getDaysToExpiry(p.poExpiryDate);
        return daysToExpiry < 1;
      }).length,
    };

    return metrics;
  }
}
