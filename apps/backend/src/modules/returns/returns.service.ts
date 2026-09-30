import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import ExcelJS from 'exceljs';
import { ReturnTrackerEntity } from '../../database/entities/return-tracker.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { POLineItemEntity } from '../../database/entities/po-line-item.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { TaskEntity } from '../../database/entities/task.entity';
import { POStatus, TaskType } from '@po-control-tower/shared';

// Fixed to IST regardless of the server's own clock/timezone - see the same
// class of bug fixed in po-reports.service.ts's date formatter.
function istDate(d: Date | null | undefined): string {
  return d ? new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '';
}

export interface ExpiredUndeliveredRow {
  returnId: string;
  poId: string;
  poNumber: string;
  channel: string;
  location: string;
  invoiceValue: number;
  dispatchDate: Date | null;
  poExpiryDate: Date;
  daysOverdue: number;
  courierStatus: string | null;
  deliveryPartner: string | null;
  awb: string | null;
  recalledAt: Date;
  creditNoteStatus: string | null;
  closed: boolean;
  rootCause: string | null;
  creditNoteNumber: string | null;
}

@Injectable()
export class ReturnsService {
  constructor(
    @InjectRepository(ReturnTrackerEntity)
    private readonly returnRepository: Repository<ReturnTrackerEntity>,
    @InjectRepository(POMasterEntity)
    private readonly poRepository: Repository<POMasterEntity>,
    @InjectRepository(POLineItemEntity)
    private readonly lineItemRepository: Repository<POLineItemEntity>,
    @InjectRepository(DispatchEntity)
    private readonly dispatchRepository: Repository<DispatchEntity>,
    @InjectRepository(TaskEntity)
    private readonly taskRepository: Repository<TaskEntity>,
  ) {}

  async list(): Promise<ReturnTrackerEntity[]> {
    return this.returnRepository.find({ relations: ['po'], order: { createdAt: 'DESC' } });
  }

  async getByPo(poId: string): Promise<ReturnTrackerEntity | null> {
    return this.returnRepository.findOneBy({ poId });
  }

  async create(
    poId: string,
    data: { returnType: ReturnTrackerEntity['returnType']; rootCause?: string; lossAmount?: number },
  ): Promise<ReturnTrackerEntity> {
    const existing = await this.returnRepository.findOneBy({ poId });
    if (existing) return existing;

    const record = this.returnRepository.create({
      poId,
      returnDate: new Date(),
      returnType: data.returnType,
      rootCause: data.rootCause,
      lossAmount: data.lossAmount,
    });
    const saved = await this.returnRepository.save(record);

    const po = await this.poRepository.findOneBy({ id: poId });
    if (po) {
      po.status = POStatus.RETURNED;
      await this.poRepository.save(po);
    }

    // A RECALL_NOT_DELIVERED return means the whole dispatched shipment is
    // physically back, not with the customer - reset dispatchedQuantity so
    // this stock reads as available again (stuck-stock detection and PO
    // Mapping's availability math both key off quantity - dispatchedQuantity,
    // which would otherwise stay 0 forever for an already-dispatched PO).
    // The other return types (REJECTED_GRN/DAMAGE/SHORTAGE) happen post-GRN,
    // a different accounting situation - left untouched.
    if (data.returnType === 'RECALL_NOT_DELIVERED') {
      await this.lineItemRepository.update({ poId }, { dispatchedQuantity: 0 });
    }

    return saved;
  }

  async close(
    id: string,
    data: { rootCause: string; creditNoteNumber?: string; lossAmount?: number; dncnType?: 'DEBIT' | 'CREDIT'; dncnValue?: number },
  ): Promise<ReturnTrackerEntity> {
    if (!data.rootCause) {
      throw new BadRequestException('Root cause is required to close a return');
    }
    const record = await this.returnRepository.findOneBy({ id });
    if (!record) throw new NotFoundException('Return record not found');

    record.rootCause = data.rootCause;
    if (data.creditNoteNumber) record.creditNoteNumber = data.creditNoteNumber;
    if (data.lossAmount !== undefined) record.lossAmount = data.lossAmount;
    if (data.dncnType !== undefined) record.dncnType = data.dncnType;
    if (data.dncnValue !== undefined) record.dncnValue = data.dncnValue;
    return this.returnRepository.save(record);
  }

