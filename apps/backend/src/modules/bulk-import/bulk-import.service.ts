import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Not, Repository } from 'typeorm';
import { format } from 'date-fns';

import { UploadBatchEntity } from '../../database/entities/upload-batch.entity';
import { BulkPORawRowEntity } from '../../database/entities/bulk-raw-row.entity';
import { BulkPOProcessedRowEntity } from '../../database/entities/bulk-processed-row.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import { NotificationEntity } from '../../database/entities/notification.entity';
import { POChangeHistoryEntity } from '../../database/entities/po-change-history.entity';

import { DedupClassification, ExceptionSeverity, ExceptionType, StandardBulkField, UploadBatchStatus } from '@po-control-tower/shared';
import { FileReaderService } from './file-reader.service';
import { ColumnMappingService } from './column-mapping.service';
import { DataCleaningService } from './data-cleaning.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { POCompilationService } from './po-compilation.service';
import { ReconciliationEngine } from '../../engines/reconciliation.engine';
import { ExceptionsService } from '../exceptions/exceptions.service';
import { LocationsService } from '../locations/locations.service';

// Maps the processed-row entity's camelCase fields to the snake_case standard
// field keys the cleaning/validation engine understands, so a manual
// correction can be re-run through the exact same rules as the original import.
const FIELD_TO_STANDARD: Record<string, StandardBulkField> = {
  platform: 'platform',
  poNumber: 'po_number',
  poDate: 'po_date',
  appointmentDate: 'appointment_date',
  appointmentTime: 'appointment_time',
  warehouse: 'warehouse',
  skuCode: 'sku_code',
  upc: 'upc',
  productName: 'product_name',
  mrp: 'mrp',
  orderedQty: 'ordered_qty',
  acceptedQty: 'accepted_qty',
  dispatchedQty: 'dispatched_qty',
  deliveredQty: 'delivered_qty',
  rejectedQty: 'rejected_qty',
  pendingQty: 'pending_qty',
  unitPrice: 'unit_price',
  poValue: 'po_value',
  appointmentStatus: 'appointment_status',
  deliveryStatus: 'delivery_status',
  poStatus: 'po_status',
  expiryDate: 'expiry_date',
};

// An import that is queued or running but hasn't saved progress for this long
// died with its server (restart/redeploy) rather than being merely slow.
const STALL_MINUTES = 5;
const ACTIVE_STATUSES = [
  UploadBatchStatus.UPLOADING,
  UploadBatchStatus.READING,
  UploadBatchStatus.PROCESSING,
  UploadBatchStatus.VALIDATING,
  UploadBatchStatus.COMPILING,
];

@Injectable()
export class BulkImportService {
  private readonly logger = new Logger(BulkImportService.name);

  // Imports run one at a time, in upload order: two running side by side over
  // the same POs would each create the PO the other is about to look up.
  private queue: Promise<unknown> = Promise.resolve();
  // Batches queued or running in THIS process - never mistaken for stalled.
  private readonly inFlight = new Set<string>();
  // Ids the Stop button has flagged - checked once per row (and once before a
  // still-queued import even starts), so a cancel is noticed within a row's
  // processing time, or immediately if the batch hasn't started yet.
  private readonly cancelRequested = new Set<string>();

  constructor(
    @InjectRepository(UploadBatchEntity) private readonly batchRepository: Repository<UploadBatchEntity>,
    @InjectRepository(BulkPORawRowEntity) private readonly rawRepository: Repository<BulkPORawRowEntity>,
    @InjectRepository(BulkPOProcessedRowEntity) private readonly processedRepository: Repository<BulkPOProcessedRowEntity>,
    @InjectRepository(POMasterEntity) private readonly poRepository: Repository<POMasterEntity>,
    @InjectRepository(AuditLogEntity) private readonly auditLogRepository: Repository<AuditLogEntity>,
    @InjectRepository(NotificationEntity) private readonly notificationRepository: Repository<NotificationEntity>,
    @InjectRepository(POChangeHistoryEntity) private readonly changeHistoryRepository: Repository<POChangeHistoryEntity>,
    private readonly fileReader: FileReaderService,
    private readonly columnMapping: ColumnMappingService,
    private readonly dataCleaning: DataCleaningService,
    private readonly duplicateDetection: DuplicateDetectionService,
    private readonly compilation: POCompilationService,
    private readonly reconciliation: ReconciliationEngine,
    private readonly exceptionsService: ExceptionsService,
    private readonly locationsService: LocationsService,
  ) {}

