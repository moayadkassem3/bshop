/**
 * Monthly subscription plans: the price depends on how many bookable staff the
 * shop has. Prices are in kuruş. Revised in v1.7 (founder, 2026-11-01): a lower
 * solo price, a 3-person tier so a third chair does not cost the 5-person price,
 * and a higher 10-person tier that covers the SMS a large salon sends.
 */
export type Plan = { id: string; name: string; maxStaff: number; monthlyPriceKurus: number };

export const PLANS: Plan[] = [
  { id: 'staff-1', name: '1 Personel', maxStaff: 1, monthlyPriceKurus: 49_900 },
  { id: 'staff-2', name: '2 Personel', maxStaff: 2, monthlyPriceKurus: 79_900 },
  { id: 'staff-3', name: '3 Personel', maxStaff: 3, monthlyPriceKurus: 99_900 },
  { id: 'staff-5', name: '5 Personele kadar', maxStaff: 5, monthlyPriceKurus: 129_900 },
  { id: 'staff-10', name: '10 Personele kadar', maxStaff: 10, monthlyPriceKurus: 189_900 },
];

/** Included in every plan. SMS is unlimited, under the fair-use clause of the business agreement. */
export const PLAN_FEATURES = [
  'Komisyon yok: her randevu sizin',
  'Sınırsız randevu',
  'Sınırsız SMS bildirimi',
  'Randevu sayfası ve QR kod',
  'Harita ve aramada görünürlük',
  'Dolu saatte müşteriye başka saat önerme',
  'Personel takvimleri ve çalışma saatleri',
  'Popüler kesimler’de fotoğraf paylaşımı',
  'İstatistikler',
];

/** Prices include KDV; the trial starts when our team approves the shop. */
export const PLAN_TERMS = { vatIncluded: true, trialDays: 14, customQuoteAboveStaff: 10 };

/** The smallest plan that fits the shop's staff; null above 10 staff (priced individually). */
export function planForStaff(staffCount: number): Plan | null {
  return PLANS.find((p) => staffCount <= p.maxStaff) ?? null;
}
