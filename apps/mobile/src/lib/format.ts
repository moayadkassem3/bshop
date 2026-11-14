/** Times and prices as on the website, always in Türkiye's time zone. */
export const TZ = 'Europe/Istanbul';

const lira = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const liraKurus = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatPrice(kurus: number, startingFrom = false): string {
  const value = `₺${(kurus % 100 === 0 ? lira : liraKurus).format(kurus / 100)}`;
  return startingFrom ? `${value} ve üzeri` : value;
}

export function formatTime(iso: string | Date): string {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** "4 Kasım Salı" */
export function formatLongDate(iso: string | Date): string {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'long', weekday: 'long' }).format(new Date(iso));
}

export function formatShortDate(iso: string | Date): string {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** The calendar day in Türkiye, as YYYY-MM-DD. */
export function turkeyDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Midnight in Türkiye (UTC+3, no daylight saving) for a YYYY-MM-DD day. */
export function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00+03:00`);
}

export function addDays(date: string, days: number): string {
  return turkeyDate(new Date(dayStart(date).getTime() + days * 86_400_000 + 3_600_000));
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} km`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} dk`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} sa ${m} dk` : `${h} sa`;
}

export function turkeyHour(iso: string): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)));
}

export type Day = { date: string; weekday: string; day: string; month: string; isToday: boolean };

/** The next `count` days in Türkiye, for the day chips. */
export function upcomingDays(count: number, now = new Date()): Day[] {
  const today = turkeyDate(now);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return {
      date: d.toISOString().slice(0, 10),
      weekday: new Intl.DateTimeFormat('tr-TR', { weekday: 'short', timeZone: 'UTC' }).format(d),
      day: String(d.getUTCDate()),
      month: new Intl.DateTimeFormat('tr-TR', { month: 'short', timeZone: 'UTC' }).format(d),
      isToday: i === 0,
    };
  });
}

/** "Bugün 14:30", "Yarın 10:00", "12 Kasım 09:30" */
export function relativeDayTime(iso: string, now = new Date()): string {
  const date = turkeyDate(new Date(iso));
  const days = upcomingDays(2, now);
  const time = formatTime(iso);
  if (date === days[0]!.date) return `Bugün ${time}`;
  if (date === days[1]!.date) return `Yarın ${time}`;
  return `${new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'long' }).format(new Date(iso))} ${time}`;
}

/**
 * Calendar days (in Türkiye) until a trial or period ends, so "4 gün" matches
 * the end date shown beside it; at least 1 until it ends, then 0 (as on the website).
 */
export function daysLeft(end: string | null): number {
  if (!end || new Date(end).getTime() <= Date.now()) return 0;
  const days = (Date.parse(turkeyDate(new Date(end))) - Date.parse(turkeyDate(new Date()))) / 86_400_000;
  return Math.max(1, Math.round(days));
}

/** "3 Kasım 2026". */
export function formatFullDate(iso: string | Date): string {
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(new Date(iso));
}

/** "Günaydın" and the like by the hour in Türkiye (Salonum's greeting, founder 14 November 2026). */
export function greeting(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false }).format(now)) % 24;
  if (hour >= 5 && hour < 12) return 'Günaydın';
  if (hour >= 12 && hour < 18) return 'İyi günler';
  if (hour >= 18 && hour < 22) return 'İyi akşamlar';
  return 'İyi geceler';
}
