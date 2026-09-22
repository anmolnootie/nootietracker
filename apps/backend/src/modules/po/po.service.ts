import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';

import { POMasterEntity } from '../../database/entities/po-master.entity';
import { POLineItemEntity } from '../../database/entities/po-line-item.entity';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { LogisticsTrackerEntity } from '../../database/entities/logistics-tracker.entity';
import { GRNTrackerEntity } from '../../database/entities/grn-tracker.entity';
import { ReturnTrackerEntity } from '../../database/entities/return-tracker.entity';
import { TaskEntity } from '../../database/entities/task.entity';
import { CustomerMasterEntity } from '../../database/entities/customer-master.entity';
import { TransporterMasterEntity } from '../../database/entities/transporter-master.entity';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import { POChangeHistoryEntity } from '../../database/entities/po-change-history.entity';
import { BulkPOProcessedRowEntity } from '../../database/entities/bulk-processed-row.entity';
import { UploadBatchEntity } from '../../database/entities/upload-batch.entity';
import { PODeletionAuditEntity } from '../../database/entities/po-deletion-audit.entity';

import {
  CreatePORequest,
  POStatus,
  RiskStatus,
  TaskType,
  GRNOutcome,
  LocationType,
  FulfilmentStatus,
  FulfilmentDecision,
  NonFulfilmentReason,
  ExceptionResolutionStatus,
  DispatchPlanStatus,
  LOW_PO_VALUE_THRESHOLD,
  POMappingStatus,
} from '@po-control-tower/shared';
import { StatusEngine } from '../../engines/status.engine';
import { RiskEngine } from '../../engines/risk.engine';
import { DispatchPlanningEngine } from '../../engines/dispatch-planning.engine';
import { LocationDispatchEngine } from '../../engines/location-dispatch.engine';
import { FulfilmentStatusEngine } from '../../engines/fulfilment-status.engine';
import { TasksService } from '../tasks/tasks.service';
import { ReturnsService } from '../returns/returns.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LocationsService } from '../locations/locations.service';
import { ExceptionsService } from '../exceptions/exceptions.service';
import { DocumentsService } from '../documents/documents.service';
import { POMappingService } from '../po-mapping/po-mapping.service';
import { EditPORequest } from './edit-po.dto';

/** Fields that trigger the "core PO info" confirmation dialog on the frontend before save. */
export const SENSITIVE_PO_FIELDS = ['poNumber', 'poDate', 'channelId', 'location', 'quantity'];

export interface InventoryRow {
  skuCode: string;
  upc: string | null;
  name: string;
  unitsOrdered: number;
  unitsDispatched: number;
  unitsAvailable: number;
  unitsPending: number;
  totalValue: number;
  poCount: number;
  fulfilmentPercent: number;
}

@Injectable()
export class POService {
  constructor(
    @InjectRepository(POMasterEntity)
    private readonly poRepository: Repository<POMasterEntity>,

    @InjectRepository(POLineItemEntity)
    private readonly poLineItemRepository: Repository<POLineItemEntity>,

    @InjectRepository(AppointmentEntity)
    private readonly appointmentRepository: Repository<AppointmentEntity>,

    @InjectRepository(DispatchEntity)
    private readonly dispatchRepository: Repository<DispatchEntity>,

    @InjectRepository(LogisticsTrackerEntity)
    private readonly logisticsRepository: Repository<LogisticsTrackerEntity>,

    @InjectRepository(GRNTrackerEntity)
    private readonly grnRepository: Repository<GRNTrackerEntity>,

    @InjectRepository(ReturnTrackerEntity)
    private readonly returnRepository: Repository<ReturnTrackerEntity>,

    @InjectRepository(TaskEntity)
    private readonly taskRepository: Repository<TaskEntity>,

    @InjectRepository(CustomerMasterEntity)
    private readonly customerRepository: Repository<CustomerMasterEntity>,

    @InjectRepository(TransporterMasterEntity)
    private readonly transporterRepository: Repository<TransporterMasterEntity>,

    @InjectRepository(AuditLogEntity)
    private readonly auditLogRepository: Repository<AuditLogEntity>,

    @InjectRepository(POChangeHistoryEntity)
    private readonly changeHistoryRepository: Repository<POChangeHistoryEntity>,

    @InjectRepository(BulkPOProcessedRowEntity)
    private readonly bulkProcessedRowRepository: Repository<BulkPOProcessedRowEntity>,

    @InjectRepository(UploadBatchEntity)
    private readonly uploadBatchRepository: Repository<UploadBatchEntity>,

    @InjectRepository(PODeletionAuditEntity)
    private readonly deletionAuditRepository: Repository<PODeletionAuditEntity>,

    private readonly statusEngine: StatusEngine,
    private readonly riskEngine: RiskEngine,
    private readonly dispatchPlanningEngine: DispatchPlanningEngine,
    private readonly locationDispatchEngine: LocationDispatchEngine,
    private readonly tasksService: TasksService,
    private readonly returnsService: ReturnsService,
    private readonly notificationsService: NotificationsService,
    private readonly locationsService: LocationsService,
    private readonly exceptionsService: ExceptionsService,
    private readonly fulfilmentStatusEngine: FulfilmentStatusEngine,
    private readonly documentsService: DocumentsService,
    private readonly poMappingService: POMappingService,
  ) {}

  /** Pre-flight check before creating a PO, so the UI can show "this already exists" with real options instead of a generic error after submit. */
  async checkDuplicate(poNumber: string): Promise<{ exists: boolean; po?: POMasterEntity }> {
    const existing = await this.poRepository.findOneBy({ poNumber });
    return existing ? { exists: true, po: existing } : { exists: false };
  }

  async createPO(createPODto: CreatePORequest, userId: string): Promise<POMasterEntity> {
    const existing = await this.poRepository.findOneBy({ poNumber: createPODto.poNumber });
    if (existing) {
      throw new ConflictException(`PO ${createPODto.poNumber} already exists`);
    }

    if (!createPODto.poNumber || !createPODto.poDate || !createPODto.poExpiryDate) {
      throw new BadRequestException('Missing required fields');
    }

    if (new Date(createPODto.poExpiryDate) <= new Date(createPODto.poDate)) {
      throw new BadRequestException('PO Expiry Date must be after PO Date');
    }

    if (!createPODto.lineItems || createPODto.lineItems.length === 0) {
      throw new BadRequestException('PO must have at least one line item');
    }

    const po = new POMasterEntity();
    po.poNumber = createPODto.poNumber;
    po.poDate = new Date(createPODto.poDate);
    po.poExpiryDate = new Date(createPODto.poExpiryDate);
    po.channelId = createPODto.channelId;
    po.customerId = createPODto.customerId;
    po.location = createPODto.location;
    po.poValue = createPODto.poValue;
    po.overallOwnerId = userId;
    po.status = POStatus.RECEIVED;
    po.riskStatus = RiskStatus.GREEN;
    po.priorityScore = 0;
    po.lastStatusChangeAt = new Date();

    const savedPO = await this.poRepository.save(po);

    for (const lineItem of createPODto.lineItems) {
      const item = new POLineItemEntity();
      item.poId = savedPO.id;
      item.skuCode = lineItem.skuCode;
      item.skuName = lineItem.skuName;
      item.quantity = lineItem.quantity;
      item.mrp = lineItem.mrp ?? null;
      item.upc = lineItem.upc ?? null;
      item.unitPrice = lineItem.unitPrice ?? null;
      item.availability = 'NOT_AVAILABLE';
      await this.poLineItemRepository.save(item);
    }

    const appointment = new AppointmentEntity();
    appointment.poId = savedPO.id;
    appointment.requestedAt = null;
    appointment.confirmedAt = null;
    appointment.slaStatus = 'ON_TIME';
    await this.appointmentRepository.save(appointment);

    const transporter = await this.transporterRepository.findOne({ where: { name: 'DEFAULT' } });
    const transitTimeDays = transporter?.transitTimeDays || 2;

    const dispatch = new DispatchEntity();
    dispatch.poId = savedPO.id;
    dispatch.idealDispatchDate = this.dispatchPlanningEngine.calculateIdealDispatchDate(
      new Date(createPODto.poDate),
      transitTimeDays,
    );
    dispatch.latestSafeDispatchDate = this.dispatchPlanningEngine.calculateLatestSafeDispatchDate(
      new Date(createPODto.poExpiryDate),
      3,
      transitTimeDays,
      1,
    );
    await this.dispatchRepository.save(dispatch);

    await this.tasksService.create({
      poId: savedPO.id,
      taskType: TaskType.APPOINTMENT,
      ownerId: userId,
      status: 'OPEN',
      slaDueAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
    });

    // Safe to call unconditionally - recomputePOAggregates only overwrites
    // poValue once real per-line pricing exists to compute it from, so a
    // manually-entered poValue with no line pricing is left untouched.
    await this.recomputePOAggregates(savedPO.id);
    await this.recomputeRisk(savedPO.id);
    await this.recomputeDispatchPlan(savedPO.id);
    return this.getPOById(savedPO.id);
  }

