import { DateTime } from 'luxon';
import { MINUTE } from './time.js';

export const RESPONSE_WINDOW_MINUTES = 15;
export const REMINDER_AFTER_MINUTES = 10;
/** Last-minute requests get no reminder when the response window is shorter than this. */
export const MIN_REMINDER_WINDOW_MINUTES = 6;

/**
 * Handoff 4.4: deadline = earlier of request + 15 min and appointment start.
 * Reminder at 10 min; for last-minute requests, halfway through the window,
 * or none when the window is under 6 minutes.
 */
export function confirmationTimers(
  createdAt: Date,
  startsAt: Date,
): { deadlineAt: Date; reminderAt: Date | null } {
  const created = createdAt.getTime();
  const standardDeadline = created + RESPONSE_WINDOW_MINUTES * MINUTE;
  if (startsAt.getTime() >= standardDeadline) {
    return {
      deadlineAt: new Date(standardDeadline),
      reminderAt: new Date(created + REMINDER_AFTER_MINUTES * MINUTE),
    };
  }
  const window = startsAt.getTime() - created;
  return {
    deadlineAt: new Date(startsAt),
    reminderAt: window < MIN_REMINDER_WINDOW_MINUTES * MINUTE ? null : new Date(created + window / 2),
  };
}

export type WeeklyWindow = { weekday: number; start_minute: number; end_minute: number };

/** Automatic-confirmation hours apply to the appointment's start time (handoff 2.1). */
export function inAutoConfirmHours(startsAt: Date, timezone: string, windows: WeeklyWindow[]): boolean {
  const local = DateTime.fromJSDate(startsAt, { zone: timezone });
  const minute = local.hour * 60 + local.minute;
  return windows.some((w) => w.weekday === local.weekday && minute >= w.start_minute && minute < w.end_minute);
}
