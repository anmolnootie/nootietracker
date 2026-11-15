import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { POStatus, RiskStatus } from '@po-control-tower/shared';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { POTrackingEntity } from '../../database/entities/po-tracking.entity';
import { SystemConfigEntity } from '../../database/entities/system-config.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { SheetTrackerImportService } from '../sheet-tracker-import/sheet-tracker-import.service';
import { ControlTowerService, istDay } from '../control-tower/control-tower.service';
import { buildPOs, BuiltPo, parseDispatch, parseOrderBook, parseTabs } from './warehouse-master.parse';

const STATUS_KEY = 'warehouse_master_import';
const CHUNK = 500;

/** Tab name -> how many header rows to skip (manual §4: ORDER BOOK and DISPATCH + GRN data start at row 4, the platform tabs at row 2). */
const TABS = { 'ORDER BOOK': 3, 'DISPATCH + GRN': 3, GRN: 1, BLINKIT: 1, FLIPKART: 1, ZEPTO: 1, SWIGGY: 1 } as const;
type TabName = keyof typeof TABS;

export interface WarehouseMasterResult {
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  fileName: string;
  startedAt: string;
  finishedAt?: string;
  tabsFound: string[];
  posInSheet?: number;
  created?: number;
  alreadyExisted?: number;
  decisions?: Record<string, number>;
  byPlatform?: Record<string, number>;
  dispatchRows?: number;
  sheetSync?: string;
  notes?: Record<string, number>;
  error?: string;
}

/**
 * Warehouse Master import: creates one PO header per PO number found in the
 * Warehouse Master (Order Book + Dispatch + platform tabs), using the manual's
 * cleaning and decision rules, then feeds the DISPATCH + GRN tab through the
 * existing Master Tracker sync so invoices, delivery and GRN attach to those
 * POs. POs that already exist are left untouched. SKU lines come later from
 * bulk PO uploads, which match on PO number.
 */
@Injectable()
export class WarehouseMasterService {
  private readonly logger = new Logger(WarehouseMasterService.name);
  private running = false;

  constructor(
    @InjectRepository(POMasterEntity) private readonly poRepo: Repository<POMasterEntity>,
    @InjectRepository(AppointmentEntity) private readonly apptRepo: Repository<AppointmentEntity>,
    @InjectRepository(DispatchEntity) private readonly dispatchRepo: Repository<DispatchEntity>,
    @InjectRepository(POTrackingEntity) private readonly trackingRepo: Repository<POTrackingEntity>,
    @InjectRepository(SystemConfigEntity) private readonly configRepo: Repository<SystemConfigEntity>,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    private readonly sheetSync: SheetTrackerImportService,
    private readonly tower: ControlTowerService,
  ) {}

  async status(): Promise<WarehouseMasterResult | null> {
    const row = await this.configRepo.findOneBy({ key: STATUS_KEY });
    return (row?.value as unknown as WarehouseMasterResult) ?? null;
  }

  private async save(result: WarehouseMasterResult, userId: string) {
    const row = await this.configRepo.findOneBy({ key: STATUS_KEY });
    if (row) await this.configRepo.update(row.id, { value: result as any, updatedByUserId: userId } as any);
    else await this.configRepo.save(this.configRepo.create({ key: STATUS_KEY, value: result as any, updatedByUserId: userId }));
  }

  /** Reads the workbook, starts the import in the background and returns at once. */
  async start(buffer: Buffer, fileName: string, userId: string): Promise<WarehouseMasterResult> {
    if (this.running) throw new ConflictException('A Warehouse Master import is already running');
    if (!/\.(xlsx|xls)$/i.test(fileName)) throw new BadRequestException('Upload the Warehouse Master as an Excel file (File > Download > Microsoft Excel)');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const grids: Partial<Record<TabName, unknown[][]>> = {};
    for (const name of wb.SheetNames) {
      const key = name.trim().toUpperCase() as TabName;
      // raw: false = the formatted text people see, which is what the manual's parsers expect.
      if (key in TABS) grids[key] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' }) as unknown[][];
    }
    if (!grids['ORDER BOOK'] && !grids['DISPATCH + GRN']) {
      throw new BadRequestException(`This file has no "ORDER BOOK" or "DISPATCH + GRN" tab (found: ${wb.SheetNames.join(', ')})`);
    }
    return this.startFromGrids(grids, fileName, userId);
  }

