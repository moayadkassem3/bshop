'use client';

import biz from './business.module.css';

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const pad = (n: number) => String(n).padStart(2, '0');
/** "2026-11" one month on or back. */
export function addMonths(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** The days of a month in rows of seven, Monday first; null for the neighbouring months' days. */
function monthCells(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`)];
  while (cells.length % 7) cells.push(null);
  return cells;
}

const monthTitle = (month: string) => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

/**
 * Takvim's month view (founder, 14 November 2026; as in the app): slides down under the date
 * when the date is tapped. Each day shows how many appointments it has; tapping a day shows
 * that day below.
 */
export function MonthCalendar(props: {
  open: boolean;
  month: string;
  selected: string;
  today: string;
  /** Appointments per day (YYYY-MM-DD), without declined and cancelled ones; null while loading. */
  counts: Record<string, number> | null;
  onMonth: (month: string) => void;
  onPick: (date: string) => void;
}) {
  return (
    <div className={`${biz.month} ${props.open ? biz.monthOpen : ''}`} aria-hidden={!props.open} inert={!props.open}>
      <div className={biz.monthClip}>
        <div className={`card ${biz.monthCard}`}>
          <div className={biz.monthHead}>
            <button type="button" className={biz.monthArrow} onClick={() => props.onMonth(addMonths(props.month, -1))} aria-label="Önceki ay">
              ‹
            </button>
            <strong>{monthTitle(props.month)}</strong>
            <button type="button" className={biz.monthArrow} onClick={() => props.onMonth(addMonths(props.month, 1))} aria-label="Sonraki ay">
              ›
            </button>
          </div>
          <div className={biz.monthGrid}>
            {WEEKDAYS.map((d) => (
              <span key={d} className={biz.monthWeekday}>
                {d}
              </span>
            ))}
            {monthCells(props.month).map((day, i) => {
              if (!day) return <span key={i} />;
              const count = props.counts?.[day] ?? 0;
              const on = day === props.selected;
              return (
                <button
                  key={day}
                  type="button"
                  className={`${biz.monthDay} ${day === props.today ? biz.monthToday : ''} ${on ? biz.monthDayOn : ''}`}
                  aria-pressed={on}
                  aria-label={`${Number(day.slice(8))} ${monthTitle(props.month)}${count ? `, ${count} randevu` : ''}`}
                  onClick={() => props.onPick(day)}
                >
                  {Number(day.slice(8))}
                  {count > 0 && <small>{count}</small>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
