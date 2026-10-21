import { Injectable } from '@nestjs/common';
import { startOfDay } from 'date-fns';
import { DedupClassification } from '@po-control-tower/shared';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { POLineItemEntity } from '../../database/entities/po-line-item.entity';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { CleanedRow } from './data-cleaning.service';

export interface DedupResult {
  classification: DedupClassification;
  matchedPoId?: string;
}

function numEq(a: any, b: any): boolean {
  const an = a === undefined || a === null ? null : Number(a);
  const bn = b === undefined || b === null ? null : Number(b);
  return an === bn;
}

@Injectable()
export class DuplicateDetectionService {
  /**
   * Identity = Platform + PO Number + SKU + Warehouse. Once the identity
   * resolves to an existing line item, compare quantities/status/appointment to
   * tell an EXACT_DUPLICATE (nothing changed) from an UPDATED PO (something did).
   */
  // `po`, `line`, `appointment` are all looked up once by the caller (the
  // batch-wide cache in bulk-import.service.ts) and reused here AND for
  // compileRow right after - this used to do its own identical line/
  // appointment lookups, doubling those round trips on every single row.
  // Pure/no DB calls now, so it's synchronous - kept as an async signature
  // so call sites don't need to change if a real lookup is ever reintroduced.
  async classify(
    cleaned: CleanedRow,
    seenInBatch: Set<string>,
    po: POMasterEntity | null,
    line: POLineItemEntity | null,
    appointment: AppointmentEntity | null,
  ): Promise<DedupResult> {
    if (!cleaned.poNumber || !cleaned.skuCode) {
      return { classification: DedupClassification.POSSIBLE_DUPLICATE };
    }

    const key = `${cleaned.platform || ''}::${cleaned.poNumber}::${cleaned.skuCode}::${cleaned.warehouse || ''}`;

    if (!po) {
      seenInBatch.add(key);
      return { classification: DedupClassification.NEW };
    }

    if (!line) {
      seenInBatch.add(key);
      return { classification: DedupClassification.NEW, matchedPoId: po.id };
    }

    const apptChanged =
      !!cleaned.appointmentDate &&
      (!appointment?.appointmentDate ||
        startOfDay(cleaned.appointmentDate).getTime() !== startOfDay(appointment.appointmentDate).getTime());

    const identical =
      numEq(line.quantity, cleaned.orderedQty) &&
      numEq(line.acceptedQuantity, cleaned.acceptedQty) &&
      numEq(line.dispatchedQuantity, cleaned.dispatchedQty) &&
      numEq(line.deliveredQuantity, cleaned.deliveredQty) &&
      numEq(line.rejectedQuantity, cleaned.rejectedQty) &&
      !apptChanged;

    // Repeated within the very same file/batch (not merely matching the existing master) - treat as an exact dup regardless.
    const seenTwiceInBatch = seenInBatch.has(key);
    seenInBatch.add(key);

    if (identical || seenTwiceInBatch) {
      return { classification: DedupClassification.EXACT_DUPLICATE, matchedPoId: po.id };
    }
    return { classification: DedupClassification.UPDATED, matchedPoId: po.id };
  }
}
