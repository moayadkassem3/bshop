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
