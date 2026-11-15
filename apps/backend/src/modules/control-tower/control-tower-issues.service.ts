import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { POIssueEntity } from '../../database/entities/po-issue.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { ISSUE_STATUS, ISSUE_TYPES, normChan, PRIORITIES } from './control-tower.core';
import { ControlTowerService } from './control-tower.service';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const EDITABLE = ['issueType', 'priority', 'status', 'assignee', 'nextActionDate', 'description', 'resolution'] as const;
type Editable = (typeof EDITABLE)[number];

/**
 * Issues CRM against POs, plus the audit trail read side. Every write is
 * logged to audit_logs with recordId = the PO's id, so one query returns a
 * PO's whole history (team-field edits and issue changes alike).
 */
@Injectable()
export class ControlTowerIssuesService {
  constructor(
    @InjectRepository(POIssueEntity) private readonly issueRepo: Repository<POIssueEntity>,
    @InjectRepository(POMasterEntity) private readonly poRepo: Repository<POMasterEntity>,
    @InjectRepository(AuditLogEntity) private readonly auditRepo: Repository<AuditLogEntity>,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    private readonly tower: ControlTowerService,
  ) {}

  private clean(field: Editable, v: unknown): string | null {
    const s = v == null ? '' : String(v).trim();
    if (!s) {
      if (field === 'issueType' || field === 'priority' || field === 'status') throw new BadRequestException(`${field} is required`);
      return null;
    }
    if (field === 'issueType' && !ISSUE_TYPES.includes(s)) throw new BadRequestException(`issueType must be one of ${ISSUE_TYPES.join(', ')}`);
    if (field === 'priority' && !PRIORITIES.includes(s)) throw new BadRequestException(`priority must be one of ${PRIORITIES.join(', ')}`);
    if (field === 'status' && !ISSUE_STATUS.includes(s)) throw new BadRequestException(`status must be one of ${ISSUE_STATUS.join(', ')}`);
    if (field === 'nextActionDate' && !ISO.test(s)) throw new BadRequestException('nextActionDate must be YYYY-MM-DD');
    return s;
  }

  private shape(i: POIssueEntity, po?: POMasterEntity) {
    const { po: _po, ...rest } = i as any;
    return { ...rest, poNumber: po?.poNumber, platform: po ? normChan(po.channelId) || 'Other' : undefined };
  }

  async list(f: { status?: string; open?: boolean; poNumber?: string; platform?: string; assignee?: string }) {
    const where: any = {};
    if (f.status) where.status = f.status;
    else if (f.open) where.status = Not('Resolved');
    if (f.assignee) where.assignee = f.assignee;
    if (f.poNumber) {
      const po = await this.poRepo.findOneBy({ poNumber: f.poNumber });
      if (!po) return [];
      where.poId = po.id;
    }
    const issues = await this.issueRepo.find({ where, order: { createdAt: 'DESC' }, take: 2000 });
    const pos = await this.poRepo.find({ where: { id: In([...new Set(issues.map((i) => i.poId))]) }, select: ['id', 'poNumber', 'channelId'] });
    const byId = new Map(pos.map((p) => [p.id, p]));
    return issues.map((i) => this.shape(i, byId.get(i.poId))).filter((i) => !f.platform || f.platform === 'ALL' || i.platform === f.platform);
  }