  /**
   * Registers the upload and returns right away; the import itself runs in the
   * background. A real export is thousands of rows at dozens of database round
   * trips each, which against a remote database is minutes to hours - far longer
   * than a browser or proxy keeps a request open. Progress and the outcome show
   * on the batch (status, processedRows/totalRows, counts), like any upload.
   */
  async startFile(buffer: Buffer, fileName: string, platform: string, uploadedByUserId: string): Promise<UploadBatchEntity> {
    const batchCode = await this.generateBatchCode(platform);
    const batch = await this.batchRepository.save(
      this.batchRepository.create({ batchCode, fileName, platform, uploadedByUserId, status: UploadBatchStatus.UPLOADING }),
    );

    this.inFlight.add(batch.id);
    this.queue = this.queue
      .then(() => this.runBatch(batch, buffer, fileName, platform, uploadedByUserId))
      .catch((err) => this.logger.error(`Background import ${batch.batchCode} crashed`, err as any))
      .finally(() => {
        this.inFlight.delete(batch.id);
        this.cancelRequested.delete(batch.id);
      });

    return batch;
  }

  /**
   * The Stop button. Only flags the batch - the running loop (or, if it's
   * still queued behind an earlier import, the very start of its own run)
   * notices and stops itself, so whatever's already been written stays
   * consistent instead of being torn down mid-row.
   */
  async cancelBatch(batchId: string): Promise<UploadBatchEntity> {
    const batch = await this.batchRepository.findOneBy({ id: batchId });
    if (!batch) throw new NotFoundException('Upload batch not found');
    if (!ACTIVE_STATUSES.includes(batch.status)) {
      throw new BadRequestException(`This import has already finished (${batch.status}) - nothing to stop.`);
    }
    this.cancelRequested.add(batchId);
    return batch;
  }

  // update() rather than save(): one statement instead of four, and it can never
  // re-insert a batch that was deleted while it was running.
  private async updateBatch(batch: UploadBatchEntity, patch: Partial<UploadBatchEntity>): Promise<UploadBatchEntity> {
    await this.batchRepository.update(batch.id, patch as any);
    return Object.assign(batch, patch);
  }