  /**
   * Dynamic Dispatch Date Engine: recomputes the LOCAL/NON-LOCAL dispatch window
   * from the Location Master + PO expiry every time it's called - never treat a
   * previously-stored dispatch date as final, since expiry, location, or TAT
   * config can all change after the fact.
   */
  async recomputeDispatchPlan(poId: string, preloaded?: { po?: POMasterEntity; dispatch?: DispatchEntity | null }): Promise<void> {
    const po = preloaded?.po ?? (await this.getPOById(poId));
    const dispatch = preloaded ? preloaded.dispatch ?? null : await this.dispatchRepository.findOneBy({ poId });
    if (!dispatch) return;

    const { location } = await this.locationsService.classify(po.location);

    const plan = this.locationDispatchEngine.computePlan({
      poExpiryDate: po.poExpiryDate,
      poDate: po.poDate,
      locationType: location?.locationType ?? LocationType.NON_LOCAL,
      localTatHours: location?.localTatHours,
      nonLocalTatMinDays: location?.nonLocalTatMinDays,
      nonLocalTatMaxDays: location?.nonLocalTatMaxDays,
    });

    dispatch.locationType = plan.locationType;
    dispatch.tatRuleDescription = plan.tatRuleDescription;
    dispatch.dispatchWindowEarliest = plan.dispatchWindowEarliest;
    dispatch.dispatchWindowLatest = plan.dispatchWindowLatest;
    dispatch.recommendedDispatchDate = plan.recommendedDispatchDate;
    dispatch.dispatchPlanStatus = this.locationDispatchEngine.computeStatus(
      plan,
      po.poExpiryDate,
      dispatch.actualDispatchDate,
    );

    if (dispatch.actualDispatchDate) {
      const variance = this.locationDispatchEngine.computeVariance(plan.recommendedDispatchDate, dispatch.actualDispatchDate);
      dispatch.dispatchVarianceDays = variance.days;
      dispatch.dispatchVarianceLabel = variance.label;
    } else {
      dispatch.dispatchVarianceDays = null;
      dispatch.dispatchVarianceLabel = null;
    }

    await this.dispatchRepository.save(dispatch, { transaction: false }); // plain single-row save, no cascade to protect
  }

