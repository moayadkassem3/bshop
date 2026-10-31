import { DateTime } from 'luxon';
import { badRequest } from '../errors.js';

export const MINUTE = 60_000;

export type LocalDay = { start: DateTime; weekday: number; date: string };

export function localDay(date: string, timezone: string): LocalDay {
  const start = DateTime.fromISO(date, { zone: timezone }).startOf('day');
  if (!start.isValid || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('INVALID_DATE', 'Use YYYY-MM-DD');
  return { start, weekday: start.weekday, date };
}

export function localDayOf(instant: Date, timezone: string): LocalDay {
  const dt = DateTime.fromJSDate(instant, { zone: timezone });
  return localDay(dt.toISODate()!, timezone);
}

/** Epoch ms of a minute-of-day on a local day (Türkiye has no DST, but this stays correct with it). */
export function atMinute(day: LocalDay, minute: number): number {
  return day.start.plus({ minutes: minute }).toMillis();
}

export function minuteOfDay(instant: Date, timezone: string): number {
  const dt = DateTime.fromJSDate(instant, { zone: timezone });
  return dt.hour * 60 + dt.minute;
}

export function ceilToMinutes(ms: number, step: number): number {
  const stepMs = step * MINUTE;
  return Math.ceil(ms / stepMs) * stepMs;
}