  private async runBatch(
    created: UploadBatchEntity,
    buffer: Buffer,
    fileName: string,
    platform: string,
    uploadedByUserId: string,
  ): Promise<UploadBatchEntity> {
    let batch = created;

    try {
      if (this.cancelRequested.has(batch.id)) {
        return await this.updateBatch(batch, { status: UploadBatchStatus.CANCELLED, errorMessage: 'Stopped before it started - still queued behind an earlier import.' });
      }
      batch = await this.updateBatch(batch, { status: UploadBatchStatus.READING });
      const { headers, rows } = this.fileReader.read(buffer, fileName);
      batch = await this.updateBatch(batch, { totalRows: rows.length, status: UploadBatchStatus.PROCESSING });

      const mapping = await this.columnMapping.buildMapping(headers, platform);

      const poNumbers = new Set<string>();
      const skuCodes = new Set<string>();
      let minDate: Date | null = null;
      let maxDate: Date | null = null;
      const seenInBatch = new Set<string>();

      let newCount = 0;
      let updatedCount = 0;
      let dupCount = 0;
      let failedCount = 0;

      // Saving progress bumps updatedAt, which is how a stalled import (server
      // restarted mid-run) is told apart from a merely slow one - so it must
      // happen at least every few seconds even when rows are slow.
      let lastFlush = Date.now();
      const flushProgress = async (processed: number) => {
        batch = await this.updateBatch(batch, {
          processedRows: processed,
          newRecords: newCount,
          updatedRecords: updatedCount,
          duplicateRecords: dupCount,
          failedRecords: failedCount,
        });
        lastFlush = Date.now();
      };

      let cancelledAt: number | null = null;
      for (let i = 0; i < rows.length; i++) {
        if (this.cancelRequested.has(batch.id)) {
          cancelledAt = i;
          break;
        }
        if (i > 0 && (i % 25 === 0 || Date.now() - lastFlush > 5000)) await flushProgress(i);

        const rawRow = await this.rawRepository.save(this.rawRepository.create({ batchId: batch.id, rowIndex: i, rawData: rows[i] }), { transaction: false });

        const cleaning = this.dataCleaning.clean(rows[i], mapping, platform);
        if (cleaning.isBlank) continue; // RAW row is preserved above; nothing further to process

        if (cleaning.cleaned.poNumber) poNumbers.add(cleaning.cleaned.poNumber);
        if (cleaning.cleaned.skuCode) skuCodes.add(cleaning.cleaned.skuCode);
        if (cleaning.cleaned.poDate) {
          if (!minDate || cleaning.cleaned.poDate < minDate) minDate = cleaning.cleaned.poDate;
          if (!maxDate || cleaning.cleaned.poDate > maxDate) maxDate = cleaning.cleaned.poDate;
        }

        // Looked up once here, reused by both classify() and compileRow() right
        // below - they used to each look this exact PO up separately.
        const existingPo =
          cleaning.status !== 'INVALID' && cleaning.cleaned.poNumber
            ? await this.poRepository.findOne({ where: { poNumber: cleaning.cleaned.poNumber, channelId: cleaning.cleaned.platform } })
            : null;

        let dedup: { classification: DedupClassification; matchedPoId?: string } = { classification: DedupClassification.NEW };
        if (cleaning.status !== 'INVALID') {
          dedup = await this.duplicateDetection.classify(cleaning.cleaned, seenInBatch, existingPo);
        }

        const processedRow = await this.processedRepository.save(
          this.processedRepository.create({
            batchId: batch.id,
            rawRowId: rawRow.id,
            platform: cleaning.cleaned.platform,
            poNumber: cleaning.cleaned.poNumber,
            poDate: cleaning.cleaned.poDate,
            appointmentDate: cleaning.cleaned.appointmentDate,
            appointmentTime: cleaning.cleaned.appointmentTime,
            warehouse: cleaning.cleaned.warehouse,
            skuCode: cleaning.cleaned.skuCode,
            upc: cleaning.cleaned.upc,
            productName: cleaning.cleaned.productName,
            mrp: cleaning.cleaned.mrp,
            orderedQty: cleaning.cleaned.orderedQty,
            acceptedQty: cleaning.cleaned.acceptedQty,
            dispatchedQty: cleaning.cleaned.dispatchedQty,
            deliveredQty: cleaning.cleaned.deliveredQty,
            rejectedQty: cleaning.cleaned.rejectedQty,
            pendingQty: cleaning.cleaned.pendingQty,
            unitPrice: cleaning.cleaned.unitPrice,
            poValue: cleaning.cleaned.poValue,
            appointmentStatus: cleaning.cleaned.appointmentStatus,
            deliveryStatus: cleaning.cleaned.deliveryStatus,
            poStatus: cleaning.cleaned.poStatus,
            expiryDate: cleaning.cleaned.expiryDate,
            validationStatus: cleaning.status,
            validationErrors: cleaning.issues.map((i) => i.message),
            dedupClassification: dedup.classification,
            matchedPoId: dedup.matchedPoId,
          }),
          { transaction: false },
        );

        if (cleaning.issues.length > 0) {
          await this.exceptionsService.raiseMany(
            cleaning.issues.map((issue) => ({
              batchId: batch.id,
              rawRowId: rawRow.id,
              processedRowId: processedRow.id,
              poNumber: cleaning.cleaned.poNumber,
              skuCode: cleaning.cleaned.skuCode,
              warehouse: cleaning.cleaned.warehouse,
              exceptionType: issue.exceptionType,
              severity: issue.severity,
              recommendedAction: issue.message,
            })),
          );
        }

        if (cleaning.status === 'INVALID') {
          failedCount++;
          continue; // RAW -> EXCEPTION QUEUE only; never touches the master
        }

        if (dedup.classification === DedupClassification.EXACT_DUPLICATE) {
          dupCount++;
          continue;
        }

        if (dedup.classification === DedupClassification.POSSIBLE_DUPLICATE) {
          await this.exceptionsService.raise({
            batchId: batch.id,
            rawRowId: rawRow.id,
            processedRowId: processedRow.id,
            poNumber: cleaning.cleaned.poNumber,
            skuCode: cleaning.cleaned.skuCode,
            warehouse: cleaning.cleaned.warehouse,
            exceptionType: ExceptionType.POSSIBLE_DUPLICATE,
            severity: ExceptionSeverity.MEDIUM,
            recommendedAction: 'Missing PO Number or SKU means this cannot be confidently matched - review manually.',
          });
          continue;
        }

        try {
          const { poId, created } = await this.compilation.compileRow(processedRow, batch, uploadedByUserId, existingPo);
          processedRow.matchedPoId = poId; // always set post-compile, so every master record traces back to its rows
          await this.processedRepository.save(processedRow, { transaction: false });
          if (created) newCount++;
          else updatedCount++;
          await this.reconciliation.reconcileRow(processedRow, batch.id);
        } catch (err) {
          this.logger.error(`Failed to compile row ${i} of batch ${batch.batchCode}`, err as any);
          failedCount++;
        }
      }

      // Authoritative count from the exceptions table itself - the in-loop
      // exceptionCount above only tracks rows flagged during cleaning, and misses
      // exceptions raised later (unknown warehouse, reconciliation mismatches).
      const totalExceptions = await this.exceptionsService.countByBatch(batch.id);

      batch = await this.updateBatch(batch, {
        processedRows: cancelledAt ?? rows.length,
        poCount: poNumbers.size,
        skuCount: skuCodes.size,
        dateRangeStart: minDate,
        dateRangeEnd: maxDate,
        newRecords: newCount,
        updatedRecords: updatedCount,
        duplicateRecords: dupCount,
        exceptionRecords: totalExceptions,
        failedRecords: failedCount,
        status:
          cancelledAt != null
            ? UploadBatchStatus.CANCELLED
            : totalExceptions > 0 || failedCount > 0
              ? UploadBatchStatus.COMPLETED_WITH_EXCEPTIONS
              : UploadBatchStatus.COMPLETED,
        errorMessage: cancelledAt != null ? `Stopped at row ${cancelledAt} of ${rows.length} - everything up to there was kept.` : undefined,
      });
    } catch (err) {
      this.logger.error(`Bulk import failed for batch ${batch.batchCode}`, err as any);
      batch = await this.updateBatch(batch, { status: UploadBatchStatus.FAILED, errorMessage: (err as Error).message });
    }

    return batch;
  }

