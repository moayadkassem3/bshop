// Everything customers see is in Türkiye time: one time zone nationwide, named Europe/Istanbul.
export const TZ = 'Europe/Istanbul';

const lira = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const liraKurus = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatPrice(kurus: number, startingFrom = false): string {
  const value = `₺${(kurus % 100 === 0 ? lira : liraKurus).format(kurus / 100)}`;
  // "ve üzeri" avoids Turkish suffixes, which depend on how the number is read aloud.
  return startingFrom ? `${value} ve üzeri` : value;
}

export function formatTime(iso: string | Date): string {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function formatLongDate(iso: string | Date): string {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'long', weekday: 'long' }).format(
    new Date(iso),
  );
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} dk`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} sa ${m} dk` : `${h} sa`;
}

/** YYYY-MM-DD of an instant in Türkiye. */
export function turkeyDate(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    instant,
  );
  return parts;
}

export function turkeyHour(iso: string): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)));
}

export type Day = { date: string; weekday: string; day: string; month: string; isToday: boolean };

/** The next `count` days in Türkiye, for the day chips. */
export function upcomingDays(count: number, now = new Date()): Day[] {
  const today = turkeyDate(now);
  const days: Day[] = [];
  for (let i = 0; i < count; i++) {
    // Noon UTC on each date avoids any day-boundary surprises.
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    days.push({
      date: d.toISOString().slice(0, 10),
      weekday: new Intl.DateTimeFormat('tr-TR', { weekday: 'short', timeZone: 'UTC' }).format(d),
      day: String(d.getUTCDate()),
      month: new Intl.DateTimeFormat('tr-TR', { month: 'short', timeZone: 'UTC' }).format(d),
      isToday: i === 0,
    });
  }
  return days;
}

/** "Bugün 18:45", "Yarın 10:00", or "28 Ekim 10:00". */
export function relativeDayTime(iso: string, now = new Date()): string {
  const date = turkeyDate(new Date(iso));
  const days = upcomingDays(2, now);
  const time = formatTime(iso);
  if (date === days[0]!.date) return `Bugün ${time}`;
  if (date === days[1]!.date) return `Yarın ${time}`;
  return `${new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'long' }).format(new Date(iso))} ${time}`;
}

/** "450" or "450,50" (Turkish decimal comma) to kuruş; null when it is not a price. */
export function parseLira(value: string): number | null {
  const n = Number(value.replace(/\s/g, '').replace(',', '.'));
  return value.trim() && Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? Math.round(n * 100) : null;
}

/** Kuruş to an editable lira amount: 45000 → "450", 12550 → "125,50". */
export const liraInput = (kurus: number) => (kurus % 100 === 0 ? String(kurus / 100) : (kurus / 100).toFixed(2).replace('.', ','));
