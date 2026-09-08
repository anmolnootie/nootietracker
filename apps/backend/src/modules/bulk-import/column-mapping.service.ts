import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ColumnMappingEntity } from '../../database/entities/column-mapping.entity';
import { STANDARD_BULK_FIELDS, StandardBulkField } from '@po-control-tower/shared';

function normalize(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Built-in defaults covering common Quick Commerce export header variations.
// Extend/override per-platform via the Column Mapping admin screen rather than
// editing this list, so new platforms don't need a code change.
const DEFAULT_ALIASES: Record<StandardBulkField, string[]> = {
  platform: ['platform', 'channel', 'quick commerce platform', 'marketplace'],
  po_number: ['po number', 'po no', 'purchase order', 'purchase order number', 'order id', 'po id', 'po#'],
  po_date: ['po date', 'order date', 'purchase order date', 'date'],
  appointment_date: ['appointment date', 'appt date', 'slot date', 'delivery appointment date'],
  appointment_time: ['appointment time', 'appt time', 'slot time'],
  warehouse: ['warehouse', 'fc', 'warehouse/fc', 'warehouse / fc', 'destination', 'facility', 'delivery location', 'warehouse name', 'delivered to'],
  sku_code: ['sku', 'sku code', 'item code', 'product code', 'sku id', '#itemcode'],
  upc: ['upc', 'product upc', 'barcode', 'ean', 'gtin', 'ean/upc'],
  product_name: ['product name', 'item name', 'product description', 'description', 'sku name', 'name'],
  mrp: ['mrp', 'maximum retail price', 'm.r.p'],
  ordered_qty: ['ordered qty', 'ordered quantity', 'order qty', 'po qty', 'quantity', 'qty', 'units_ordered', 'units ordered'],
  accepted_qty: ['accepted qty', 'accepted quantity'],
  dispatched_qty: ['dispatched qty', 'dispatched quantity', 'shipped qty'],
  delivered_qty: ['delivered qty', 'delivered quantity', 'received qty'],
  rejected_qty: ['rejected qty', 'rejected quantity', 'returned qty'],
  pending_qty: ['pending qty', 'pending quantity', 'balance qty', 'open qty'],
  // "Landing Rate" (post-tax, what's actually paid per unit) must win over
  // "Cost Price"/"Basic Cost Price" (pre-tax) when a sheet has both, since
  // po_value/total_amount is computed from the landing rate - picking cost
  // price instead makes every taxed line look like a value mismatch by
  // exactly the tax amount. Listed first so it's tried before the others.
  unit_price: ['landing rate', 'landing price', 'unit price', 'price', 'rate', 'cost price', 'basic cost price'],
  po_value: ['po value', 'total value', 'order value', 'total amount', 'net amount'],
  appointment_status: ['appointment status', 'appt status', 'slot status'],
  delivery_status: ['delivery status', 'shipment status'],
  po_status: ['po status', 'order status', 'status'],
  expiry_date: ['expiry date', 'po expiry date', 'valid till', 'validity date'],
};

@Injectable()
export class ColumnMappingService {
  constructor(
    @InjectRepository(ColumnMappingEntity)
    private readonly mappingRepository: Repository<ColumnMappingEntity>,
  ) {}

  async buildMapping(headers: string[], platform: string): Promise<Partial<Record<StandardBulkField, string>>> {
    const overrides = await this.mappingRepository.find({ where: [{ platform }, { platform: IsNull() }] });
    const normalizedHeaders = headers.map((h) => ({ raw: h, norm: normalize(h) }));
    const used = new Set<string>();
    const mapping: Partial<Record<StandardBulkField, string>> = {};
    const aliasesFor = (field: StandardBulkField) => [
      ...overrides.filter((o) => o.standardField === field).map((o) => o.rawColumnAlias),
      ...(DEFAULT_ALIASES[field] || []),
    ];

    // Exact matches win regardless of field order first - otherwise a field with
    // only a loose/generic alias (e.g. po_date's "date") can steal a header that
    // another field (e.g. expiry_date's "po expiry date") matches exactly, purely
    // because it happens to be declared earlier in STANDARD_BULK_FIELDS.
    for (const field of STANDARD_BULK_FIELDS) {
      const exact = this.findExact(normalizedHeaders, aliasesFor(field), used);
      if (exact) {
        mapping[field] = exact;
        used.add(exact);
      }
    }

    for (const field of STANDARD_BULK_FIELDS) {
      if (mapping[field]) continue;
      const partial = this.findPartial(normalizedHeaders, aliasesFor(field), used);
      if (partial) {
        mapping[field] = partial;
        used.add(partial);
      }
    }

    return mapping;
  }

  async listMappings(): Promise<ColumnMappingEntity[]> {
    return this.mappingRepository.find({ order: { standardField: 'ASC' } });
  }

  createMapping(data: Partial<ColumnMappingEntity>): Promise<ColumnMappingEntity> {
    return this.mappingRepository.save(this.mappingRepository.create(data));
  }

  private findExact(headers: { raw: string; norm: string }[], aliases: string[], used: Set<string>): string | null {
    for (const alias of aliases) {
      const na = normalize(alias);
      const exact = headers.find((h) => h.norm === na && !used.has(h.raw));
      if (exact) return exact.raw;
    }
    return null;
  }

  private findPartial(headers: { raw: string; norm: string }[], aliases: string[], used: Set<string>): string | null {
    for (const alias of aliases) {
      const na = normalize(alias);
      const partial = headers.find((h) => (h.norm.includes(na) || na.includes(h.norm)) && !used.has(h.raw));
      if (partial) return partial.raw;
    }
    return null;
  }
}