  /**
   * Automatic sync: the Apps Script inside the Warehouse Master posts its tabs
   * (display values) every 15 minutes. Same import as a file upload; runs as
   * the first active ADMIN user, since there is no person behind a timer.
   */
  async startFromSheet(tabs: Record<string, unknown[][]>): Promise<{ status: string; message: string }> {
    if (this.running) return { status: 'BUSY', message: 'An import is still running; this push was skipped' };
    const grids: Partial<Record<TabName, unknown[][]>> = {};
    for (const [name, rows] of Object.entries(tabs || {})) {
      const key = name.trim().toUpperCase() as TabName;
      if (key in TABS && Array.isArray(rows)) grids[key] = rows;
    }
    if (!grids['ORDER BOOK'] && !grids['DISPATCH + GRN']) throw new BadRequestException('No "ORDER BOOK" or "DISPATCH + GRN" tab in the push');
    const admin = (await this.userRepo.find({ where: { isActive: true } })).find((u) => (u.roles as string[]).includes('ADMIN'));
    if (!admin) throw new BadRequestException('No active ADMIN user to run the sync as');
    await this.startFromGrids(grids, 'Google Sheet (automatic sync)', admin.id);
    return { status: 'STARTED', message: 'Received - importing in the background. Results show on Uploads > Warehouse Master.' };
  }

  private async startFromGrids(grids: Partial<Record<TabName, unknown[][]>>, fileName: string, userId: string): Promise<WarehouseMasterResult> {
    if (this.running) throw new ConflictException('A Warehouse Master import is already running');
    const result: WarehouseMasterResult = { status: 'RUNNING', fileName, startedAt: new Date().toISOString(), tabsFound: Object.keys(grids) };
    await this.save(result, userId);
    this.running = true;
    this.run(grids, result, userId)
      .catch(async (e) => {
        this.logger.error('Warehouse Master import failed', e as any);
        await this.save({ ...result, status: 'FAILED', error: (e as Error).message, finishedAt: new Date().toISOString() }, userId);
      })
      .finally(() => { this.running = false; });
    return result;
  }

  private async run(grids: Partial<Record<TabName, unknown[][]>>, result: WarehouseMasterResult, userId: string) {
    const asof = istDay(new Date())!;
    const body = (k: TabName, max = 6000) => (grids[k] || []).slice(TABS[k], TABS[k] + max);
    const ob = parseOrderBook(body('ORDER BOOK', 5500), asof);
    const dg = parseDispatch(body('DISPATCH + GRN', 5000));
    const tabs = parseTabs({ blinkit: body('BLINKIT', 400), flipkart: body('FLIPKART', 120), zepto: body('ZEPTO', 400), swiggy: body('SWIGGY', 200) });
    const built = buildPOs(ob, dg, tabs);

    const existing = new Set<string>();
    for (let i = 0; i < built.length; i += CHUNK) {
      const rows = await this.poRepo.find({ where: { poNumber: In(built.slice(i, i + CHUNK).map((p) => p.po)) }, select: ['poNumber'] });
      rows.forEach((r) => existing.add(r.poNumber));
    }
    const toCreate = built.filter((p) => !existing.has(p.po));
    const decisions: Record<string, number> = {};
    const byPlatform: Record<string, number> = {};
    const notes: Record<string, number> = {};
    built.forEach((p) => {
      decisions[p.dec] = (decisions[p.dec] || 0) + 1;
      byPlatform[p.plat] = (byPlatform[p.plat] || 0) + 1;
      p.rem.split(' | ').forEach((n) => { if (/NOT in Order Book|merged|cleared|no invoice in Dispatch/.test(n)) notes[n] = (notes[n] || 0) + 1; });
    });

    for (let i = 0; i < toCreate.length; i += CHUNK) await this.createChunk(toCreate.slice(i, i + CHUNK), asof, userId);

    // A PO the sheet later marks cancelled / declined: record it, but never overwrite a decision the team set.
    const closedLater = built.filter((p) => existing.has(p.po) && ['Declined', 'Cancelled', 'Expired'].includes(p.dec));
    for (let i = 0; i < closedLater.length; i += CHUNK) {
      const slice = closedLater.slice(i, i + CHUNK);
      const pos = await this.poRepo.find({ where: { poNumber: In(slice.map((p) => p.po)) }, select: ['id', 'poNumber'] });
      const idOf = new Map(pos.map((p) => [p.poNumber, p.id]));
      const tracked = await this.trackingRepo.find({ where: { poId: In(pos.map((p) => p.id)) } });
      const hasDecision = new Set(tracked.filter((t) => t.decision).map((t) => t.poId));
      const byPoId = new Map(tracked.map((t) => [t.poId, t]));
      const rows = slice.filter((p) => idOf.has(p.po) && !hasDecision.has(idOf.get(p.po)!)).map((p) => {
        const row = byPoId.get(idOf.get(p.po)!) || this.trackingRepo.create({ poId: idOf.get(p.po)! });
        return Object.assign(row, { decision: p.dec, decisionReason: p.reason || null, updatedByUserId: userId });
      });
      if (rows.length) await this.trackingRepo.save(rows, { chunk: 100 });
    }

    // Invoices, delivery, GRN, losses and credit notes: the DISPATCH + GRN tab is the Master
    // Dispatch & GRN Tracker, so the existing sync applies it to the POs just created.
    let sheetSync = 'No DISPATCH + GRN tab in the file';
    if (grids['DISPATCH + GRN']?.length) {
      const r: any = await this.sheetSync.syncFromGrid(grids['DISPATCH + GRN'] as any[][]);
      sheetSync = r.unchanged ? 'Unchanged since the last sync' : r.busy ? `Another sync (${r.batchCode}) was running; run Google Sheets sync again later` : `Started batch ${r.batchCode} (see Uploads > Google Sheets sync)`;
    }
    this.tower.invalidate();
    await this.save({
      ...result, status: 'COMPLETED', finishedAt: new Date().toISOString(), posInSheet: built.length, created: toCreate.length,
      alreadyExisted: built.length - toCreate.length, decisions, byPlatform, dispatchRows: dg.length, sheetSync, notes,
    }, userId);
  }

