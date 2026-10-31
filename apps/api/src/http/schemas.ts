import { z } from 'zod';

export const timestamp = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
export const id = z.uuid();
export const shopParams = z.object({ shopId: id });
export const weeklyWindows = z.array(
  z
    .object({
      weekday: z.number().int().min(1).max(7),
      startMinute: z.number().int().min(0).max(1440),
      endMinute: z.number().int().min(0).max(1440),
    })
    .refine((w) => w.endMinute > w.startMinute, 'endMinute must be after startMinute'),
);
export const csvIds = z
  .string()
  .transform((s) => s.split(',').filter(Boolean))
  .pipe(z.array(id).min(1));