  /**
   * An import whose server died mid-run stays PROCESSING forever and never
   * updates again - mark it failed so it doesn't look like it's still going.
   * Re-uploading the same file finishes the job: rows already imported are
   * recognised as duplicates and skipped.
   */
  private async failStalledBatches(): Promise<void> {
    const query = this.batchRepository
      .createQueryBuilder()
      .update()
      .set({
        status: UploadBatchStatus.FAILED,
        errorMessage:
          'Interrupted - the server restarted or lost its connection mid-import. Upload the file again to finish: rows already imported are recognised as duplicates and skipped.',
      })
      .where('status IN (:...active)', { active: ACTIVE_STATUSES })
      .andWhere(`"updatedAt" < now() - interval '${STALL_MINUTES} minutes'`);
    if (this.inFlight.size > 0) query.andWhere('id NOT IN (:...running)', { running: [...this.inFlight] });
    await query.execute();
  }

  async listBatches(): Promise<UploadBatchEntity[]> {
    await this.failStalledBatches();
    return this.batchRepository.find({ order: { uploadedAt: 'DESC' } });
  }

  async getBatch(id: string): Promise<UploadBatchEntity | null> {
    await this.failStalledBatches();
    return this.batchRepository.findOneBy({ id });
  }

  getBatchReconciliationSummary(rows: BulkPOProcessedRowEntity[]) {
    return this.reconciliation.summarize(rows);
  }

