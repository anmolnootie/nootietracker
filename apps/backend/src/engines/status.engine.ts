import { Injectable } from '@nestjs/common';
import { POStatus } from '@po-control-tower/shared';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { LogisticsTrackerEntity } from '../../database/entities/logistics-tracker.entity';
import { GRNTrackerEntity } from '../../database/entities/grn-tracker.entity';

/**
 * Status Engine
 * Derives the current PO status based on which milestones have been completed.
 * Status is computed, never manually entered.
 * 
 * Backbone stages:
 * - RECEIVED → APPOINTMENT_REQUESTED → APPOINTMENT_CONFIRMED → READY_FOR_DISPATCH 
 * - DISPATCHED → IN_TRANSIT → DELIVERED → GRN_PENDING → RECONCILED → CLOSED
 */
@Injectable()
export class StatusEngine {
  deriveStatus(
    po: POMasterEntity,
    appointment?: AppointmentEntity,
    dispatch?: DispatchEntity,
    logistics?: LogisticsTrackerEntity,
    grn?: GRNTrackerEntity,
  ): POStatus {
    // PO just received
    if (!appointment) {
      return POStatus.RECEIVED;
    }

    // Appointment requested but not confirmed
    if (appointment.requestedAt && !appointment.confirmedAt) {
      return POStatus.APPOINTMENT_REQUESTED;
    }

    // Appointment confirmed but dispatch not initiated
    if (appointment.confirmedAt && !dispatch?.actualDispatchDate) {
      return POStatus.APPOINTMENT_CONFIRMED;
    }

    // Appointment confirmed, ready for dispatch but not yet dispatched
    if (appointment.confirmedAt && dispatch && !dispatch.actualDispatchDate) {
      return POStatus.READY_FOR_DISPATCH;
    }

    // Dispatch initiated but not yet in transit
    if (dispatch?.actualDispatchDate && !logistics?.lastTrackedStatus) {
      return POStatus.DISPATCHED;
    }

    // In transit
    if (logistics?.lastTrackedStatus && logistics.lastTrackedStatus !== 'DELIVERED') {
      return POStatus.IN_TRANSIT;
    }

    // Delivered but GRN not created
    if (logistics?.lastTrackedStatus === 'DELIVERED' && !grn?.grnDate) {
      return POStatus.DELIVERED;
    }

    // GRN pending
    if (grn?.grnDate && !grn.outcome) {
      return POStatus.GRN_PENDING;
    }

    // GRN completed, reconciled
    if (grn?.outcome) {
      return POStatus.RECONCILED;
    }

    // Default
    return POStatus.RECEIVED;
  }

  isStatusComplete(status: POStatus): boolean {
    const completeStatuses = [
      POStatus.RECONCILED,
      POStatus.CLOSED,
      POStatus.RETURNED,
      POStatus.CANCELLED,
    ];
    return completeStatuses.includes(status);
  }

  getNextStage(currentStatus: POStatus): POStatus | null {
    const stageProgression: Record<POStatus, POStatus | null> = {
      [POStatus.RECEIVED]: POStatus.APPOINTMENT_REQUESTED,
      [POStatus.APPOINTMENT_REQUESTED]: POStatus.APPOINTMENT_CONFIRMED,
      [POStatus.APPOINTMENT_CONFIRMED]: POStatus.READY_FOR_DISPATCH,
      [POStatus.READY_FOR_DISPATCH]: POStatus.DISPATCHED,
      [POStatus.DISPATCHED]: POStatus.IN_TRANSIT,
      [POStatus.IN_TRANSIT]: POStatus.DELIVERED,
      [POStatus.DELIVERED]: POStatus.GRN_PENDING,
      [POStatus.GRN_PENDING]: POStatus.RECONCILED,
      [POStatus.RECONCILED]: POStatus.CLOSED,
      [POStatus.CLOSED]: null,
      [POStatus.RETURNED]: null,
      [POStatus.CANCELLED]: null,
    };
    return stageProgression[currentStatus] || null;
  }
}
