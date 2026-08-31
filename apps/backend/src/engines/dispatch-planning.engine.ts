import { Injectable } from '@nestjs/common';
import { addDays, isAfter, isBefore } from 'date-fns';

/**
 * Dispatch Planning Engine
 * Backward-calculates the Latest Safe Dispatch Date based on:
 * - Appointment requirement window (3-4 days before expiry)
 * - Transporter transit time
 * - Safety buffer
 * - Customer receiving days
 */
@Injectable()
export class DispatchPlanningEngine {
  /**
   * Calculate Ideal Dispatch Date
   * Forward calculation: PO Date + Transit Time (from transporter SLA)
   * This is the ideal date to send the order.
   */
  calculateIdealDispatchDate(
    poDate: Date,
    transitTimeDays: number,
  ): Date {
    return addDays(poDate, transitTimeDays);
  }

  /**
   * Calculate Latest Safe Dispatch Date
   * Backward calculation:
   * - Start with PO Expiry Date
   * - Subtract appointment requirement window (3-4 days)
   * - Subtract transporter transit time
   * - Subtract safety buffer (1 day)
   * - Align to next available customer receiving day if needed
   */
  calculateLatestSafeDispatchDate(
    poExpiryDate: Date,
    appointmentRequirementDays: number = 3,
    transitTimeDays: number = 2,
    safetyBufferDays: number = 1,
    customerReceivingDays: string[] = ['MON', 'WED', 'FRI'],
  ): Date {
    // Total days to subtract from expiry
    const totalDaysToSubtract =
      appointmentRequirementDays + transitTimeDays + safetyBufferDays;

    // Calculate the base latest safe dispatch date
    let latestSafeDate = addDays(poExpiryDate, -totalDaysToSubtract);

    // Align to next available receiving day if needed
    latestSafeDate = this.alignToReceivingDay(latestSafeDate, customerReceivingDays);

    return latestSafeDate;
  }

  /**
   * Check if a PO is within the appointment booking window
   * Appointment should land 3-4 days before expiry
   */
  isWithinAppointmentWindow(
    expiryDate: Date,
    appointmentTargetDaysBeforeExpiry: number = 3,
    appointmentWindowWidth: number = 2,
  ): { startDate: Date; endDate: Date } {
    const endDate = addDays(expiryDate, -appointmentTargetDaysBeforeExpiry);
    const startDate = addDays(endDate, -appointmentWindowWidth);
    return { startDate, endDate };
  }

  /**
   * Align a date to the next customer receiving day
   * If the date falls on a non-receiving day, move forward to next receiving day
   */
  private alignToReceivingDay(date: Date, receivingDays: string[]): Date {
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    let currentDate = new Date(date);

    // Keep moving forward until we hit a receiving day
    let attempts = 0;
    while (attempts < 7) {
      const dayName = dayNames[currentDate.getDay()];
      if (receivingDays.includes(dayName)) {
        return currentDate;
      }
      currentDate = addDays(currentDate, 1);
      attempts++;
    }

    return currentDate;
  }

  /**
   * Calculate dispatch urgency (how many days left to dispatch)
   */
  calculateDispatchUrgency(latestSafeDate: Date): number {
    const now = new Date();
    const diffMs = latestSafeDate.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  isDispatchDatePassed(latestSafeDate: Date): boolean {
    return isBefore(latestSafeDate, new Date());
  }
}
