import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { POMasterEntity } from '../../database/entities/po-master.entity';
import { POLineItemEntity } from '../../database/entities/po-line-item.entity';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { LogisticsTrackerEntity } from '../../database/entities/logistics-tracker.entity';
import { GRNTrackerEntity } from '../../database/entities/grn-tracker.entity';
import { POChangeHistoryEntity } from '../../database/entities/po-change-history.entity';
import { BulkPOProcessedRowEntity } from '../../database/entities/bulk-processed-row.entity';
import { UploadBatchEntity } from '../../database/entities/upload-batch.entity';

import { POStatus, RiskStatus, ExceptionSeverity, ExceptionType } from '@po-control-tower/shared';
import { POService } from '../po/po.service';
import { FulfilmentStatusEngine } from '../../engines/fulfilment-status.engine';
import { LocationsService } from '../locations/locations.service';
import { ExceptionsService } from '../exceptions/exceptions.service';

@Injectable()
export class POCompilationService {
  constructor(
    @InjectRepository(POMasterEntity) private readonly poRepository: Repository<POMasterEntity>,
    @InjectRepository(POLineItemEntity) private readonly lineRepository: Repository<POLineItemEntity>,
    @InjectRepository(AppointmentEntity) private readonly appointmentRepository: Repository<AppointmentEntity>,
    @InjectRepository(DispatchEntity) private readonly dispatchRepository: Repository<DispatchEntity>,
    @InjectRepository(LogisticsTrackerEntity) private readonly logisticsRepository: Repository<LogisticsTrackerEntity>,
    @InjectRepository(GRNTrackerEntity) private readonly grnRepository: Repository<GRNTrackerEntity>,
    @InjectRepository(POChangeHistoryEntity) private readonly historyRepository: Repository<POChangeHistoryEntity>,
    private readonly poService: POService,
    private readonly fulfilmentStatusEngine: FulfilmentStatusEngine,
    private readonly locationsService: LocationsService,
    private readonly exceptionsService: ExceptionsService,
  ) {}

  async compileRow(
    row: BulkPOProcessedRowEntity,
    batch: UploadBatchEntity,
    uploadedByUserId: string,
  ): Promise<{ poId: string; created: boolean }> {
    let po = await this.poRepository.findOne({ where: { poNumber: row.poNumber, channelId: row.platform } });
    let created = false;

    if (!po) {
      po = this.poRepository.create({
        poNumber: row.poNumber,
        poDate: row.poDate || new Date(),
        poExpiryDate: row.expiryDate,
        channelId: row.platform,
        customerId: row.platform,
        location: row.warehouse || 'UNKNOWN',
        poValue: row.poValue || 0,
        status: POStatus.RECEIVED,
        riskStatus: RiskStatus.GREEN,
        priorityScore: 0,
        overallOwnerId: uploadedByUserId,
        sourceType: 'BULK_IMPORT',
        lastBulkBatchId: batch.id,
        appointmentStatusRaw: row.appointmentStatus,
        deliveryStatusRaw: row.deliveryStatus,
        poStatusRaw: row.poStatus,
        lastStatusChangeAt: new Date(),
      });
      po = await this.poRepository.save(po);
      created = true;

      await this.appointmentRepository.save(this.appointmentRepository.create({ poId: po.id, slaStatus: 'ON_TIME' }));
      await this.dispatchRepository.save(
        this.dispatchRepository.create({
          poId: po.id,
          idealDispatchDate: row.poDate || new Date(),
          latestSafeDispatchDate: row.expiryDate,
        }),
      );
    } else {
      po.lastBulkBatchId = batch.id;
      if (row.appointmentStatus) po.appointmentStatusRaw = row.appointmentStatus;
      if (row.deliveryStatus) po.deliveryStatusRaw = row.deliveryStatus;
      if (row.poStatus) po.poStatusRaw = row.poStatus;
      await this.poRepository.save(po);
    }

    // Location Master traceability - an unmatched warehouse defaults to NON_LOCAL
    // (the safer/longer buffer) in recomputeDispatchPlan, but we still want ops
    // to know the warehouse name wasn't recognized so it can be added properly.
    const { matched } = await this.locationsService.classify(row.warehouse || '');
    if (row.warehouse && !matched) {
      await this.locationsService.recordPendingLocation(row.warehouse, row.platform, row.poNumber);
      await this.exceptionsService.raise({
        batchId: batch.id,
        poId: po.id,
        rawRowId: row.rawRowId,
        processedRowId: row.id,
        poNumber: row.poNumber,
        skuCode: row.skuCode,
        warehouse: row.warehouse,
        exceptionType: ExceptionType.UNKNOWN_WAREHOUSE,
        severity: ExceptionSeverity.MEDIUM,
        recommendedAction: `"${row.warehouse}" is not in the Location Master - add it to get accurate LOCAL/NON-LOCAL dispatch TAT instead of the NON-LOCAL default.`,
      });
    }

    const line = await this.upsertLineItem(po.id, row, batch, uploadedByUserId);

    await this.upsertAppointment(po.id, row, batch, uploadedByUserId);
    await this.applyDispatchSignal(po.id, row);
    await this.applyDeliverySignal(po.id, row, line);

    await this.recalculatePoValue(po.id);

    await this.poService.recomputeStatus(po.id);
    await this.poService.recomputeRisk(po.id);
    await this.poService.recomputeDispatchPlan(po.id);
    await this.applyFulfilmentStatus(po.id, row);

    return { poId: po.id, created };
  }

