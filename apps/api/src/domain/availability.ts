import { MINUTE } from './time.js';

/** Half-open interval [start, end) in epoch ms. */
export type Interval = { start: number; end: number };

export const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

export type SlotInput = {
  /** Working intervals for the day; gaps between them are breaks. */
  work: Interval[];
  /** Live appointments (including their buffer) and blocked time. */
  busy: Interval[];
  durationMinutes: number;
  bufferMinutes: number;
  stepMinutes: number;
  /** Local midnight, so grid marks fall on :00, :15, ... */
  dayStart: number;
  /** Nothing may start before this (now + lead time, rounded up to 5 minutes). */
  earliest: number;
};

/** True when a booking starting at `start` fits the schedule. */
export function fits(start: number, input: Omit<SlotInput, 'stepMinutes' | 'dayStart'>): boolean {
  if (start < input.earliest) return false;
  const end = start + input.durationMinutes * MINUTE;
  const inWork = input.work.some((w) => start >= w.start && end <= w.end);
  if (!inWork) return false;
  const needed = { start, end: end + input.bufferMinutes * MINUTE };
  return !input.busy.some((b) => overlaps(needed, b));
}

/**
 * Start times offered to customers: grid marks (every stepMinutes from local
 * midnight), the start of each working interval, the earliest allowed moment,
 * and the exact minute an existing booking or block ends, so no dead gaps are left.
 */
export function candidateStarts(input: SlotInput): number[] {
  const stepMs = input.stepMinutes * MINUTE;
  const result = new Set<number>();
  for (const w of input.work) {
    const candidates = new Set<number>([w.start]);
    const firstMark = input.dayStart + Math.ceil((w.start - input.dayStart) / stepMs) * stepMs;
    for (let t = firstMark; t < w.end; t += stepMs) candidates.add(t);
    for (const b of input.busy) if (b.end > w.start && b.end < w.end) candidates.add(b.end);
    if (input.earliest > w.start && input.earliest < w.end) candidates.add(input.earliest);
    for (const t of candidates) if (fits(t, input)) result.add(t);
  }
  return [...result].sort((a, b) => a - b);
}