  async getProcessedRows(batchId: string): Promise<BulkPOProcessedRowEntity[]> {
    return this.processedRepository.find({ where: { batchId }, order: { createdAt: 'ASC' } });
  }

  async getRawRows(batchId: string): Promise<BulkPORawRowEntity[]> {
    return this.rawRepository.find({ where: { batchId }, order: { rowIndex: 'ASC' } });
  }

  /**
   * Deleting an import batch must never blindly delete POs. A PO is only
   * eligible for deletion if THIS batch created it (dedupClassification NEW)
   * AND no other batch's processed rows also reference it - otherwise another
   * import depends on that PO existing, so it's preserved and only this
   * batch's own import-record rows (raw/processed/exceptions) are removed.
   */
  async getDeletePreview(batchId: string): Promise<{
    totalRows: number;
    newPoIds: string[];
    exclusivePoIds: string[];
    preservedPoIds: string[];
  }> {
    const rows = await this.processedRepository.find({ where: { batchId } });
    const newPoIds = [...new Set(rows.filter((r) => r.dedupClassification === DedupClassification.NEW && r.matchedPoId).map((r) => r.matchedPoId as string))];
    const touchedPoIds = [...new Set(rows.map((r) => r.matchedPoId).filter((id): id is string => !!id))];

    const exclusivePoIds: string[] = [];
    for (const poId of newPoIds) {
      const otherBatchCount = await this.processedRepository.count({ where: { matchedPoId: poId, batchId: Not(batchId) } });
      if (otherBatchCount === 0) exclusivePoIds.push(poId);
    }
    const preservedPoIds = touchedPoIds.filter((id) => !exclusivePoIds.includes(id));

    return { totalRows: rows.length, newPoIds, exclusivePoIds, preservedPoIds };
  }

  async deleteBatch(batchId: string): Promise<{ deletedPoCount: number; preservedPoCount: number }> {
    const batch = await this.batchRepository.findOneBy({ id: batchId });
    if (!batch) throw new NotFoundException('Upload batch not found');
    if (this.inFlight.has(batchId)) throw new BadRequestException('This import is still running - wait for it to finish before deleting it.');

    const { exclusivePoIds, preservedPoIds } = await this.getDeletePreview(batchId);

    if (exclusivePoIds.length > 0) {
      await this.exceptionsService.deleteByPoIds(exclusivePoIds);
      await this.changeHistoryRepository.delete({ poId: In(exclusivePoIds) });
      await this.notificationRepository.delete({ poId: In(exclusivePoIds) });
      await this.auditLogRepository
        .createQueryBuilder()
        .delete()
        .where('tableName = :tableName', { tableName: 'po_master' })
        .andWhere('recordId IN (:...ids)', { ids: exclusivePoIds })
        .execute();
      // Cascades to line items, appointment, dispatch, logistics, GRN, returns, tasks.
      await this.poRepository.delete({ id: In(exclusivePoIds) });
    }

    await this.exceptionsService.deleteByBatchId(batchId);
    await this.processedRepository.delete({ batchId });
    await this.rawRepository.delete({ batchId });
    await this.batchRepository.delete({ id: batchId });

    return { deletedPoCount: exclusivePoIds.length, preservedPoCount: preservedPoIds.length };
  }