  private async createChunk(list: BuiltPo[], asof: string, userId: string) {
    const toDate = (iso: string) => new Date(`${iso}T00:00:00+05:30`);
    const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const pos = list.map((p) => {
      const extra: string[] = ['From Warehouse Master' + (p.src ? ` (${p.src})` : '')];
      if (!p.date) extra.push('PO date missing in the sheet; set to import date');
      if (!p.exp) extra.push('Expiry missing in the sheet; set to PO date + 7 days');
      const date = p.date || asof;
      return this.poRepo.create({
        poNumber: p.po, poDate: toDate(date), poExpiryDate: toDate(p.exp || addDays(date, 7)), channelId: p.plat, customerId: p.plat,
        location: p.loc || 'UNKNOWN', poValue: p.amt ?? 0, status: POStatus.RECEIVED, riskStatus: RiskStatus.GREEN, priorityScore: 0,
        overallOwnerId: userId, sourceType: 'BULK_IMPORT', remarks: [p.rem, ...extra].filter(Boolean).join(' | '),
      } as any);
    });
    const saved = await this.poRepo.save(pos as any[], { chunk: 100 });
    const id = new Map(saved.map((s: any) => [s.poNumber, s.id]));
    await this.apptRepo.save(list.map((p) => this.apptRepo.create({ poId: id.get(p.po), slaStatus: 'ON_TIME', appointmentDate: p.appt ? toDate(p.appt) : null } as any)) as any[], { chunk: 100 });
    await this.dispatchRepo.save(list.map((p) => this.dispatchRepo.create({
      poId: id.get(p.po), idealDispatchDate: toDate(p.date || asof), latestSafeDispatchDate: toDate(p.exp || p.date || asof),
    } as any)) as any[], { chunk: 100 });
    // Declined / Cancelled (with the reason the rules found) become the team decision, so the
    // Control Tower shows them as closed; Pending and Accepted are inferred live anyway.
    const decided = list.filter((p) => p.dec === 'Declined' || p.dec === 'Cancelled' || p.dec === 'Expired');
    if (decided.length) {
      await this.trackingRepo.save(decided.map((p) => this.trackingRepo.create({ poId: id.get(p.po), decision: p.dec, decisionReason: p.reason || null, updatedByUserId: userId })), { chunk: 100 });
    }
  }
}
