import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { POService } from '../po/po.service';
import { LocationsService } from '../locations/locations.service';
import { ExceptionsService } from '../exceptions/exceptions.service';
import { UserService } from '../user/user.service';
import { ExceptionSeverity, ExceptionType } from '@po-control-tower/shared';
import { PartnersbizAckResponse, PartnersbizPOCreationPayload, PartnersbizPODetails, PartnersbizWarning } from './partnersbiz.types';

// Legal/registered tenant codes Partnersbiz sends -> the channel names used
// elsewhere in this app (matches the convention in po-import.service.ts).
const TENANT_TO_CHANNEL: Record<string, string> = {
  BLINKIT: 'Blinkit',
  ZEPTO: 'Zepto',
  INSTAMART: 'Instamart',
  SWIGGY: 'Instamart',
  BIGBASKET: 'BigBasket',
};

@Injectable()
export class PartnersbizService {
  private readonly logger = new Logger(PartnersbizService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly poService: POService,
    private readonly locationsService: LocationsService,
    private readonly exceptionsService: ExceptionsService,
    private readonly userService: UserService,
  ) {}

  /** Throws UnauthorizedException unless the request's Api-Key header matches PARTNERSBIZ_API_KEY. No key configured = every request is rejected, never silently accepted. */
  verifyApiKey(apiKey: string | undefined): void {
    const expected = this.configService.get<string>('PARTNERSBIZ_API_KEY');
    if (!expected) {
      throw new UnauthorizedException('Partnersbiz webhook is not configured (PARTNERSBIZ_API_KEY not set)');
    }
    if (!apiKey || apiKey !== expected) {
      throw new UnauthorizedException('Invalid Api-Key');
    }
  }

  /**
   * Maps a Partnersbiz PO_CREATION payload into a PO in this system and
   * creates it - the "vendor acknowledges the PO" half of the EDI flow.
   * Idempotent: re-delivering the same po_number (Partnersbiz/EDI webhooks
   * commonly retry) returns the already-created PO's status instead of
   * erroring. Runs the exact same Location Master classify/pending-queue
   * check bulk import uses, so an unrecognized destination warehouse queues
   * for approval instead of silently defaulting to NON_LOCAL forever.
   */
  async handlePoCreation(payload: PartnersbizPOCreationPayload): Promise<{ status: number; body: PartnersbizAckResponse }> {
    const warnings: PartnersbizWarning[] = [];
    const details = payload.details;

    if (payload.type !== 'PO_CREATION') {
      return this.badRequest(payload?.details?.po_number, `Unsupported message type "${payload?.type}" on the PO creation endpoint`);
    }
    if (!details?.po_number) {
      return this.badRequest(undefined, 'details.po_number is required');
    }
    if (!details.item_data || details.item_data.length === 0) {
      return this.badRequest(details.po_number, 'details.item_data must contain at least one item');
    }

    const existing = await this.poService.checkDuplicate(details.po_number);
    if (existing.exists && existing.po) {
      return this.ok(details.po_number, existing.po.status, [
        { code: 'ALREADY_EXISTS', message: 'PO already synced', description: `PO ${details.po_number} was already created from a prior delivery of this webhook - returning its current status.` },
      ]);
    }

    const lineItems: { skuCode: string; skuName: string; quantity: number; mrp?: number | null; upc?: string | null; unitPrice?: number | null }[] = [];
    for (const item of details.item_data) {
      if (!item.sku_code || !item.name || !item.units_ordered) {
        warnings.push({
          code: 'ITEM_SKIPPED',
          message: 'Item skipped - missing sku_code/name/units_ordered',
          description: `line_number ${item.line_number ?? '?'} (item_id ${item.item_id ?? '?'}) was dropped from the PO.`,
        });
        continue;
      }
      lineItems.push({
        skuCode: item.sku_code,
        skuName: item.name,
        quantity: item.units_ordered,
        mrp: item.mrp ?? null,
        upc: item.upc ?? null,
        unitPrice: item.landing_price ?? item.basic_price ?? null,
      });
    }
    if (lineItems.length === 0) {
      return this.badRequest(details.po_number, 'No valid line items after validation - every item was missing sku_code/name/units_ordered');
    }

    const channelId = TENANT_TO_CHANNEL[(payload.tenant || '').toUpperCase()] || this.titleCase(payload.tenant || 'UNKNOWN');
    const customerId = details.buyer_details?.name || channelId;
    const location = this.buildLocationName(details, warnings);

    const poDate = this.parseDate(details.issue_date) ?? new Date();
    let poExpiryDate = this.parseDate(details.expiry_date);
    if (!poExpiryDate) {
      poExpiryDate = new Date(poDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      warnings.push({ code: 'EXPIRY_DEFAULTED', message: 'expiry_date missing - defaulted to issue_date + 7 days' });
    }

    const poValue = details.total_amount ?? lineItems.reduce((sum, li) => sum + li.quantity * (li.unitPrice ?? li.mrp ?? 0), 0);

    const systemUser = await this.userService.findSystemUser();
    const po = await this.poService.createPO(
      {
        poNumber: details.po_number,
        poDate,
        poExpiryDate,
        channelId,
        customerId,
        location,
        poValue,
        lineItems,
      },
      systemUser.id,
    );

    const { matched } = await this.locationsService.classify(location);
    if (!matched) {
      await this.locationsService.recordPendingLocation(location, channelId, details.po_number);
      await this.exceptionsService.raise({
        poId: po.id,
        poNumber: details.po_number,
        warehouse: location,
        exceptionType: ExceptionType.UNKNOWN_WAREHOUSE,
        severity: ExceptionSeverity.MEDIUM,
        recommendedAction: `"${location}" is not in the Location Master - approve it on the Locations page to get accurate LOCAL/NON-LOCAL dispatch TAT instead of the NON-LOCAL default.`,
      });
      warnings.push({ code: 'UNKNOWN_WAREHOUSE', message: 'Destination location not recognized', description: `"${location}" queued for approval in the Location Master.` });
    }

    this.logger.log(`Created PO ${po.poNumber} (${po.id}) from Partnersbiz webhook`);
    return this.ok(details.po_number, po.status, warnings);
  }

  private buildLocationName(details: PartnersbizPODetails, warnings: PartnersbizWarning[]): string {
    const addr = details.buyer_details?.destination_address;
    const parts = [addr?.line2, addr?.line1, addr?.city].filter(Boolean);
    if (parts.length > 0) return parts.join(' - ');
    if (details.outlet_id) return `Outlet ${details.outlet_id}`;
    warnings.push({ code: 'LOCATION_MISSING', message: 'No destination_address or outlet_id on the payload - location left blank' });
    return 'Unknown';
  }

  private parseDate(raw: string | undefined): Date | null {
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private titleCase(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }

  private ok(poNumber: string, poStatus: string, warnings: PartnersbizWarning[]): { status: number; body: PartnersbizAckResponse } {
    return {
      status: warnings.length > 0 ? 207 : 200,
      body: {
        success: true,
        message: warnings.length > 0 ? 'PO synced with warnings.' : 'PO synced successfully.',
        timestamp: new Date().toISOString(),
        data: { po_number: poNumber, po_status: poStatus, warnings },
      },
    };
  }

  private badRequest(poNumber: string | undefined, message: string): { status: number; body: PartnersbizAckResponse } {
    return {
      status: 400,
      body: {
        success: false,
        message,
        timestamp: new Date().toISOString(),
        data: { po_number: poNumber || '', po_status: 'REJECTED', warnings: [] },
      },
    };
  }
}