  /**
   * The "fix it" action behind the Exception Queue: apply the employee's
   * corrections to a processed row and re-run it through the exact same
   * cleaning/validation -> dedup -> compile -> reconcile pipeline as the
   * original upload. Only the exceptions that were open *before* this attempt
   * are resolved, so anything freshly raised during recompilation stays open.
   */
  async reprocessRow(
    processedRowId: string,
    corrections: Record<string, any>,
    userId: string,
  ): Promise<{ success: boolean; message: string; poId?: string; processedRow: BulkPOProcessedRowEntity }> {
    const processedRow = await this.processedRepository.findOneBy({ id: processedRowId });
    if (!processedRow) throw new NotFoundException('Processed row not found');
    const batch = await this.batchRepository.findOneBy({ id: processedRow.batchId });
    if (!batch) throw new NotFoundException('Upload batch not found');

    const priorOpenExceptions = await this.exceptionsService.listOpenByProcessedRowId(processedRowId);

    const syntheticRawRow: Record<string, any> = {};
    const identityMapping: Partial<Record<StandardBulkField, string>> = {};
    for (const [field, standardKey] of Object.entries(FIELD_TO_STANDARD)) {
      const value = corrections[field] !== undefined ? corrections[field] : (processedRow as any)[field];
      syntheticRawRow[standardKey] = value;
      identityMapping[standardKey] = standardKey;
    }

    const cleaning = this.dataCleaning.clean(syntheticRawRow, identityMapping, processedRow.platform || batch.platform);

    Object.assign(processedRow, {
      poNumber: cleaning.cleaned.poNumber,
      poDate: cleaning.cleaned.poDate,
      appointmentDate: cleaning.cleaned.appointmentDate,
      appointmentTime: cleaning.cleaned.appointmentTime,
      warehouse: cleaning.cleaned.warehouse,
      skuCode: cleaning.cleaned.skuCode,
      upc: cleaning.cleaned.upc,
      productName: cleaning.cleaned.productName,
      mrp: cleaning.cleaned.mrp,
      orderedQty: cleaning.cleaned.orderedQty,
      acceptedQty: cleaning.cleaned.acceptedQty,
      dispatchedQty: cleaning.cleaned.dispatchedQty,
      deliveredQty: cleaning.cleaned.deliveredQty,
      rejectedQty: cleaning.cleaned.rejectedQty,
      pendingQty: cleaning.cleaned.pendingQty,
      unitPrice: cleaning.cleaned.unitPrice,
      poValue: cleaning.cleaned.poValue,
      appointmentStatus: cleaning.cleaned.appointmentStatus,
      deliveryStatus: cleaning.cleaned.deliveryStatus,
      poStatus: cleaning.cleaned.poStatus,
      expiryDate: cleaning.cleaned.expiryDate,
      validationStatus: cleaning.status,
      validationErrors: cleaning.issues.map((i) => i.message),
    });

    // Only exceptions whose specific problem no longer reproduces get auto-resolved -
    // fixing the PO Number shouldn't silently close out a still-missing appointment date.
    const stillPresentTypes = new Set(cleaning.issues.map((i) => i.exceptionType));
    if (cleaning.cleaned.warehouse) {
      const { matched } = await this.locationsService.classify(cleaning.cleaned.warehouse);
      if (!matched) stillPresentTypes.add(ExceptionType.UNKNOWN_WAREHOUSE);
    }
    // QUANTITY_MISMATCH/VALUE_MISMATCH are raised by ReconciliationEngine, not
    // DataCleaningService, so they'd never appear in stillPresentTypes above -
    // a row genuinely fixed (e.g. the unit_price column mapping corrected)
    // would otherwise keep its stale mismatch exception open forever. Same
    // thresholds as reconciliation.engine.ts, checked against the row's
    // already-corrected values from the Object.assign above.
    const { orderedQty, deliveredQty, pendingQty, unitPrice, poValue } = processedRow;
    if (orderedQty != null && deliveredQty != null && pendingQty != null) {
      const expectedPending = Number(orderedQty) - Number(deliveredQty);
      if (Math.abs(expectedPending - Number(pendingQty)) > 0.01) {
        stillPresentTypes.add(ExceptionType.QUANTITY_MISMATCH);
      }
    }
    if (orderedQty != null && unitPrice != null && poValue != null) {
      const expectedValue = Number(orderedQty) * Number(unitPrice);
      if (Math.abs(expectedValue - Number(poValue)) > 1) {
        stillPresentTypes.add(ExceptionType.VALUE_MISMATCH);
      }
    }
    if (processedRow.upc && processedRow.mrp != null && (await this.reconciliation.hasMrpMismatch(processedRow.upc, Number(processedRow.mrp)))) {
      stillPresentTypes.add(ExceptionType.MRP_MISMATCH);
    }
    const idsToResolve = priorOpenExceptions.filter((e) => !stillPresentTypes.has(e.exceptionType)).map((e) => e.id);

    if (cleaning.status === 'INVALID') {
      await this.processedRepository.save(processedRow);
      return {
        success: false,
        message: `Still invalid: ${cleaning.issues.map((i) => i.message).join('; ')}`,
        processedRow,
      };
    }

    const existingPo = cleaning.cleaned.poNumber
      ? await this.poRepository.findOne({ where: { poNumber: cleaning.cleaned.poNumber, channelId: cleaning.cleaned.platform } })
      : null;
    const dedup = await this.duplicateDetection.classify(cleaning.cleaned, new Set(), existingPo);
    processedRow.dedupClassification = dedup.classification;

    if (dedup.classification === DedupClassification.EXACT_DUPLICATE) {
      await this.processedRepository.save(processedRow);
      await this.exceptionsService.resolveMany(idsToResolve, 'Corrected - now matches existing data exactly, nothing new compiled.');
      return { success: true, message: 'This now matches existing data exactly - nothing new was compiled.', processedRow };
    }

    const { poId } = await this.compilation.compileRow(processedRow, batch, userId, existingPo);
    processedRow.matchedPoId = poId;
    await this.processedRepository.save(processedRow);
    await this.reconciliation.reconcileRow(processedRow, batch.id);
    await this.exceptionsService.resolveMany(idsToResolve, 'Fixed and recompiled from the Exception Queue.');

    const remaining = priorOpenExceptions.length - idsToResolve.length;
    return {
      success: true,
      message: remaining > 0 ? 'Fixed and compiled - some other issues on this row are still open.' : 'Fixed and compiled successfully.',
      poId,
      processedRow,
    };
  }

  private async generateBatchCode(platform: string): Promise<string> {
    const prefix = (platform.replace(/[^A-Za-z]/g, '').slice(0, 3) || 'GEN').toUpperCase();
    const datePart = format(new Date(), 'yyyyMMdd');
    // Numbered from the highest existing code, not a count: deleting a batch
    // from history would otherwise make the next code collide with a survivor.
    const latest = await this.batchRepository.findOne({ where: { batchCode: Like(`${prefix}-${datePart}-%`) }, order: { batchCode: 'DESC' } });
    const next = parseInt((latest?.batchCode ?? '').split('-').pop() || '0', 10) + 1;
    const seq = String(next).padStart(3, '0');
    return `${prefix}-${datePart}-${seq}`;
  }
}
