import { describe, expect, it } from 'vitest';
import { candidateStarts, fits } from '../src/domain/availability.js';
import { confirmationTimers, inAutoConfirmHours } from '../src/domain/confirmation.js';
import { formatPrice } from '../src/messages.js';
import { normalizePhone } from '../src/phone.js';

const T = (hhmm: string) => new Date(`2026-10-26T${hhmm}:00+03:00`);
const ms = (hhmm: string) => T(hhmm).getTime();
const hhmm = (t: number) =>
  new Date(t).toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });

describe('confirmation timers (handoff 4.4)', () => {
  it('normal request: reminder at 10 min, automatic confirmation at 15 min', () => {
    const t = confirmationTimers(T('14:00'), T('16:00'));
    expect(t.reminderAt).toEqual(T('14:10'));
    expect(t.deadlineAt).toEqual(T('14:15'));
  });

  it('last-minute request: deadline is the start time, reminder halfway', () => {
    const t = confirmationTimers(T('14:00'), T('14:12'));
    expect(t.deadlineAt).toEqual(T('14:12'));
    expect(t.reminderAt).toEqual(T('14:06'));
  });

  it('no reminder when the response window is under 6 minutes (handoff example: 14:05)', () => {
    const t = confirmationTimers(T('14:00'), T('14:05'));
    expect(t.deadlineAt).toEqual(T('14:05'));
    expect(t.reminderAt).toBeNull();
    expect(confirmationTimers(T('14:00'), T('14:06')).reminderAt).toEqual(T('14:03'));
  });

  it('start exactly 15 minutes ahead uses the standard timers', () => {
    const t = confirmationTimers(T('14:00'), T('14:15'));
    expect(t.deadlineAt).toEqual(T('14:15'));
    expect(t.reminderAt).toEqual(T('14:10'));
  });

  it('the deadline is never after the appointment start', () => {
    for (let lead = 1; lead <= 30; lead++) {
      const start = new Date(T('14:00').getTime() + lead * 60_000);
      expect(confirmationTimers(T('14:00'), start).deadlineAt.getTime()).toBeLessThanOrEqual(start.getTime());
    }
  });
});

describe('automatic-confirmation hours use the appointment start time', () => {
  const windows = [{ weekday: 1, start_minute: 600, end_minute: 720 }]; // Monday 10:00–12:00
  it('applies inside the window and not outside it', () => {
    expect(inAutoConfirmHours(T('10:00'), 'Europe/Istanbul', windows)).toBe(true);
    expect(inAutoConfirmHours(T('11:59'), 'Europe/Istanbul', windows)).toBe(true);
    expect(inAutoConfirmHours(T('12:00'), 'Europe/Istanbul', windows)).toBe(false);
    expect(inAutoConfirmHours(new Date('2026-10-27T10:30:00+03:00'), 'Europe/Istanbul', windows)).toBe(false);
  });
});

describe('start times', () => {
  const base = {
    work: [{ start: ms('10:00'), end: ms('13:00') }],
    busy: [] as { start: number; end: number }[],
    durationMinutes: 30,
    bufferMinutes: 0,
    stepMinutes: 15,
    dayStart: ms('00:00'),
    earliest: ms('09:00'),
  };

  it('offers 15-minute marks where the whole service fits before closing', () => {
    const starts = candidateStarts(base).map(hhmm);
    expect(starts[0]).toBe('10:00');
    expect(starts.at(-1)).toBe('12:30');
    expect(starts).toHaveLength(11);
  });

  it('adds the exact minute an existing booking ends, so no gap is wasted', () => {
    const starts = candidateStarts({ ...base, busy: [{ start: ms('10:00'), end: ms('10:50') }] }).map(hhmm);
    expect(starts[0]).toBe('10:50');
    expect(starts).not.toContain('10:30');
  });

  it('never offers past times; offers the earliest moment rounded to 5 minutes', () => {
    const starts = candidateStarts({ ...base, earliest: ms('11:05') }).map(hhmm);
    expect(starts[0]).toBe('11:05');
    expect(starts).not.toContain('11:00');
  });

  it('respects breaks between working intervals', () => {
    const starts = candidateStarts({
      ...base,
      work: [
        { start: ms('10:00'), end: ms('11:00') },
        { start: ms('12:00'), end: ms('13:00') },
      ],
    }).map(hhmm);
    expect(starts).toContain('10:30');
    expect(starts).not.toContain('10:45');
    expect(starts).not.toContain('11:30');
    expect(starts).toContain('12:00');
  });

  it('keeps the buffer free before the next booking', () => {
    const input = { ...base, bufferMinutes: 10, busy: [{ start: ms('11:00'), end: ms('11:30') }] };
    expect(fits(ms('10:20'), input)).toBe(true);
    expect(fits(ms('10:25'), input)).toBe(false);
  });
});

describe('formatting and phone numbers', () => {
  it('formats prices in Turkish lira', () => {
    expect(formatPrice(45000)).toBe('₺450');
    expect(formatPrice(200000)).toBe('₺2.000');
    expect(formatPrice(12550)).toBe('₺125,50');
  });

  it('normalises Turkish mobile numbers', () => {
    expect(normalizePhone('0532 000 00 01')).toBe('+905320000001');
    expect(normalizePhone('5320000001')).toBe('+905320000001');
    expect(normalizePhone('+90 532 000 0001')).toBe('+905320000001');
    expect(() => normalizePhone('0212 000 00 00')).toThrow();
  });
});