  private async upsertLineItem(
    poId: string,
    row: BulkPOProcessedRowEntity,
    batch: UploadBatchEntity,
    userId: string,
  ): Promise<POLineItemEntity> {
    let line = await this.lineRepository.findOne({ where: { poId, skuCode: row.skuCode } });
    const isNew = !line;
    if (!line) {
      line = this.lineRepository.create({
        poId,
        skuCode: row.skuCode,
        skuName: row.productName || row.skuCode,
        upc: row.upc ?? null,
        mrp: row.mrp ?? null,
        availability: 'NOT_AVAILABLE',
      });
    }

    if (!isNew) {
      const trackable: [string, any, any][] = [
        ['quantity', line.quantity, row.orderedQty],
        ['acceptedQuantity', line.acceptedQuantity, row.acceptedQty],
        ['dispatchedQuantity', line.dispatchedQuantity, row.dispatchedQty],
        ['deliveredQuantity', line.deliveredQuantity, row.deliveredQty],
        ['rejectedQuantity', line.rejectedQuantity, row.rejectedQty],
        ['unitPrice', line.unitPrice, row.unitPrice],
      ];
      for (const [field, oldV, newV] of trackable) {
        if (newV !== undefined && Number(oldV) !== Number(newV)) {
          await this.trackChange(poId, row.skuCode, field, oldV, newV, batch, userId);
        }
      }
    }

    if (row.orderedQty !== undefined) line.quantity = row.orderedQty;
    if (row.acceptedQty !== undefined) line.acceptedQuantity = row.acceptedQty;
    if (row.dispatchedQty !== undefined) line.dispatchedQuantity = row.dispatchedQty;
    if (row.deliveredQty !== undefined) line.deliveredQuantity = row.deliveredQty;
    if (row.rejectedQty !== undefined) line.rejectedQuantity = row.rejectedQty;
    if (row.unitPrice !== undefined) line.unitPrice = row.unitPrice;
    if (row.productName) line.skuName = row.productName;
    if (row.upc) line.upc = row.upc;
    if (row.mrp !== undefined) line.mrp = row.mrp;

    const ordered = Number(line.quantity) || 0;
    const delivered = Number(line.deliveredQuantity) || 0;
    line.pendingQuantity = row.pendingQty !== undefined ? row.pendingQty : Math.max(0, ordered - delivered);
    line.lineValue = row.poValue !== undefined ? row.poValue : line.unitPrice ? ordered * Number(line.unitPrice) : line.lineValue;
    line.fulfilmentPercent = ordered > 0 ? Math.min(100, (delivered / ordered) * 100) : null;
    line.pendingPercent = ordered > 0 ? Math.min(100, (Number(line.pendingQuantity) / ordered) * 100) : null;
    if (ordered > 0) {
      line.availability = delivered >= ordered ? 'AVAILABLE' : delivered > 0 ? 'SHORT' : line.availability;
    }

    return this.lineRepository.save(line);
  }