  async create(body: Record<string, unknown>, userId: string) {
    const poNumber = String(body.poNumber || '').trim();
    const po = poNumber ? await this.poRepo.findOneBy({ poNumber }) : null;
    if (!po) throw new NotFoundException(`PO ${poNumber || '(blank)'} not found`);
    const issue = this.issueRepo.create({
      poId: po.id,
      issueType: this.clean('issueType', body.issueType)!,
      priority: this.clean('priority', body.priority ?? 'Medium')!,
      status: this.clean('status', body.status ?? 'Open')!,
      assignee: this.clean('assignee', body.assignee),
      nextActionDate: this.clean('nextActionDate', body.nextActionDate),
      description: this.clean('description', body.description),
      raisedByUserId: userId,
    });
    if (issue.status === 'Resolved') { issue.resolvedAt = new Date(); issue.resolvedByUserId = userId; }
    const saved = await this.issueRepo.save(issue);
    await this.auditRepo.save(this.auditRepo.create({
      tableName: 'po_issues', recordId: po.id, fieldName: `issue ${saved.id.slice(0, 8)} raised`, newValue: `${saved.issueType} · ${saved.priority} · ${saved.status}`, userId,
    }));
    this.tower.invalidate();
    return this.shape(saved, po);
  }

  async update(id: string, body: Record<string, unknown>, userId: string) {
    const issue = await this.issueRepo.findOneBy({ id });
    if (!issue) throw new NotFoundException('Issue not found');
    const before: Record<string, any> = { ...issue };
    for (const [k, v] of Object.entries(body || {})) {
      if (!(EDITABLE as readonly string[]).includes(k)) throw new BadRequestException(`Unknown field "${k}"`);
      (issue as any)[k] = this.clean(k as Editable, v);
    }
    const changes = EDITABLE.filter((k) => (before[k] ?? null) !== ((issue as any)[k] ?? null));
    if (!changes.length) return this.shape(issue);
    if (issue.status === 'Resolved' && before.status !== 'Resolved') { issue.resolvedAt = new Date(); issue.resolvedByUserId = userId; }
    if (issue.status !== 'Resolved' && before.status === 'Resolved') { issue.resolvedAt = null; issue.resolvedByUserId = null; }
    const saved = await this.issueRepo.save(issue);
    await this.auditRepo.save(changes.map((k) => this.auditRepo.create({
      tableName: 'po_issues', recordId: issue.poId, fieldName: `issue ${id.slice(0, 8)} ${k}`,
      oldValue: before[k] ?? undefined, newValue: (issue as any)[k] ?? undefined, userId,
    })));
    this.tower.invalidate();
    const po = await this.poRepo.findOne({ where: { id: issue.poId }, select: ['id', 'poNumber', 'channelId'] });
    return this.shape(saved, po ?? undefined);
  }

  /**
   * Audit trail: who changed what, when. With a PO number, that PO's full
   * history (every audit_logs row whose recordId is the PO); without one, the
   * latest Control Tower changes across all POs.
   */
  async audit(f: { poNumber?: string; limit?: number }) {
    const take = Math.min(Math.max(Number(f.limit) || 200, 1), 1000);
    let rows: AuditLogEntity[];
    if (f.poNumber) {
      const po = await this.poRepo.findOneBy({ poNumber: f.poNumber });
      if (!po) throw new NotFoundException(`PO ${f.poNumber} not found`);
      rows = await this.auditRepo.find({ where: { recordId: po.id }, order: { createdAt: 'DESC' }, take });
    } else {
      rows = await this.auditRepo.find({ where: { tableName: In(['po_tracking', 'po_issues']) }, order: { createdAt: 'DESC' }, take });
    }
    const users = await this.userRepo.find({ where: { id: In([...new Set(rows.map((r) => r.userId).filter(Boolean))]) }, select: ['id', 'name', 'email'] });
    const uname = new Map(users.map((u) => [u.id, u.name || u.email]));
    const pos = await this.poRepo.find({ where: { id: In([...new Set(rows.map((r) => r.recordId))]) }, select: ['id', 'poNumber'] });
    const pnum = new Map(pos.map((p) => [p.id, p.poNumber]));
    return rows.map((r) => ({
      id: r.id, at: r.createdAt, table: r.tableName, poNumber: pnum.get(r.recordId) ?? null, field: r.fieldName,
      oldValue: r.oldValue ?? null, newValue: r.newValue ?? null, by: uname.get(r.userId) ?? r.userId,
    }));
  }
}