  /**
   * POs that were dispatched but expired before ever being delivered - the
   * "Recall - Not Delivered" return type, raised automatically by
   * automation.service.ts's recallCheck (or manually, the same way). Distinct
   * from the Not Fulfilled page: those never left our hands at all; these
   * genuinely shipped and are either still in transit, RTO'd, or otherwise
   * lost track of, past the PO's expiry date.
   */
  private async loadExpiredUndelivered(): Promise<ExpiredUndeliveredRow[]> {
    const returns = await this.returnRepository.find({
      where: { returnType: 'RECALL_NOT_DELIVERED' },
      order: { returnDate: 'DESC' },
    });
    if (returns.length === 0) return [];

    const poIds = returns.map((r) => r.poId);
    const [pos, dispatches, tasks] = await Promise.all([
      this.poRepository.find({ where: { id: In(poIds) } }),
      this.dispatchRepository.find({ where: { poId: In(poIds) } }),
      this.taskRepository.find({ where: { poId: In(poIds), taskType: TaskType.RETURN_CN } }),
    ]);
    const poById = new Map(pos.map((p) => [p.id, p]));
    const dispatchByPo = new Map(dispatches.map((d) => [d.poId, d]));
    // A PO can have more than one RETURN_CN task over time (rare, but
    // possible) - the most recently created one reflects where things stand.
    const taskByPo = new Map<string, TaskEntity>();
    for (const t of tasks) {
      const existing = taskByPo.get(t.poId);
      if (!existing || t.createdAt > existing.createdAt) taskByPo.set(t.poId, t);
    }

    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    return returns
      .map((r) => {
        const po = poById.get(r.poId);
        if (!po || po.isDeleted) return null;
        const dispatch = dispatchByPo.get(r.poId);
        const task = taskByPo.get(r.poId);
        const row: ExpiredUndeliveredRow = {
          returnId: r.id,
          poId: po.id,
          poNumber: po.poNumber,
          channel: po.channelId,
          location: po.location,
          invoiceValue: Number(dispatch?.invoiceValue) || 0,
          dispatchDate: dispatch?.actualDispatchDate ?? null,
          poExpiryDate: po.poExpiryDate,
          daysOverdue: Math.max(0, Math.floor((now - new Date(po.poExpiryDate).getTime()) / DAY_MS)),
          courierStatus: dispatch?.dispatchStatus ?? null,
          deliveryPartner: dispatch?.transporterId ?? null,
          awb: dispatch?.awbNumber ?? null,
          recalledAt: r.returnDate,
          creditNoteStatus: task?.status ?? null,
          closed: !!r.rootCause,
          rootCause: r.rootCause ?? null,
          creditNoteNumber: r.creditNoteNumber ?? null,
        };
        return row;
      })
      .filter((r): r is ExpiredUndeliveredRow => r !== null)
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }

  async getExpiredUndeliveredDashboard(): Promise<{
    total: number;
    totalInvoiceValue: number;
    openCreditNoteTasks: number;
    rows: ExpiredUndeliveredRow[];
  }> {
    const rows = await this.loadExpiredUndelivered();
    return {
      total: rows.length,
      totalInvoiceValue: rows.reduce((s, r) => s + r.invoiceValue, 0),
      openCreditNoteTasks: rows.filter((r) => r.creditNoteStatus && r.creditNoteStatus !== 'COMPLETED').length,
      rows,
    };
  }

  async buildExpiredUndeliveredWorkbook(): Promise<Buffer> {
    const rows = await this.loadExpiredUndelivered();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Expired - Dispatched Not Delivered');
    sheet.columns = [
      { header: 'PO Number', key: 'poNumber', width: 18 },
      { header: 'Channel', key: 'channel', width: 14 },
      { header: 'Location/Hub', key: 'location', width: 26 },
      { header: 'Dispatched', key: 'dispatchDate', width: 14 },
      { header: 'PO Expiry', key: 'poExpiryDate', width: 14 },
      { header: 'Days Overdue', key: 'daysOverdue', width: 14 },
      { header: 'Invoice Value', key: 'invoiceValue', width: 16 },
      { header: 'Delivery Partner', key: 'deliveryPartner', width: 18 },
      { header: 'AWB', key: 'awb', width: 18 },
      { header: 'Courier Status', key: 'courierStatus', width: 16 },
      { header: 'Recalled On', key: 'recalledAt', width: 14 },
      { header: 'Credit Note Task', key: 'creditNoteStatus', width: 16 },
      { header: 'Closed', key: 'closed', width: 10 },
      { header: 'Root Cause', key: 'rootCause', width: 30 },
      { header: 'DNCN Number', key: 'creditNoteNumber', width: 16 },
    ];
    sheet.getRow(1).font = { bold: true };

    let totalValue = 0;
    for (const r of rows) {
      totalValue += r.invoiceValue;
      sheet.addRow({
        poNumber: r.poNumber,
        channel: r.channel,
        location: r.location,
        dispatchDate: istDate(r.dispatchDate),
        poExpiryDate: istDate(r.poExpiryDate),
        daysOverdue: r.daysOverdue,
        invoiceValue: r.invoiceValue,
        deliveryPartner: r.deliveryPartner || '',
        awb: r.awb || '',
        courierStatus: r.courierStatus || '',
        recalledAt: istDate(r.recalledAt),
        creditNoteStatus: r.creditNoteStatus || '',
        closed: r.closed ? 'Yes' : 'No',
        rootCause: r.rootCause || '',
        creditNoteNumber: r.creditNoteNumber || '',
      });
    }

    const totalRow = sheet.addRow({ poNumber: 'Grand Total', invoiceValue: totalValue });
    totalRow.font = { bold: true };
    totalRow.eachCell({ includeEmpty: true }, (cell) => (cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }));

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
