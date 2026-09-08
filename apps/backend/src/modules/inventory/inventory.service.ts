import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { SkuMasterEntity } from '../../database/entities/sku-master.entity';
import { SkuExtractionService } from './sku-extraction.service';
import { POService } from '../po/po.service';

export interface UploadSkuFileResult {
  fileName: string;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
}

export interface UpdateSkuMasterInput {
  skuName?: string;
  upc?: string | null;
  mrp?: number | null;
  unitPrice?: number | null;
  stockQuantity?: number;
}

export interface CreateSkuMasterInput extends UpdateSkuMasterInput {
  skuCode: string;
  skuName: string;
}

export interface HighestMovingSku {
  skuCode: string;
  skuName: string;
  unitsOrdered: number;
  unitsDispatched: number;
  stockQuantity: number | null;
}

export interface DeadStockSku {
  skuCode: string;
  skuName: string;
  stockQuantity: number;
  unitPrice: number | null;
  mrp: number | null;
  valueAtRisk: number;
  reason: 'NEVER_ORDERED' | 'ZERO_DISPATCHED';
  lastUploadedAt: Date | null;
}

export interface InventoryDashboard {
  summary: {
    totalSkus: number;
    totalStockUnits: number;
    totalStockValue: number;
    deadStockSkuCount: number;
    deadStockValue: number;
  };
  highestMoving: HighestMovingSku[];
  deadStock: DeadStockSku[];
}

const DEAD_STOCK_LIMIT = 25;
const HIGHEST_MOVING_LIMIT = 10;

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(SkuMasterEntity)
    private readonly skuMasterRepository: Repository<SkuMasterEntity>,
    private readonly skuExtractionService: SkuExtractionService,
    private readonly poService: POService,
  ) {}

  async uploadSkuFile(buffer: Buffer, fileName: string): Promise<UploadSkuFileResult> {
    const { rows, warnings } = this.skuExtractionService.extract(buffer, fileName);
    const now = new Date();

    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const existing = await this.skuMasterRepository.findOne({ where: { skuCode: row.skuCode } });
      if (existing) {
        await this.skuMasterRepository.update(existing.id, {
          skuName: row.skuName,
          upc: row.upc ?? existing.upc,
          mrp: row.mrp ?? existing.mrp,
          unitPrice: row.unitPrice ?? existing.unitPrice,
          stockQuantity: row.stockQuantity ?? existing.stockQuantity,
          sourceFileName: fileName,
          lastUploadedAt: now,
        });
        updated++;
      } else {
        await this.skuMasterRepository.save(
          this.skuMasterRepository.create({
            skuCode: row.skuCode,
            skuName: row.skuName,
            upc: row.upc,
            mrp: row.mrp,
            unitPrice: row.unitPrice,
            stockQuantity: row.stockQuantity ?? 0,
            sourceFileName: fileName,
            lastUploadedAt: now,
          }),
        );
        created++;
      }
    }

    return {
      fileName,
      totalRows: rows.length,
      created,
      updated,
      skipped: rows.length - created - updated,
      warnings,
    };
  }

  async list(search?: string): Promise<SkuMasterEntity[]> {
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      return this.skuMasterRepository.find({
        where: [{ skuCode: ILike(q) }, { skuName: ILike(q) }, { upc: ILike(q) }],
        order: { skuCode: 'ASC' },
      });
    }
    return this.skuMasterRepository.find({ order: { skuCode: 'ASC' } });
  }

  async remove(id: string): Promise<void> {
    await this.skuMasterRepository.delete(id);
  }

  async create(data: CreateSkuMasterInput): Promise<SkuMasterEntity> {
    return this.skuMasterRepository.save(
      this.skuMasterRepository.create({
        skuCode: data.skuCode,
        skuName: data.skuName,
        upc: data.upc ?? null,
        mrp: data.mrp ?? null,
        unitPrice: data.unitPrice ?? null,
        stockQuantity: data.stockQuantity ?? 0,
      }),
    );
  }

  async update(id: string, data: UpdateSkuMasterInput): Promise<SkuMasterEntity> {
    const existing = await this.skuMasterRepository.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(`SKU Master record ${id} not found`);
    await this.skuMasterRepository.update(id, data);
    return this.skuMasterRepository.findOneOrFail({ where: { id } });
  }

  /**
   * Cross-references the uploaded SKU Master (on-hand stock) against the PO
   * rollup's movement figures (units actually dispatched across every live
   * PO) - there's no separate sales/movement ledger, so "moving" is defined
   * as dispatched-out-the-door, and "dead stock" is stock sitting in the
   * master with nothing dispatched against it at all.
   */
  async getDashboard(): Promise<InventoryDashboard> {
    const [skuMaster, rollup] = await Promise.all([
      this.skuMasterRepository.find(),
      this.poService.getInventoryRollup(),
    ]);

    const rollupBySku = new Map(rollup.map((r) => [r.skuCode, r]));
    const stockBySku = new Map(skuMaster.map((s) => [s.skuCode, s]));

    const highestMoving: HighestMovingSku[] = rollup
      .filter((r) => r.unitsDispatched > 0)
      .sort((a, b) => b.unitsDispatched - a.unitsDispatched)
      .slice(0, HIGHEST_MOVING_LIMIT)
      .map((r) => ({
        skuCode: r.skuCode,
        skuName: r.name,
        unitsOrdered: r.unitsOrdered,
        unitsDispatched: r.unitsDispatched,
        stockQuantity: stockBySku.get(r.skuCode)?.stockQuantity ?? null,
      }));

    const deadStock: DeadStockSku[] = skuMaster
      .filter((s) => s.stockQuantity > 0)
      .map((s) => {
        const movement = rollupBySku.get(s.skuCode);
        const reason: DeadStockSku['reason'] = !movement ? 'NEVER_ORDERED' : 'ZERO_DISPATCHED';
        return { s, movement, reason };
      })
      .filter(({ movement }) => !movement || movement.unitsDispatched === 0)
      .map(({ s, reason }) => {
        const unitValue = s.unitPrice ?? s.mrp ?? 0;
        return {
          skuCode: s.skuCode,
          skuName: s.skuName,
          stockQuantity: s.stockQuantity,
          unitPrice: s.unitPrice,
          mrp: s.mrp,
          valueAtRisk: s.stockQuantity * Number(unitValue),
          reason,
          lastUploadedAt: s.lastUploadedAt,
        };
      })
      .sort((a, b) => b.valueAtRisk - a.valueAtRisk)
      .slice(0, DEAD_STOCK_LIMIT);

    const totalStockUnits = skuMaster.reduce((sum, s) => sum + s.stockQuantity, 0);
    const totalStockValue = skuMaster.reduce((sum, s) => sum + s.stockQuantity * Number(s.unitPrice ?? s.mrp ?? 0), 0);
    const allDeadStock = skuMaster
      .filter((s) => s.stockQuantity > 0)
      .filter((s) => {
        const movement = rollupBySku.get(s.skuCode);
        return !movement || movement.unitsDispatched === 0;
      });
    const deadStockValue = allDeadStock.reduce((sum, s) => sum + s.stockQuantity * Number(s.unitPrice ?? s.mrp ?? 0), 0);

    return {
      summary: {
        totalSkus: skuMaster.length,
        totalStockUnits,
        totalStockValue,
        deadStockSkuCount: allDeadStock.length,
        deadStockValue,
      },
      highestMoving,
      deadStock,
    };
  }
}
