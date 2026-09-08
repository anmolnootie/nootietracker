import { Injectable } from '@nestjs/common';
import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns';
import { LocationType, DispatchPlanStatus, DispatchVarianceLabel } from '@po-control-tower/shared';

export interface DispatchPlanInput {
  poExpiryDate: Date;
  poDate: Date;
  locationType: LocationType;
  localTatHours?: number;
  nonLocalTatMinDays?: number;
  nonLocalTatMaxDays?: number;
}

export interface DispatchPlan {
  locationType: LocationType;
  tatRuleDescription: string;
  dispatchWindowEarliest: Date;
  dispatchWindowLatest: Date;
  recommendedDispatchDate: Date;
}

/**
 * Dynamic Dispatch Date Engine.
 *
 * LOCAL: dispatch 48h (configurable) before expiry - a single checkpoint, so the
 * window collapses to one day.
 *
 * NON-LOCAL: dispatch 8-10 days (configurable) before expiry. Earliest = expiry
 * minus the longer buffer (furthest from expiry); latest = expiry minus the
 * shorter buffer (closest to expiry). Recommended sits at the midpoint (9 days
 * for the 8-10 default).
 *
 * Every input here should come from live PO/Location Master data at call time -
 * never persist a "final" date without recomputing, since expiry, location, or
 * TAT config can all change after the fact.
 */
@Injectable()
export class LocationDispatchEngine {
  computePlan(input: DispatchPlanInput): DispatchPlan {
    const { poExpiryDate, poDate, locationType } = input;

    if (locationType === LocationType.LOCAL) {
      const tatHours = input.localTatHours ?? 48;
      // Working backward from expiry alone can land before the PO was even
      // placed when the order-to-expiry window is shorter than the TAT - a
      // PO can never have a dispatch date earlier than its own order date,
      // so poDate is always the floor.
      const dispatchDate = this.clampToPoDate(addDays(poExpiryDate, -(tatHours / 24)), poDate);
      return {
        locationType,
        tatRuleDescription: `Local TAT: ${tatHours} Hours`,
        dispatchWindowEarliest: dispatchDate,
        dispatchWindowLatest: dispatchDate,
        recommendedDispatchDate: dispatchDate,
      };
    }

    const minDays = input.nonLocalTatMinDays ?? 10; // furthest from expiry -> earliest dispatch date
    const maxDays = input.nonLocalTatMaxDays ?? 8; // closest to expiry -> latest dispatch date
    const lo = Math.min(minDays, maxDays);
    const hi = Math.max(minDays, maxDays);
    const recommendedOffset = Math.round((lo + hi) / 2);

    const earliest = this.clampToPoDate(addDays(poExpiryDate, -hi), poDate);
    // latest and recommended clamp against the (already-clamped) earliest
    // too, not just poDate directly - otherwise a tight PO window could
    // leave latest sitting before earliest, or recommended outside the
    // window entirely.
    const latest = this.clampToPoDate(addDays(poExpiryDate, -lo), earliest);
    const recommended = this.clampToPoDate(addDays(poExpiryDate, -recommendedOffset), earliest, latest);

    return {
      locationType,
      tatRuleDescription: `${lo}-${hi} Days before expiry`,
      dispatchWindowEarliest: earliest,
      dispatchWindowLatest: latest,
      recommendedDispatchDate: recommended,
    };
  }

  /** Floors a date at `min` (and optionally caps it at `max`) - used to keep every computed dispatch date physically possible relative to the PO's own timeline. */
  private clampToPoDate(date: Date, min: Date, max?: Date): Date {
    let d = date < min ? min : date;
    if (max && d > max) d = max;
    return d;
  }

  computeStatus(
    plan: Pick<DispatchPlan, 'dispatchWindowEarliest' | 'dispatchWindowLatest'>,
    poExpiryDate: Date,
    actualDispatchDate: Date | null | undefined,
    now: Date = new Date(),
  ): DispatchPlanStatus {
    if (actualDispatchDate) return DispatchPlanStatus.DISPATCHED;

    const today = startOfDay(now).getTime();
    const earliest = startOfDay(plan.dispatchWindowEarliest).getTime();
    const latest = startOfDay(plan.dispatchWindowLatest).getTime();
    const expiry = startOfDay(poExpiryDate).getTime();

    if (today >= expiry) return DispatchPlanStatus.CRITICAL;
    if (today > latest) return DispatchPlanStatus.DISPATCH_OVERDUE;
    if (today >= earliest) return DispatchPlanStatus.DISPATCH_NOW;
    return DispatchPlanStatus.NOT_DUE;
  }

  computeVariance(recommendedDate: Date, actualDate: Date): { days: number; label: DispatchVarianceLabel } {
    const diff = differenceInCalendarDays(startOfDay(actualDate), startOfDay(recommendedDate));
    const label =
      diff < 0 ? DispatchVarianceLabel.EARLY : diff === 0 ? DispatchVarianceLabel.ON_TIME : DispatchVarianceLabel.LATE;
    return { days: Math.abs(diff), label };
  }
}
