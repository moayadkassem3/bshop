/**
 * Who the salon serves (step 1 of registration, also editable later). It decides
 * which Keşfet filter the salon appears under; unisex salons appear under both.
 */
export const SALON_TYPES = [
  { value: 'men', icon: '💈', label: 'Erkek', hint: 'Müşterilerimiz erkek' },
  { value: 'women', icon: '💇‍♀️', label: 'Kadın', hint: 'Müşterilerimiz kadın' },
  { value: 'unisex', icon: '✂️', label: 'Kadın ve erkek', hint: 'Kadın ve erkek müşterilere hizmet veriyoruz' },
] as const;

export type SalonType = (typeof SALON_TYPES)[number]['value'];
