import { Injectable } from '@nestjs/common';
import { differenceInCalendarDays, startOfDay } from 'date-fns';
import { FulfilmentStatus, DispatchPlanStatus } from '@po-control-tower/shared';

export interface FulfilmentInput {
  orderedQty?: number;
  deliveredQty?: number;
  pendingQty?: number;
  poExpiryDate: Date;
  appointmentDate?: Date | null;
  dispatchPlanStatus?: DispatchPlanStatus | null;
  poCancelled?: boolean;
  hasQuantityMismatch?: boolean;
}

/**
 * Bulk PO fulfilment health (GREEN/YELLOW/ORANGE/RED), distinct from the
 * expiry-driven `riskStatus` used elsewhere - this one reads quantity
 * fulfilment, appointment proximity, and dispatch health specifically, per the
 * Bulk PO Compilation Engine spec. Thresholds below are a concrete, documented
 * interpretation of that spec's qualitative examples, not measured constants -
 * tune them here if ops feedback says they're off.
 */
@Injectable()
export class FulfilmentStatusEngine {
  compute(input: FulfilmentInput): FulfilmentStatus {
    const now = new Date();
    const daysToExpiry = differenceInCalendarDays(startOfDay(input.poExpiryDate), startOfDay(now));
    const ordered = input.orderedQty ?? 0;
    const pending = input.pendingQty ?? 0;
    const pendingPercent = ordered > 0 ? (pending / ordered) * 100 : 0;
    const daysToAppointment = input.appointmentDate
      ? differenceInCalendarDays(startOfDay(input.appointmentDate), startOfDay(now))
      : null;

    const appointmentExpired = daysToAppointment !== null && daysToAppointment < 0 && pending > 0;

    if (
      (input.poCancelled && pending > 0) ||
      daysToExpiry < 0 ||
      appointmentExpired ||
      input.dispatchPlanStatus === DispatchPlanStatus.CRITICAL ||
      input.hasQuantityMismatch
    ) {
      return FulfilmentStatus.RED;
    }

    if (
      pendingPercent >= 30 ||
      (daysToAppointment !== null && daysToAppointment <= 2 && pending > 0) ||
      input.dispatchPlanStatus === DispatchPlanStatus.DISPATCH_OVERDUE ||
      daysToExpiry <= 2
    ) {
      return FulfilmentStatus.ORANGE;
    }

    if (pendingPercent > 0 || (daysToAppointment !== null && daysToAppointment <= 5) || daysToExpiry <= 5) {
      return FulfilmentStatus.YELLOW;
    }

    return FulfilmentStatus.GREEN;
  }
}
