import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ExceptionEntity } from '../../database/entities/exception.entity';
import { BulkPORawRowEntity } from '../../database/entities/bulk-raw-row.entity';
import { BulkPOProcessedRowEntity } from '../../database/entities/bulk-processed-row.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { ExceptionType, ExceptionSeverity, ExceptionResolutionStatus } from '@po-control-tower/shared';

export interface RaiseExceptionInput {
  batchId?: string;
  poId?: string;
  rawRowId?: string;
  processedRowId?: string;
  poNumber?: string;
  skuCode?: string;
  warehouse?: string;
  exceptionType: ExceptionType;
  severity: ExceptionSeverity;
  financialImpact?: number;
  ownerId?: string;
  recommendedAction?: string;
}

@Injectable()
export class ExceptionsService {
  constructor(
    @InjectRepository(ExceptionEntity)
    private readonly exceptionRepository: Repository<ExceptionEntity>,
    @InjectRepository(BulkPORawRowEntity)
    private readonly rawRowRepository: Repository<BulkPORawRowEntity>,
    @InjectRepository(BulkPOProcessedRowEntity)
    private readonly processedRowRepository: Repository<BulkPOProcessedRowEntity>,
    @InjectRepository(POMasterEntity)
    private readonly poRepository: Repository<POMasterEntity>,
  ) {}

  raise(input: RaiseExceptionInput): Promise<ExceptionEntity> {
    return this.exceptionRepository.save(this.exceptionRepository.create(input));
  }

  raiseMany(inputs: RaiseExceptionInput[]): Promise<ExceptionEntity[]> {
    return this.exceptionRepository.save(inputs.map((i) => this.exceptionRepository.create(i)));
  }

  list(filters: { status?: ExceptionResolutionStatus; severity?: ExceptionSeverity; type?: ExceptionType; batchId?: string; poId?: string }) {
    const where: any = {};
    if (filters.status) where.resolutionStatus = filters.status;
    if (filters.severity) where.severity = filters.severity;
    if (filters.type) where.exceptionType = filters.type;
    if (filters.batchId) where.batchId = filters.batchId;
    if (filters.poId) where.poId = filters.poId;
    return this.exceptionRepository.find({ where, order: { detectedAt: 'DESC' } });
  }

  getById(id: string): Promise<ExceptionEntity | null> {
    return this.exceptionRepository.findOneBy({ id });
  }

  /**
   * Everything an employee needs to understand and fix an exception in one
   * place: the exception itself, the exact raw file row it came from, the
   * cleaned/validated row (editable), and the compiled PO if one exists.
   */
  async getDetail(id: string) {
    const exception = await this.exceptionRepository.findOneBy({ id });
    if (!exception) return null;

    const [rawRow, processedRow, po] = await Promise.all([
      exception.rawRowId ? this.rawRowRepository.findOneBy({ id: exception.rawRowId }) : Promise.resolve(null),
      exception.processedRowId ? this.processedRowRepository.findOneBy({ id: exception.processedRowId }) : Promise.resolve(null),
      exception.poId ? this.poRepository.findOneBy({ id: exception.poId }) : Promise.resolve(null),
    ]);

    return { exception, rawRow, processedRow, po };
  }

  async resolve(id: string, resolutionNotes?: string, resolutionStatus: ExceptionResolutionStatus = ExceptionResolutionStatus.RESOLVED) {
    await this.exceptionRepository.update(id, { resolutionStatus, resolutionNotes });
    return this.exceptionRepository.findOneBy({ id });
  }

  async listOpenByProcessedRowId(processedRowId: string): Promise<ExceptionEntity[]> {
    return this.exceptionRepository.find({
      where: { processedRowId, resolutionStatus: ExceptionResolutionStatus.OPEN },
    });
  }

  /** Resolves an exact, pre-captured set of exception ids - never a blanket "all open for this row" sweep, so freshly-raised exceptions from the same fix attempt aren't swallowed. */
  async resolveMany(ids: string[], resolutionNotes: string): Promise<void> {
    if (ids.length === 0) return;
    await this.exceptionRepository.update({ id: In(ids) }, { resolutionStatus: ExceptionResolutionStatus.RESOLVED, resolutionNotes });
  }

  /** Resolves every still-OPEN exception of a given type whose warehouse matches - used when the underlying cause (e.g. an unknown warehouse) gets fixed at the source instead of case-by-case. Returns how many were resolved. */
  async resolveOpenByTypeAndWarehouse(exceptionType: ExceptionType, matches: (warehouse: string) => boolean, resolutionNotes: string): Promise<number> {
    const open = await this.exceptionRepository.find({
      where: { exceptionType, resolutionStatus: ExceptionResolutionStatus.OPEN },
    });
    const toResolve = open.filter((e) => e.warehouse && matches(e.warehouse));
    if (toResolve.length === 0) return 0;
    await this.exceptionRepository.update(
      { id: In(toResolve.map((e) => e.id)) },
      { resolutionStatus: ExceptionResolutionStatus.RESOLVED, resolutionNotes },
    );
    return toResolve.length;
  }

  countByBatch(batchId: string): Promise<number> {
    return this.exceptionRepository.count({ where: { batchId } });
  }

  async deleteByBatchId(batchId: string): Promise<void> {
    await this.exceptionRepository.delete({ batchId });
  }

  async deleteByPoIds(poIds: string[]): Promise<void> {
    if (poIds.length === 0) return;
    await this.exceptionRepository.delete({ poId: In(poIds) });
  }
}
