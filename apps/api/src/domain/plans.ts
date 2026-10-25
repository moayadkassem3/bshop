/**
 * Monthly subscription plans (founder, v1.5): the price depends on how many
 * bookable staff the shop has. Prices are in kuruş.
 */
export type Plan = { id: string; name: string; maxStaff: number; monthlyPriceKurus: number };

export const PLANS: Plan[] = [
  { id: 'staff-1', name: '1 Personel', maxStaff: 1, monthlyPriceKurus: 60_000 },
  { id: 'staff-2', name: '2 Personel', maxStaff: 2, monthlyPriceKurus: 80_000 },
  { id: 'staff-5', name: '5 Personele kadar', maxStaff: 5, monthlyPriceKurus: 110_000 },
  { id: 'staff-10', name: '10 Personele kadar', maxStaff: 10, monthlyPriceKurus: 135_000 },
];

/** Included in every plan. */
export const PLAN_FEATURES = ['Randevu sayfası ve QR kod', 'SMS bildirimleri', 'Harita görünürlüğü'];

/** The smallest plan that fits the shop's staff; null above 10 staff (priced individually). */
export function planForStaff(staffCount: number): Plan | null {
  return PLANS.find((p) => staffCount <= p.maxStaff) ?? null;
}