  private async upsertAppointment(poId: string, row: BulkPOProcessedRowEntity, batch: UploadBatchEntity, userId: string) {
    if (!row.appointmentDate) return;
    let appt = await this.appointmentRepository.findOneBy({ poId });
    if (!appt) appt = this.appointmentRepository.create({ poId, slaStatus: 'ON_TIME' });

    const changed = !appt.appointmentDate || appt.appointmentDate.getTime() !== row.appointmentDate.getTime();
    if (changed) {
      await this.trackChange(
        poId,
        undefined,
        'appointmentDate',
        appt.appointmentDate?.toISOString(),
        row.appointmentDate.toISOString(),
        batch,
        userId,
      );
    }
    appt.appointmentDate = row.appointmentDate;
    appt.confirmedAt = appt.confirmedAt || new Date();
    await this.appointmentRepository.save(appt);
  }

  private async applyDispatchSignal(poId: string, row: BulkPOProcessedRowEntity) {
    if (!row.dispatchedQty || row.dispatchedQty <= 0) return;
    const dispatch = await this.dispatchRepository.findOneBy({ poId });
    if (dispatch && !dispatch.actualDispatchDate) {
      dispatch.actualDispatchDate = row.poDate || new Date();
      await this.dispatchRepository.save(dispatch);
    }
  }

  private async applyDeliverySignal(poId: string, row: BulkPOProcessedRowEntity, line: POLineItemEntity) {
    const ordered = Number(line.quantity) || 0;
    const delivered = Number(line.deliveredQuantity) || 0;
    if (!(delivered > 0 && ordered > 0 && delivered >= ordered)) return;

    let logistics = await this.logisticsRepository.findOneBy({ poId });
    if (!logistics) {
      logistics = this.logisticsRepository.create({
        poId,
        docketNumber: 'BULK-IMPORT',
        transporterId: 'UNKNOWN',
        lastTrackedStatus: 'DELIVERED',
        lastUpdateTime: new Date(),
        receivedAndActioned: false,
      });
    } else {
      logistics.lastTrackedStatus = 'DELIVERED';
      logistics.lastUpdateTime = new Date();
    }
    await this.logisticsRepository.save(logistics);

    const existingGrn = await this.grnRepository.findOneBy({ poId });
    if (!existingGrn) {
      await this.grnRepository.save(this.grnRepository.create({ poId, slaStatus: 'ON_TIME' }));
    }
  }

  private async recalculatePoValue(poId: string) {
    const lines = await this.lineRepository.find({ where: { poId } });
    const total = lines.reduce((sum, l) => sum + (Number(l.lineValue) || 0), 0);
    if (total > 0) {
      await this.poRepository.update(poId, { poValue: total });
    }
  }

  private async applyFulfilmentStatus(poId: string, row: BulkPOProcessedRowEntity) {
    const po = await this.poRepository.findOneBy({ id: poId });
    const line = await this.lineRepository.findOne({ where: { poId, skuCode: row.skuCode } });
    const appointment = await this.appointmentRepository.findOneBy({ poId });
    const dispatch = await this.dispatchRepository.findOneBy({ poId });

    const fulfilmentStatus = this.fulfilmentStatusEngine.compute({
      orderedQty: Number(line?.quantity) || 0,
      deliveredQty: Number(line?.deliveredQuantity) || 0,
      pendingQty: Number(line?.pendingQuantity) || 0,
      poExpiryDate: po!.poExpiryDate,
      appointmentDate: appointment?.appointmentDate,
      dispatchPlanStatus: dispatch?.dispatchPlanStatus,
      poCancelled: (row.poStatus || '').toLowerCase().includes('cancel'),
    });

    await this.poRepository.update(poId, { fulfilmentStatus });
  }

  private async trackChange(
    poId: string,
    skuCode: string | undefined,
    fieldName: string,
    oldValue: any,
    newValue: any,
    batch: UploadBatchEntity,
    userId: string,
  ) {
    await this.historyRepository.save(
      this.historyRepository.create({
        poId,
        skuCode: skuCode ?? null,
        fieldName,
        oldValue: oldValue === undefined || oldValue === null ? null : String(oldValue),
        newValue: newValue === undefined || newValue === null ? null : String(newValue),
        changeType: 'BULK_IMPORT_UPDATE',
        sourceBatchId: batch.id,
        sourceFileName: batch.fileName,
        changedByUserId: userId,
      }),
    );
  }
}
