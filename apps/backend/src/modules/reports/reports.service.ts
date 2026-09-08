import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { GRNTrackerEntity } from '../../database/entities/grn-tracker.entity';
import { ReturnTrackerEntity } from '../../database/entities/return-tracker.entity';
import { POStatus } from '@po-control-tower/shared';

function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(POMasterEntity)
    private readonly poRepository: Repository<POMasterEntity>,
    @InjectRepository(GRNTrackerEntity)
    private readonly grnRepository: Repository<GRNTrackerEntity>,
    @InjectRepository(ReturnTrackerEntity)
    private readonly returnRepository: Repository<ReturnTrackerEntity>,
  ) {}

  async openPosCsv(): Promise<string> {
    const terminal = [POStatus.CLOSED, POStatus.CANCELLED, POStatus.RETURNED];
    const pos = await this.poRepository.find();
    const open = pos.filter((p) => !terminal.includes(p.status));
    return toCsv(
      open.map((p) => ({
        poNumber: p.poNumber,
        status: p.status,
        riskStatus: p.riskStatus,
        priorityScore: p.priorityScore,
        poValue: p.poValue,
        poExpiryDate: p.poExpiryDate,
        location: p.location,
        customerId: p.customerId,
      })),
    );
  }

  async expiryCsv(): Promise<string> {
    const pos = await this.poRepository.find({ order: { poExpiryDate: 'ASC' } });
    return toCsv(
      pos.map((p) => ({
        poNumber: p.poNumber,
        status: p.status,
        riskStatus: p.riskStatus,
        poExpiryDate: p.poExpiryDate,
        poValue: p.poValue,
      })),
    );
  }

  async grnAgeingCsv(): Promise<string> {
    const grns = await this.grnRepository.find();
    return toCsv(
      grns.map((g) => ({
        poId: g.poId,
        grnNumber: g.grnNumber,
        outcome: g.outcome,
        discrepancyAmount: g.discrepancyAmount,
        slaStatus: g.slaStatus,
        grnDate: g.grnDate,
      })),
    );
  }

  async returnsCsv(): Promise<string> {
    const returns = await this.returnRepository.find();
    return toCsv(
      returns.map((r) => ({
        poId: r.poId,
        returnType: r.returnType,
        rootCause: r.rootCause,
        lossAmount: r.lossAmount,
        creditNoteNumber: r.creditNoteNumber,
        returnDate: r.returnDate,
      })),
    );
  }
}