  /**
   * "Everything is editable, but nothing is silently overwritten" - for every
   * field actually present (not undefined) in `changes` that differs from the
   * current value on `entity`, apply the new value in place and return a
   * change-history row recording old -> new. Fields omitted from `changes`
   * (undefined) are left untouched; fields explicitly set to null clear the
   * value and are still recorded.
   */
  private diffAndApply<T extends Record<string, any>>(
    entity: T,
    changes: Record<string, any>,
    context: { poId: string; skuCode?: string | null; userId: string },
  ): POChangeHistoryEntity[] {
    const entries: POChangeHistoryEntity[] = [];
    const normalize = (v: any): string | null => {
      if (v === null || v === undefined) return null;
      if (v instanceof Date) return v.toISOString();
      return String(v);
    };
    // Postgres `decimal` columns come back as strings (e.g. "200.00"), so a
    // resubmitted, numerically-unchanged value (200) must not read as a diff
    // against its string form - compare numerically whenever both sides parse.
    const isNumericLike = (v: any): boolean =>
      v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v));

    for (const key of Object.keys(changes)) {
      const rawNew = changes[key];
      if (rawNew === undefined) continue;

      const rawOld = entity[key];
      let coercedNew = rawNew;
      if (rawOld instanceof Date || (rawOld === null && /Date$/.test(key))) {
        coercedNew = rawNew === null ? null : new Date(rawNew);
      }

      const oldNorm = normalize(rawOld);
      const newNorm = normalize(coercedNew);
      const changed = isNumericLike(rawOld) && isNumericLike(coercedNew)
        ? Number(rawOld) !== Number(coercedNew)
        : oldNorm !== newNorm;
      if (!changed) continue;

      entity[key as keyof T] = coercedNew;

      entries.push(
        this.changeHistoryRepository.create({
          poId: context.poId,
          skuCode: context.skuCode ?? null,
          fieldName: key,
          oldValue: oldNorm,
          newValue: newNorm,
          changeType: 'MANUAL_EDIT',
          changedByUserId: context.userId,
        }),
      );
    }
    return entries;
  }

  /** Recomputes PO-level totals/derived values from current line-item state - called after any Edit PO save. */
  private async recomputePOAggregates(poId: string): Promise<void> {
    const po = await this.getPOById(poId);
    const lineItems = await this.poLineItemRepository.findBy({ poId });

    let orderedQty = 0;
    let availableQty = 0;
    let dispatchQty = 0;
    let poValue = 0;
    let availableStockValue = 0;
    let dispatchValue = 0;
    let hasAnyPricing = false;

    for (const item of lineItems) {
      const qty = Number(item.quantity) || 0;
      const available = Number(item.availableQuantity) || 0;
      const dispatched = Number(item.dispatchedQuantity) || 0;
      // Commercial PO value is what's actually paid (unit/landing price), not
      // the consumer-facing MRP - MRP only stands in as a rough estimate when
      // no unit price is known at all, since it's typically much higher than
      // the real transacted rate and would badly inflate PO/dispatch value.
      const price = Number(item.unitPrice ?? item.mrp) || 0;
      if (item.unitPrice != null || item.mrp != null) hasAnyPricing = true;

      item.pendingQuantity = Math.max(qty - dispatched, 0);
      item.lineValue = qty * price;
      item.fulfilmentPercent = qty > 0 ? Math.min((dispatched / qty) * 100, 100) : 0;
      item.pendingPercent = qty > 0 ? Math.max(100 - item.fulfilmentPercent, 0) : 0;
      // Derived from the manually-confirmed Available Qty against what was
      // ordered - this used to only ever get set once at PO creation
      // ('NOT_AVAILABLE') and never move again even after editing Available
      // Qty, so warehouse stock confirmations silently had no visible effect.
      if (qty > 0 && available >= qty) {
        item.availability = 'AVAILABLE';
      } else if (available > 0) {
        item.availability = 'SHORT';
      } else {
        item.availability = 'NOT_AVAILABLE';
      }
      await this.poLineItemRepository.save(item);

      orderedQty += qty;
      availableQty += available;
      dispatchQty += dispatched;
      poValue += qty * price;
      availableStockValue += available * price;
      dispatchValue += dispatched * price;
    }

    // Never let an absence of pricing data (no mrp/unitPrice on any line -
    // e.g. a PO created through the plain manual form) silently zero out a
    // poValue someone actually typed in; only overwrite it once real
    // per-line pricing exists to compute a trustworthy number from.
    if (lineItems.length > 0 && hasAnyPricing) {
      po.poValue = poValue;
    }
    po.availableStockValue = availableStockValue;
    po.dispatchValue = dispatchValue;
    po.fulfilmentPercent = po.poValue > 0 ? Math.min((dispatchValue / Number(po.poValue)) * 100, 100) : 0;
    po.isLowPoValue = Number(po.poValue) < LOW_PO_VALUE_THRESHOLD;
    await this.poRepository.save(po);

    const appointment = await this.appointmentRepository.findOneBy({ poId });
    const dispatch = await this.dispatchRepository.findOneBy({ poId });
    const fulfilmentStatus = this.fulfilmentStatusEngine.compute({
      orderedQty,
      deliveredQty: dispatchQty,
      pendingQty: Math.max(orderedQty - dispatchQty, 0),
      poExpiryDate: po.poExpiryDate,
      appointmentDate: appointment?.appointmentDate ?? null,
      dispatchPlanStatus: dispatch?.dispatchPlanStatus ?? null,
      poCancelled: po.status === POStatus.CANCELLED,
    });
    if (fulfilmentStatus !== po.fulfilmentStatus) {
      po.fulfilmentStatus = fulfilmentStatus;
      await this.poRepository.save(po);
    }

    await this.recomputeFillRate(poId);
  }

  /** Invoice-value-based Fill Rate (Invoice Value / PO Value) - distinct from the dispatch-quantity-based fulfilmentPercent above. Public so Invoice Bulk Upload can call it directly after updating DispatchEntity.invoiceValue. */
  async recomputeFillRate(poId: string): Promise<void> {
    const po = await this.getPOById(poId);
    const dispatch = await this.dispatchRepository.findOneBy({ poId });
    po.fillRatePercent =
      dispatch?.invoiceValue != null && Number(po.poValue) > 0
        ? Math.min((Number(dispatch.invoiceValue) / Number(po.poValue)) * 100, 100)
        : null;
    await this.poRepository.save(po);
  }

  /**
   * The single entry point for manual edits from the PO Detail "Edit PO" screen.
   * Every changed field, across every section, is diffed against its current
   * value and written to POChangeHistoryEntity (MANUAL_EDIT) before being
   * applied - the current record just shows the new value, history keeps the
   * full old -> new trail. Sections omitted from the payload are left untouched.
   */
  async editPO(poId: string, payload: EditPORequest, userId: string): Promise<POMasterEntity> {
    const po = await this.getPOById(poId);
    const allHistory: POChangeHistoryEntity[] = [];

    if (payload.po) {
      if (payload.po.poNumber && payload.po.poNumber !== po.poNumber) {
        const clash = await this.poRepository.findOneBy({ poNumber: payload.po.poNumber });
        if (clash && clash.id !== poId) {
          throw new ConflictException(`PO ${payload.po.poNumber} already exists`);
        }
      }
      allHistory.push(...this.diffAndApply(po, payload.po as Record<string, any>, { poId, userId }));
      await this.poRepository.save(po);
    }

    if (payload.lineItems) {
      for (const li of payload.lineItems) {
        const item = await this.poLineItemRepository.findOneBy({ id: li.id, poId });
        if (!item) throw new NotFoundException(`Line item ${li.id} not found on this PO`);
        const { id, ...fields } = li;
        allHistory.push(
          ...this.diffAndApply(item, fields as Record<string, any>, { poId, skuCode: item.skuCode, userId }),
        );
        await this.poLineItemRepository.save(item);
      }
    }

    if (payload.appointment) {
      const appointment = await this.appointmentRepository.findOneBy({ poId });
      if (!appointment) throw new NotFoundException('Appointment record not found');
      allHistory.push(
        ...this.diffAndApply(appointment, payload.appointment as Record<string, any>, { poId, userId }),
      );
      await this.appointmentRepository.save(appointment);
    }

    if (payload.dispatch) {
      const dispatch = await this.dispatchRepository.findOneBy({ poId });
      if (!dispatch) throw new NotFoundException('Dispatch record not found');
      allHistory.push(...this.diffAndApply(dispatch, payload.dispatch as Record<string, any>, { poId, userId }));
      await this.dispatchRepository.save(dispatch);
    }

    if (payload.logistics) {
      const logistics = await this.logisticsRepository.findOneBy({ poId });
      if (!logistics) throw new NotFoundException('Logistics record not found');
      allHistory.push(
        ...this.diffAndApply(logistics, payload.logistics as Record<string, any>, { poId, userId }),
      );
      await this.logisticsRepository.save(logistics);
    }

    if (payload.grn) {
      let grn = await this.grnRepository.findOneBy({ poId });
      if (!grn) {
        grn = this.grnRepository.create({ poId, slaStatus: 'ON_TIME' });
      }
      allHistory.push(...this.diffAndApply(grn, payload.grn as Record<string, any>, { poId, userId }));
      await this.grnRepository.save(grn);
    }

    if (payload.returnRecord) {
      let returnRecord = await this.returnRepository.findOneBy({ poId });
      if (!returnRecord) {
        returnRecord = this.returnRepository.create({ poId, returnDate: new Date(), returnType: 'SHORTAGE' as any });
      }
      allHistory.push(
        ...this.diffAndApply(returnRecord, payload.returnRecord as Record<string, any>, { poId, userId }),
      );
      await this.returnRepository.save(returnRecord);
    }

    if (allHistory.length > 0) {
      await this.changeHistoryRepository.save(allHistory);
    }

    await this.recomputePOAggregates(poId);
    await this.recomputeStatus(poId);
    await this.recomputeRisk(poId);
    await this.recomputeDispatchPlan(poId);

    return this.getPOById(poId);
  }

  async getChangeHistory(poId: string): Promise<POChangeHistoryEntity[]> {
    return this.changeHistoryRepository.find({ where: { poId }, order: { changedAt: 'DESC' } });
  }

  /** "Where did this data come from?" - every field on a bulk-imported PO traces back to its source file/batch. */
  async getSourceTraceability(poId: string) {
    const po = await this.getPOById(poId);
    if (po.sourceType !== 'BULK_IMPORT') {
      return { sourceType: po.sourceType, batches: [], contributingRows: [] };
    }

    const contributingRows = await this.bulkProcessedRowRepository.find({
      where: { matchedPoId: poId },
      order: { createdAt: 'ASC' },
    });
    const batchIds = [...new Set(contributingRows.map((r) => r.batchId))];
    const batches = batchIds.length ? await this.uploadBatchRepository.findBy({ id: In(batchIds) }) : [];

    return { sourceType: po.sourceType, batches, contributingRows };
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
    view?: 'active' | 'at_risk' | 'expiring_soon' | 'low_value' | 'not_fulfilled';
    search?: string;
    location?: string;
    dateField?: 'poDate' | 'expiry' | 'dispatch' | 'appointment' | 'invoice';
    dateFrom?: string;
    dateTo?: string;
    valueMin?: number;
    valueMax?: number;
    fulfilmentDecision?: string;
    fulfilmentStatus?: string;
    sourceType?: string;
    invoiced?: 'yes' | 'no';
    reattempt?: 'yes' | 'no';
  }): Promise<POMasterEntity[]> {
    // Deleted POs live in the Bin, not in any regular PO view.
    let query = this.poRepository
      .createQueryBuilder('po')
      .leftJoin(DispatchEntity, 'dsp', 'dsp.poId = po.id')
      .leftJoin(AppointmentEntity, 'apt', 'apt.poId = po.id')
      .where('po.isDeleted = false');

    if (filters?.channelId) {
      query = query.andWhere('po.channelId = :channelId', { channelId: filters.channelId });
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
    if (filters?.location) {
      query = query.andWhere('po.location = :location', { location: filters.location });
    }
    if (filters?.search?.trim()) {
      query = query.andWhere(
        '(po.poNumber ILIKE :search OR po.location ILIKE :search OR po.channelId ILIKE :search OR dsp.invoiceNumber ILIKE :search OR dsp.awbNumber ILIKE :search)',
        { search: `%${filters.search.trim()}%` },
      );
    }

    // Date range on whichever date the person picked. Compared as plain dates
    // (not timestamps) so "to" is inclusive of the whole day and server
    // timezone never shifts a boundary.
    const dateColumns: Record<string, string> = {
      poDate: 'po.poDate',
      expiry: 'po.poExpiryDate',
      dispatch: 'dsp.actualDispatchDate',
      appointment: 'apt.appointmentDate',
      invoice: 'dsp.invoiceDate',
    };
    const dateColumn = dateColumns[filters?.dateField ?? 'poDate'] ?? dateColumns.poDate;
    if (filters?.dateFrom) {
      query = query.andWhere(`CAST(${dateColumn} AS date) >= :dateFrom`, { dateFrom: filters.dateFrom });
    }
    if (filters?.dateTo) {
      query = query.andWhere(`CAST(${dateColumn} AS date) <= :dateTo`, { dateTo: filters.dateTo });
    }

    if (filters?.valueMin != null && !Number.isNaN(filters.valueMin)) {
      query = query.andWhere('po.poValue >= :valueMin', { valueMin: filters.valueMin });
    }
    if (filters?.valueMax != null && !Number.isNaN(filters.valueMax)) {
      query = query.andWhere('po.poValue <= :valueMax', { valueMax: filters.valueMax });
    }
    if (filters?.fulfilmentDecision) {
      query = query.andWhere('po.fulfilmentDecision = :fulfilmentDecision', { fulfilmentDecision: filters.fulfilmentDecision });
    }
    if (filters?.fulfilmentStatus) {
      query = query.andWhere('po.fulfilmentStatus = :fulfilmentStatus', { fulfilmentStatus: filters.fulfilmentStatus });
    }
    if (filters?.sourceType) {
      query = query.andWhere('po.sourceType = :sourceType', { sourceType: filters.sourceType });
    }
    if (filters?.invoiced === 'yes') {
      query = query.andWhere("dsp.invoiceNumber IS NOT NULL AND dsp.invoiceNumber <> ''");
    } else if (filters?.invoiced === 'no') {
      query = query.andWhere("(dsp.invoiceNumber IS NULL OR dsp.invoiceNumber = '')");
    }
    if (filters?.reattempt === 'yes') {
      query = query.andWhere('po.isReattemptPo = true');
    } else if (filters?.reattempt === 'no') {
      query = query.andWhere('po.isReattemptPo = false');
    }

    switch (filters?.view) {
      case 'active':
        query = query
          .andWhere('po.status NOT IN (:...terminal)', {
            terminal: [POStatus.CLOSED, POStatus.CANCELLED, POStatus.RETURNED, POStatus.RECONCILED],
          })
          .andWhere('po.fulfilmentDecision = :decision', { decision: FulfilmentDecision.FULFILLED });
        break;
      case 'at_risk':
        query = query.andWhere('po.riskStatus IN (:...risks)', { risks: [RiskStatus.RED, RiskStatus.BLACK] });
        break;
      case 'expiring_soon': {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + 3);
        query = query
          .andWhere('po.poExpiryDate <= :cutoff', { cutoff })
          .andWhere('po.poExpiryDate >= :now', { now: new Date() });
        break;
      }
      case 'low_value':
        query = query.andWhere('po.isLowPoValue = true');
        break;
      case 'not_fulfilled':
        query = query.andWhere('po.fulfilmentDecision = :decision', { decision: FulfilmentDecision.NOT_FULFILLED });
        break;
    }

    return query.orderBy('po.priorityScore', 'DESC').addOrderBy('po.poExpiryDate', 'ASC').getMany();
  }

  /** Distinct values that actually exist on live POs, so filter dropdowns offer real choices rather than free text. */
  async getFilterOptions(): Promise<{ channels: string[]; locations: string[]; customers: string[] }> {
    const distinct = async (column: 'channelId' | 'location' | 'customerId') => {
      const rows = await this.poRepository
        .createQueryBuilder('po')
        .select(`DISTINCT po.${column}`, 'value')
        .where('po.isDeleted = false')
        .orderBy('value', 'ASC')
        .getRawMany();
      return rows.map((r) => r.value).filter((v) => !!v);
    };
    return {
      channels: await distinct('channelId'),
      locations: await distinct('location'),
      customers: await distinct('customerId'),
    };
  }

  /** 🗑️ PO Bin - soft-deleted POs, recoverable until someone with permission permanently deletes them. */
  async getBin(): Promise<POMasterEntity[]> {
    return this.poRepository.find({ where: { isDeleted: true }, order: { deletedAt: 'DESC' } });
  }

  async softDeletePO(poId: string, userId: string): Promise<POMasterEntity> {
    const po = await this.getPOById(poId);
    if (po.isDeleted) {
      throw new BadRequestException('PO is already in the Bin');
    }
    po.isDeleted = true;
    po.deletedAt = new Date();
    po.deletedByUserId = userId;
    return this.poRepository.save(po);
  }

  /**
   * One bad/already-deleted id in the batch shouldn't abort the rest - each PO
   * is soft-deleted independently and failures are reported back per-id,
   * rather than the whole selection failing on the first problem row.
   */
  async bulkSoftDeletePO(poIds: string[], userId: string): Promise<{ deleted: string[]; failed: { poId: string; reason: string }[] }> {
    const deleted: string[] = [];
    const failed: { poId: string; reason: string }[] = [];
    for (const poId of poIds) {
      try {
        await this.softDeletePO(poId, userId);
        deleted.push(poId);
      } catch (err: any) {
        failed.push({ poId, reason: err?.message || 'Failed to delete' });
      }
    }
    return { deleted, failed };
  }

  async restorePO(poId: string): Promise<POMasterEntity> {
    const po = await this.getPOById(poId);
    if (!po.isDeleted) {
      throw new BadRequestException('PO is not in the Bin');
    }
    po.isDeleted = false;
    po.deletedAt = null;
    po.deletedByUserId = null;
    return this.poRepository.save(po);
  }

  async bulkRestorePO(poIds: string[]): Promise<{ restored: string[]; failed: { poId: string; reason: string }[] }> {
    const restored: string[] = [];
    const failed: { poId: string; reason: string }[] = [];
    for (const poId of poIds) {
      try {
        await this.restorePO(poId);
        restored.push(poId);
      } catch (err: any) {
        failed.push({ poId, reason: err?.message || 'Failed to restore' });
      }
    }
    return { restored, failed };
  }

  /**
   * Hard delete. A minimal PODeletionAuditEntity row is written first, with no
   * FK back to the PO, specifically so it survives the row being gone - this
   * is what stops someone from silently erasing a PO's existence entirely.
   */
  async permanentlyDeletePO(poId: string, userId: string, reason?: string): Promise<void> {
    const po = await this.getPOById(poId);
    if (!po.isDeleted) {
      throw new BadRequestException('Only POs already in the Bin can be permanently deleted');
    }

    await this.deletionAuditRepository.save(
      this.deletionAuditRepository.create({
        poNumber: po.poNumber,
        deletedByUserId: po.deletedByUserId as string,
        deletedAt: po.deletedAt as Date,
        permanentlyDeletedByUserId: userId,
        permanentlyDeletedAt: new Date(),
        reason: reason ?? null,
      }),
    );

    await this.documentsService.deleteByPoId(poId);
    await this.exceptionsService.deleteByPoIds([poId]);
    await this.changeHistoryRepository.delete({ poId });
    await this.notificationsService.deleteByPoId(poId);
    await this.auditLogRepository
      .createQueryBuilder()
      .delete()
      .where('tableName = :tableName', { tableName: 'po_master' })
      .andWhere('recordId = :id', { id: poId })
      .execute();
    // Cascades line items / appointment / dispatch / logistics / GRN / returns / tasks.
    await this.poRepository.delete({ id: poId });
  }

  async bulkPermanentlyDeletePO(
    poIds: string[],
    userId: string,
    reason?: string,
  ): Promise<{ deleted: string[]; failed: { poId: string; reason: string }[] }> {
    const deleted: string[] = [];
    const failed: { poId: string; reason: string }[] = [];
    for (const poId of poIds) {
      try {
        await this.permanentlyDeletePO(poId, userId, reason);
        deleted.push(poId);
      } catch (err: any) {
        failed.push({ poId, reason: err?.message || 'Failed to permanently delete' });
      }
    }
    return { deleted, failed };
  }

  /**
   * "A PO cannot be marked Not Fulfilled without a reason" - and for OTHER,
   * remarks are mandatory too, so the reason code alone can't hide behind a
   * catch-all with no real explanation.
   */
  /**
   * A deterministic, data-driven read of what the system itself can see on
   * this PO right now - expiry, dispatch progress, stock coverage,
   * appointment status, and open exceptions. Exposed standalone so the UI
   * can show it before the user commits to marking a PO not-fulfilled (their
   * own remarks can then add color instead of repeating what's already
   * visible), and also called from markNotFulfilled to snapshot it at the
   * moment of the decision.
   */
  async getNonFulfilmentDiagnosis(poId: string): Promise<string> {
    const po = await this.getPOById(poId);
    const [timeline, openExceptions] = await Promise.all([
      this.getPOTimeline(poId),
      this.exceptionsService.list({ poId, status: ExceptionResolutionStatus.OPEN }),
    ]);
    return this.buildNonFulfilmentDiagnosis(po, timeline, openExceptions);
  }

  private buildNonFulfilmentDiagnosis(
    po: POMasterEntity,
    timeline: { appointment: AppointmentEntity | null; dispatch: DispatchEntity | null },
    openExceptions: { exceptionType: string }[],
  ): string {
    const notes: string[] = [];
    const now = new Date();

    const expiry = new Date(po.poExpiryDate);
    const oneDayMs = 24 * 60 * 60 * 1000;
    if (expiry < now) {
      const daysAgo = Math.floor((now.getTime() - expiry.getTime()) / oneDayMs);
      notes.push(`PO expired ${daysAgo <= 0 ? 'today' : `${daysAgo} day${daysAgo === 1 ? '' : 's'} ago`} (${expiry.toLocaleDateString('en-IN')}).`);
    } else {
      const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / oneDayMs);
      if (daysLeft <= 3) notes.push(`PO expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${expiry.toLocaleDateString('en-IN')}).`);
    }

    if (po.fulfilmentPercent != null) {
      const pct = Number(po.fulfilmentPercent);
      if (pct === 0) notes.push('No units have been dispatched yet.');
      else if (pct < 100) notes.push(`Only ${pct.toFixed(1)}% of ordered quantity has been dispatched.`);
    }

    if (po.availableStockValue != null && Number(po.poValue) > 0) {
      const coveragePct = (Number(po.availableStockValue) / Number(po.poValue)) * 100;
      if (coveragePct < 100) {
        notes.push(
          `Available stock covers only Rs. ${Number(po.availableStockValue).toLocaleString('en-IN')} of the Rs. ${Number(po.poValue).toLocaleString('en-IN')} ordered (${coveragePct.toFixed(1)}%).`,
        );
      }
    }

    if (po.isLowPoValue) notes.push('Flagged as a low-value PO.');

    const { appointment, dispatch } = timeline;
    if (appointment) {
      if (!appointment.confirmedAt) notes.push('Appointment was never confirmed.');
      else if (appointment.slaStatus === 'BREACHED') notes.push('Appointment SLA was breached.');
    }

    if (dispatch && !dispatch.actualDispatchDate && dispatch.dispatchPlanStatus) {
      notes.push(`Dispatch has not occurred (plan status: ${dispatch.dispatchPlanStatus}).`);
    }

    if (openExceptions.length > 0) {
      const types = [...new Set(openExceptions.map((e) => e.exceptionType))];
      notes.push(`${openExceptions.length} open exception${openExceptions.length === 1 ? '' : 's'} on this PO: ${types.join(', ')}.`);
    }

    if (notes.length === 0) {
      return 'No automatic risk indicators found on this PO at this time - expiry, dispatch, stock, appointment, and exception data all look normal.';
    }
    return notes.join(' ');
  }

  async markNotFulfilled(
    poId: string,
    userId: string,
    reason: NonFulfilmentReason,
    remarks?: string,
  ): Promise<POMasterEntity> {
    if (!reason || !Object.values(NonFulfilmentReason).includes(reason)) {
      throw new BadRequestException('A valid non-fulfilment reason is required');
    }
    if (reason === NonFulfilmentReason.OTHER && !remarks?.trim()) {
      throw new BadRequestException('Remarks are required when reason is "Other"');
    }

    const po = await this.getPOById(poId);
    const oldDecision = po.fulfilmentDecision;
    po.fulfilmentDecision = FulfilmentDecision.NOT_FULFILLED;
    po.nonFulfilmentReason = reason;
    po.nonFulfilmentRemarks = remarks ?? null;
    po.nonFulfilmentSystemRemarks = await this.getNonFulfilmentDiagnosis(poId);
    po.nonFulfilmentAt = new Date();
    po.nonFulfilmentByUserId = userId;
    const saved = await this.poRepository.save(po);

    await this.changeHistoryRepository.save(
      this.changeHistoryRepository.create({
        poId,
        fieldName: 'fulfilmentDecision',
        oldValue: oldDecision,
        newValue: `NOT_FULFILLED (${reason})${remarks ? `: ${remarks}` : ''}`,
        changeType: 'FULFILMENT_DECISION',
        changedByUserId: userId,
      }),
    );

    return saved;
  }

  async markFulfilled(poId: string, userId: string): Promise<POMasterEntity> {
    const po = await this.getPOById(poId);
    const oldDecision = po.fulfilmentDecision;
    const oldReason = po.nonFulfilmentReason;
    po.fulfilmentDecision = FulfilmentDecision.FULFILLED;
    po.nonFulfilmentReason = null;
    po.nonFulfilmentRemarks = null;
    po.nonFulfilmentSystemRemarks = null;
    po.nonFulfilmentAt = null;
    po.nonFulfilmentByUserId = null;
    const saved = await this.poRepository.save(po);

    if (oldDecision === FulfilmentDecision.NOT_FULFILLED) {
      await this.changeHistoryRepository.save(
        this.changeHistoryRepository.create({
          poId,
          fieldName: 'fulfilmentDecision',
          oldValue: `NOT_FULFILLED (${oldReason})`,
          newValue: 'FULFILLED',
          changeType: 'FULFILMENT_DECISION',
          changedByUserId: userId,
        }),
      );
    }

    return saved;
  }

  /** Management view: not just "126 POs unfulfilled" but exactly why, and how much value that represents. */
  async getNotFulfilledDashboard() {
    const pos = await this.poRepository.find({
      where: { isDeleted: false, fulfilmentDecision: FulfilmentDecision.NOT_FULFILLED },
    });

    const totalPOs = pos.length;
    const totalValue = pos.reduce((sum, p) => sum + Number(p.poValue), 0);
    const potentiallyLostValue = pos.reduce(
      (sum, p) => sum + Math.max(Number(p.poValue) - Number(p.dispatchValue || 0), 0),
      0,
    );

    const breakdownMap = new Map<string, { count: number; value: number }>();
    for (const po of pos) {
      const key = po.nonFulfilmentReason || 'OTHER';
      const entry = breakdownMap.get(key) || { count: 0, value: 0 };
      entry.count += 1;
      entry.value += Number(po.poValue);
      breakdownMap.set(key, entry);
    }

    const breakdown = Array.from(breakdownMap.entries())
      .map(([reason, { count, value }]) => ({ reason, count, value }))
      .sort((a, b) => b.value - a.value);

    return { totalPOs, totalValue, potentiallyLostValue, breakdown };
  }

  async getPOLineItems(poId: string): Promise<POLineItemEntity[]> {
    return this.poLineItemRepository.findBy({ poId });
  }

  /** Each tracker also says whether its PO's GRN is recorded, so a delivered shipment can show "GRN pending". */
  async listLogisticsTrackers(): Promise<(LogisticsTrackerEntity & { grnRecorded: boolean })[]> {
    const trackers = await this.logisticsRepository.find({ relations: ['po'], order: { lastUpdateTime: 'DESC' } });
    const grns = trackers.length ? await this.grnRepository.find({ where: { poId: In(trackers.map((t) => t.poId)) } }) : [];
    const recorded = new Set(grns.filter((g) => g.grnDate).map((g) => g.poId));
    return trackers.map((t) => Object.assign(t, { grnRecorded: recorded.has(t.poId) }));
  }

  /**
   * "Ready to dispatch" = the dispatch window has opened and nothing has
   * shipped yet - DISPATCH_NOW (due today/now), plus DISPATCH_OVERDUE and
   * CRITICAL since those still need dispatching, just later than planned.
   * NOT_DUE (window hasn't opened) and DISPATCHED are excluded.
   */
  async listReadyToDispatch(): Promise<DispatchEntity[]> {
    return this.dispatchRepository.find({
      where: {
        dispatchPlanStatus: In([DispatchPlanStatus.DISPATCH_NOW, DispatchPlanStatus.DISPATCH_OVERDUE, DispatchPlanStatus.CRITICAL]),
        po: { isDeleted: false },
      },
      relations: ['po'],
      order: { recommendedDispatchDate: 'ASC' },
    });
  }

  async getPOTimeline(poId: string) {
    const [appointment, dispatch, logistics, grn, returnRecord, auditLog] = await Promise.all([
      this.appointmentRepository.findOneBy({ poId }),
      this.dispatchRepository.findOneBy({ poId }),
      this.logisticsRepository.findOneBy({ poId }),
      this.grnRepository.findOneBy({ poId }),
      this.returnRepository.findOneBy({ poId }),
      this.auditLogRepository.find({ where: { recordId: poId }, order: { createdAt: 'DESC' } }),
    ]);
    return { appointment, dispatch, logistics, grn, returnRecord, auditLog };
  }

  async requestAppointment(poId: string): Promise<AppointmentEntity> {
    const appointment = await this.appointmentRepository.findOneBy({ poId });
    if (!appointment) {
      throw new NotFoundException('Appointment record not found');
    }
    appointment.requestedAt = new Date();
    return this.appointmentRepository.save(appointment);
  }

  async confirmAppointment(poId: string, appointmentDate: Date): Promise<AppointmentEntity> {
    const appointment = await this.appointmentRepository.findOneBy({ poId });
    if (!appointment) {
      throw new NotFoundException('Appointment record not found');
    }
    appointment.confirmedAt = new Date();
    appointment.appointmentDate = new Date(appointmentDate);
    const saved = await this.appointmentRepository.save(appointment);

    // Unresolved, not just OPEN: an overdue task has been escalated and must still close.
    const openTask = await this.tasksService.findUnresolvedByPoAndType(poId, TaskType.APPOINTMENT);
    if (openTask) await this.tasksService.complete(openTask.id, 'Appointment confirmed');

    await this.recomputeStatus(poId);
    await this.recomputeRisk(poId);
    return saved;
  }

  async markDispatched(poId: string, docketNumber: string, transporterId: string): Promise<DispatchEntity> {
    const dispatch = await this.dispatchRepository.findOneBy({ poId });
    if (!dispatch) {
      throw new NotFoundException('Dispatch record not found');
    }
    dispatch.actualDispatchDate = new Date();
    dispatch.docketNumber = docketNumber;
    dispatch.transporterId = transporterId;
    const saved = await this.dispatchRepository.save(dispatch);

    const logistics = new LogisticsTrackerEntity();
    logistics.poId = poId;
    logistics.docketNumber = docketNumber;
    logistics.transporterId = transporterId;
    logistics.lastTrackedStatus = 'DISPATCHED';
    logistics.lastUpdateTime = new Date();
    logistics.receivedAndActioned = false;
    await this.logisticsRepository.save(logistics);

    await this.recomputeStatus(poId);
    await this.recomputeRisk(poId);
    await this.recomputeDispatchPlan(poId);
    return saved;
  }

  async updateLogisticsStatus(poId: string, status: string): Promise<LogisticsTrackerEntity> {
    const logistics = await this.logisticsRepository.findOneBy({ poId });
    if (!logistics) {
      throw new NotFoundException('Logistics record not found');
    }
    logistics.lastTrackedStatus = status;
    logistics.lastUpdateTime = new Date();
    logistics.hoursWithoutMovement = 0;
    const saved = await this.logisticsRepository.save(logistics);

    if (status === 'DELIVERED') {
      const existingGrn = await this.grnRepository.findOneBy({ poId });
      if (!existingGrn) {
        const grn = new GRNTrackerEntity();
        grn.poId = poId;
        grn.slaStatus = 'ON_TIME';
        await this.grnRepository.save(grn);

        const po = await this.getPOById(poId);
        await this.tasksService.create({
          poId,
          taskType: TaskType.GRN,
          ownerId: po.grnOwnerId || po.overallOwnerId,
          status: 'OPEN',
          slaDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          notes: 'PO delivered - record GRN outcome.',
        });
      }
    }

    await this.recomputeStatus(poId);
    return saved;
  }

  async markAVVReceived(poId: string): Promise<LogisticsTrackerEntity> {
    const logistics = await this.logisticsRepository.findOneBy({ poId });
    if (!logistics) {
      throw new NotFoundException('Logistics record not found');
    }
    logistics.receivedAndActioned = true;
    logistics.receivedAndActionedAt = new Date();
    const saved = await this.logisticsRepository.save(logistics);

    const openTask = await this.tasksService.findOpenByPoAndType(poId, TaskType.AVV_FOLLOWUP);
    if (openTask) await this.tasksService.complete(openTask.id, 'AVV received and actioned');

    return saved;
  }

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
    let grn = await this.grnRepository.findOneBy({ poId });
    if (!grn) {
      grn = new GRNTrackerEntity();
      grn.poId = poId;
    }

    if (grnData.outcome !== GRNOutcome.MATCHED && !grnData.discrepancyReason) {
      throw new BadRequestException('discrepancyReason is required unless the GRN outcome is MATCHED');
    }

    grn.grnNumber = grnData.grnNumber;
    grn.grnValue = grnData.grnValue;
    grn.grnDate = new Date();
    grn.outcome = grnData.outcome as any;
    grn.discrepancyReason = grnData.discrepancyReason ?? '';
    grn.discrepancyAmount = grnData.discrepancyAmount ?? 0;

    const saved = await this.grnRepository.save(grn);

    // Stock physically arrived (any outcome but NO_GRN) - this is the real
    // "recovered" milestone for whatever stuck-stock was mapped onto this PO,
    // not the mapping itself. See POMappingService.recoverMappingsForNewPo.
    await this.poMappingService.recoverMappingsForNewPo(poId, grnData.outcome);

    // Unresolved, not just OPEN: a GRN task past its SLA has been escalated and
    // must still close when the GRN is recorded.
    const openGrnTask = await this.tasksService.findUnresolvedByPoAndType(poId, TaskType.GRN);
    if (openGrnTask) await this.tasksService.complete(openGrnTask.id, `GRN recorded: ${grnData.outcome}`);

    if (grnData.outcome === GRNOutcome.NO_GRN) {
      // Entire invoice not received/receipted - one path for "this PO didn't make it".
      await this.returnsService.create(poId, {
        returnType: 'REJECTED_GRN',
        rootCause: grnData.discrepancyReason,
        lossAmount: grnData.discrepancyAmount,
      });
      const po = await this.getPOById(poId);
      await this.tasksService.create({
        poId,
        taskType: TaskType.RETURN_CN,
        ownerId: po.overallOwnerId,
        status: 'OPEN',
        slaDueAt: new Date(),
        notes: 'No GRN - entire invoice not received. Confirm recall and raise Credit Note.',
      });
    } else if (grnData.outcome !== GRNOutcome.MATCHED) {
      const po = await this.getPOById(poId);
      await this.tasksService.create({
        poId,
        taskType: TaskType.DISCREPANCY,
        ownerId: po.grnOwnerId || po.overallOwnerId,
        status: 'OPEN',
        slaDueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        notes: `Discrepancy (${grnData.outcome}): ${grnData.discrepancyReason}. Requires credit/debit note resolution.`,
      });
    }

    await this.recomputeStatus(poId);
    await this.recomputeRisk(poId);
    return saved;
  }

  /**
   * "Reattempt" (spec: failed delivery -> new PO, linked via Parent PO Number)
   * is deliberately NOT its own linking mechanism - it clones the undelivered
   * lines onto a brand-new PO, then routes that link through the existing PO
   * Mapping feature (same 70%-coverage rule, atomic transaction, and
   * GRN-triggered recovery hook used for stuck-stock recovery). Since the
   * clone's quantities exactly equal what's mapped, coverage is always ~100%.
   * Does not mutate the original PO's status/fulfilmentDecision - it stays
   * RETURNED, and resolves the same way stuck stock already does elsewhere:
   * once the new PO's GRN completes (recoverMappingsForNewPo above).
   */
  async reattemptDelivery(poId: string, userId: string): Promise<{ newPo: POMasterEntity; mapping: any }> {
    const originalPo = await this.getPOById(poId);

    const returnRecord = await this.returnRepository.findOneBy({ poId });
    if (!returnRecord || returnRecord.returnType !== 'RECALL_NOT_DELIVERED') {
      throw new BadRequestException('A "not delivered" return must be recorded before a reattempt can be created');
    }

    const existingReattempts = await this.poMappingService.list({ originalPoId: poId, status: POMappingStatus.ACTIVE });
    if (existingReattempts.some((m) => m.reason === 'REATTEMPT')) {
      throw new BadRequestException('A reattempt has already been created for this PO');
    }

    const lineItems = await this.poLineItemRepository.findBy({ poId });
    const leftoverLines = lineItems
      .map((li) => ({ li, leftover: Number(li.quantity) - Number(li.dispatchedQuantity ?? 0) }))
      .filter((x) => x.leftover > 0);
    if (leftoverLines.length === 0) {
      throw new BadRequestException('No undelivered quantity remains to reattempt');
    }

    const suffixCount = await this.poRepository.count({ where: { poNumber: Like(`${originalPo.poNumber}-R%`) } });
    const newPoNumber = `${originalPo.poNumber}-R${suffixCount + 1}`;

    const customer = await this.customerRepository.findOneBy({ id: originalPo.customerId });
    const appointmentRequirementInDays = customer?.appointmentRequirementInDays ?? 3;
    const now = new Date();
    const poExpiryDate = new Date(now.getTime() + appointmentRequirementInDays * 24 * 60 * 60 * 1000);

    let newPo = new POMasterEntity();
    newPo.poNumber = newPoNumber;
    newPo.poDate = now;
    newPo.poExpiryDate = poExpiryDate;
    newPo.channelId = originalPo.channelId;
    newPo.customerId = originalPo.customerId;
    newPo.location = originalPo.location;
    newPo.poValue = leftoverLines.reduce((sum, { li, leftover }) => sum + leftover * (Number(li.unitPrice ?? li.mrp) || 0), 0);
    newPo.overallOwnerId = originalPo.overallOwnerId;
    newPo.status = POStatus.RECEIVED;
    newPo.riskStatus = RiskStatus.GREEN;
    newPo.priorityScore = 0;
    newPo.sourceType = originalPo.sourceType;
    newPo.isReattemptPo = true;
    newPo.lastStatusChangeAt = now;
    newPo = await this.poRepository.save(newPo);

    for (const { li, leftover } of leftoverLines) {
      const item = new POLineItemEntity();
      item.poId = newPo.id;
      item.skuCode = li.skuCode;
      item.skuName = li.skuName;
      item.upc = li.upc;
      item.mrp = li.mrp;
      item.unitPrice = li.unitPrice;
      item.quantity = leftover;
      item.availability = 'NOT_AVAILABLE';
      await this.poLineItemRepository.save(item);
    }

    const appointment = new AppointmentEntity();
    appointment.poId = newPo.id;
    appointment.requestedAt = null;
    appointment.confirmedAt = null;
    appointment.slaStatus = 'ON_TIME';
    await this.appointmentRepository.save(appointment);

    const transporter = await this.transporterRepository.findOne({ where: { name: 'DEFAULT' } });
    const transitTimeDays = transporter?.transitTimeDays || 2;
    const dispatch = new DispatchEntity();
    dispatch.poId = newPo.id;
    dispatch.idealDispatchDate = this.dispatchPlanningEngine.calculateIdealDispatchDate(now, transitTimeDays);
    dispatch.latestSafeDispatchDate = this.dispatchPlanningEngine.calculateLatestSafeDispatchDate(
      poExpiryDate,
      3,
      transitTimeDays,
      1,
    );
    await this.dispatchRepository.save(dispatch);

    await this.recomputePOAggregates(newPo.id);
    await this.recomputeRisk(newPo.id);
    await this.recomputeDispatchPlan(newPo.id);

    const mapping = await this.poMappingService.mapWholePO({
      originalPoId: poId,
      newPoId: newPo.id,
      lines: leftoverLines.map(({ li, leftover }) => ({ skuCode: li.skuCode, quantityMapped: leftover })),
      reason: 'REATTEMPT',
      createdByUserId: userId,
    });

    await this.changeHistoryRepository.save(
      this.changeHistoryRepository.create({
        poId,
        fieldName: 'reattempt',
        oldValue: null,
        newValue: newPoNumber,
        changeType: 'REATTEMPT_CREATED',
        changedByUserId: userId,
      }),
    );

    return { newPo: await this.getPOById(newPo.id), mapping };
  }

  /**
   * `preloaded` lets a caller that already has these rows in memory (the bulk
   * import pipeline, which would otherwise re-fetch the same PO/appointment/
   * dispatch/logistics/GRN separately in each of recomputeStatus/recomputeRisk/
   * recomputeDispatchPlan for every single row) skip the redundant round trips.
   * Every other caller omits it and gets exactly today's fetch-fresh behaviour.
   */
  async recomputeStatus(
    poId: string,
    preloaded?: { po?: POMasterEntity; appointment?: AppointmentEntity | null; dispatch?: DispatchEntity | null; logistics?: LogisticsTrackerEntity | null; grn?: GRNTrackerEntity | null },
  ): Promise<void> {
    const po = preloaded?.po ?? (await this.getPOById(poId));
    if ([POStatus.RETURNED, POStatus.CANCELLED, POStatus.CLOSED].includes(po.status)) {
      return; // terminal statuses are set explicitly (e.g. by the Returns/CN flow) and never derived
    }
    const appointment = preloaded ? preloaded.appointment ?? null : await this.appointmentRepository.findOneBy({ poId });
    const dispatch = preloaded ? preloaded.dispatch ?? null : await this.dispatchRepository.findOneBy({ poId });
    const logistics = preloaded ? preloaded.logistics ?? null : await this.logisticsRepository.findOneBy({ poId });
    const grn = preloaded ? preloaded.grn ?? null : await this.grnRepository.findOneBy({ poId });

    const newStatus = this.statusEngine.deriveStatus(po, appointment ?? undefined, dispatch ?? undefined, logistics ?? undefined, grn ?? undefined);
    if (newStatus !== po.status) {
      const oldStatus = po.status;
      po.status = newStatus;
      po.lastStatusChangeAt = new Date();
      await this.poRepository.save(po, { transaction: false });
      await this.auditLogRepository.save(
        this.auditLogRepository.create({
          tableName: 'po_master',
          recordId: poId,
          fieldName: 'status',
          oldValue: oldStatus,
          newValue: newStatus,
          userId: 'system',
        }),
        { transaction: false },
      );
    }
  }

  async recomputeRisk(poId: string, preloaded?: { po?: POMasterEntity; dispatch?: DispatchEntity | null }): Promise<void> {
    const po = preloaded?.po ?? (await this.getPOById(poId));
    const daysToExpiry = this.riskEngine.getDaysToExpiry(po.poExpiryDate);
    const dispatch = preloaded ? preloaded.dispatch ?? null : await this.dispatchRepository.findOneBy({ poId });
    const hasDelays = !!dispatch && dispatch.latestSafeDispatchDate < new Date() && !dispatch.actualDispatchDate;

    const { riskStatus, priorityScore } = this.riskEngine.computeRisk(
      po,
      daysToExpiry,
      po.status,
      hasDelays,
      false,
    );

    if (riskStatus !== po.riskStatus) {
      const oldRisk = po.riskStatus;
      await this.auditLogRepository.save(
        this.auditLogRepository.create({
          tableName: 'po_master',
          recordId: poId,
          fieldName: 'riskStatus',
          oldValue: oldRisk,
          newValue: riskStatus,
          userId: 'system',
        }),
        { transaction: false },
      );
      if ([RiskStatus.RED, RiskStatus.BLACK].includes(riskStatus)) {
        await this.notificationsService.notify({
          userId: po.overallOwnerId,
          type: 'RISK_ESCALATED',
          title: `PO ${po.poNumber} risk is now ${riskStatus}`,
          message: `Risk moved from ${oldRisk} to ${riskStatus} - ${daysToExpiry} day(s) to expiry.`,
          poId: po.id,
        });
      }
    }

    po.riskStatus = riskStatus;
    po.priorityScore = priorityScore;
    await this.poRepository.save(po, { transaction: false });
  }

  async getDashboardMetrics(): Promise<any> {
    const allPOs = await this.poRepository.find({ where: { isDeleted: false } });
    return {
      totalPOs: allPOs.length,
      byRisk: {
        black: allPOs.filter((p) => p.riskStatus === RiskStatus.BLACK).length,
        red: allPOs.filter((p) => p.riskStatus === RiskStatus.RED).length,
        orange: allPOs.filter((p) => p.riskStatus === RiskStatus.ORANGE).length,
        yellow: allPOs.filter((p) => p.riskStatus === RiskStatus.YELLOW).length,
        green: allPOs.filter((p) => p.riskStatus === RiskStatus.GREEN).length,
      },
      byStatus: {
        received: allPOs.filter((p) => p.status === POStatus.RECEIVED).length,
        appointmentRequested: allPOs.filter((p) => p.status === POStatus.APPOINTMENT_REQUESTED).length,
        appointmentConfirmed: allPOs.filter((p) => p.status === POStatus.APPOINTMENT_CONFIRMED).length,
        readyForDispatch: allPOs.filter((p) => p.status === POStatus.READY_FOR_DISPATCH).length,
        dispatched: allPOs.filter((p) => p.status === POStatus.DISPATCHED).length,
        inTransit: allPOs.filter((p) => p.status === POStatus.IN_TRANSIT).length,
        delivered: allPOs.filter((p) => p.status === POStatus.DELIVERED).length,
        grnPending: allPOs.filter((p) => p.status === POStatus.GRN_PENDING).length,
        reconciled: allPOs.filter((p) => p.status === POStatus.RECONCILED).length,
        closed: allPOs.filter((p) => p.status === POStatus.CLOSED).length,
      },
      totalValue: allPOs.reduce((sum, p) => sum + Number(p.poValue), 0),
      expiringToday: allPOs.filter((p) => this.riskEngine.getDaysToExpiry(p.poExpiryDate) <= 0).length,
      byFulfilment: {
        green: allPOs.filter((p) => p.fulfilmentStatus === FulfilmentStatus.GREEN).length,
        yellow: allPOs.filter((p) => p.fulfilmentStatus === FulfilmentStatus.YELLOW).length,
        orange: allPOs.filter((p) => p.fulfilmentStatus === FulfilmentStatus.ORANGE).length,
        red: allPOs.filter((p) => p.fulfilmentStatus === FulfilmentStatus.RED).length,
      },
      bulkImportCount: allPOs.filter((p) => p.sourceType === 'BULK_IMPORT').length,
      openExceptions: await this.exceptionsService.list({ status: ExceptionResolutionStatus.OPEN }).then((l) => l.length),
      notFulfilledCount: allPOs.filter((p) => p.fulfilmentDecision === FulfilmentDecision.NOT_FULFILLED).length,
      lowValueCount: allPOs.filter((p) => p.isLowPoValue).length,
      binCount: await this.poRepository.count({ where: { isDeleted: true } }),
      readyToDispatchCount: await this.dispatchRepository.count({
        where: {
          dispatchPlanStatus: In([DispatchPlanStatus.DISPATCH_NOW, DispatchPlanStatus.DISPATCH_OVERDUE, DispatchPlanStatus.CRITICAL]),
          po: { isDeleted: false },
        },
        relations: ['po'],
      }),
      ...(await this.getOperationalTotals()),
    };
  }

  /**
   * SKU-level rollup across every currently-live PO (bin excluded) - this
   * system has no separate warehouse-stock/goods-receipt table, so "inventory"
   * here means the movement picture line items already carry: how much has
   * been ordered, dispatched, marked available, and is still pending, per
   * product, across the whole current book of POs.
   *
   * Grouped by skuCode - the one identity field guaranteed non-null on every
   * line item (UPC-less rows fall back to UPC as skuCode at cleaning time) -
   * rather than by name, for the same reason a UPC mismatch was worth fixing
   * earlier: two rows sharing a skuCode are the same physical product even if
   * a display name varies slightly across source files, so a second query
   * picks the highest-volume name/UPC pairing per skuCode to show instead of
   * fragmenting one product into several rows.
   */
  async getInventoryRollup(): Promise<InventoryRow[]> {
    const totalsRaw = await this.poLineItemRepository
      .createQueryBuilder('li')
      .innerJoin(POMasterEntity, 'po', 'po.id = li.poId')
      .where('po.isDeleted = false')
      .select('li.skuCode', 'skuCode')
      .addSelect('SUM(li.quantity)', 'unitsOrdered')
      .addSelect('SUM(COALESCE(li.dispatchedQuantity, 0))', 'unitsDispatched')
      .addSelect('SUM(COALESCE(li.availableQuantity, 0))', 'unitsAvailable')
      .addSelect('SUM(COALESCE(li.pendingQuantity, 0))', 'unitsPending')
      .addSelect('SUM(COALESCE(li.lineValue, li.quantity * li.unitPrice, 0))', 'totalValue')
      .addSelect('COUNT(DISTINCT li.poId)', 'poCount')
      .groupBy('li.skuCode')
      .getRawMany();

    const namesRaw = await this.poLineItemRepository
      .createQueryBuilder('li')
      .innerJoin(POMasterEntity, 'po', 'po.id = li.poId')
      .where('po.isDeleted = false')
      .select('li.skuCode', 'skuCode')
      .addSelect('li.upc', 'upc')
      .addSelect('li.skuName', 'name')
      .addSelect('SUM(li.quantity)', 'units')
      .groupBy('li.skuCode')
      .addGroupBy('li.upc')
      .addGroupBy('li.skuName')
      .getRawMany();

    const bestNameBySkuCode = new Map<string, { name: string; upc: string | null }>();
    const bestUnitsBySkuCode = new Map<string, number>();
    for (const r of namesRaw) {
      const units = Number(r.units) || 0;
      if (units > (bestUnitsBySkuCode.get(r.skuCode) ?? -1)) {
        bestUnitsBySkuCode.set(r.skuCode, units);
        bestNameBySkuCode.set(r.skuCode, { name: r.name, upc: r.upc });
      }
    }

    return totalsRaw
      .map((r) => {
        const unitsOrdered = Number(r.unitsOrdered) || 0;
        const unitsDispatched = Number(r.unitsDispatched) || 0;
        const best = bestNameBySkuCode.get(r.skuCode);
        return {
          skuCode: r.skuCode,
          upc: best?.upc ?? null,
          name: best?.name ?? r.skuCode,
          unitsOrdered,
          unitsDispatched,
          unitsAvailable: Number(r.unitsAvailable) || 0,
          unitsPending: Number(r.unitsPending) || 0,
          totalValue: Number(r.totalValue) || 0,
          poCount: Number(r.poCount) || 0,
          fulfilmentPercent: unitsOrdered > 0 ? (unitsDispatched / unitsOrdered) * 100 : 0,
        };
      })
      .sort((a, b) => b.unitsOrdered - a.unitsOrdered);
  }

  private async getOperationalTotals() {
    const lines = await this.poLineItemRepository
      .createQueryBuilder('li')
      .innerJoin(POMasterEntity, 'po', 'po.id = li.poId')
      .where('po.isDeleted = false')
      .getMany();
    const sum = (pick: (l: POLineItemEntity) => number | null | undefined) =>
      lines.reduce((s, l) => s + (Number(pick(l)) || 0), 0);

    return {
      totalOrderedQty: sum((l) => l.quantity),
      totalDeliveredQty: sum((l) => l.deliveredQuantity),
      totalPendingQty: sum((l) => l.pendingQuantity),
      totalPendingValue: lines.reduce((s, l) => s + (Number(l.pendingQuantity) || 0) * (Number(l.unitPrice) || 0), 0),
    };
  }
}
