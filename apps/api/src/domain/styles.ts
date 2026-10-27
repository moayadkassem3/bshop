/**
 * Haircut styles a salon can tag its work with (v1.7, "Popüler kesimler").
 * Each style belongs to the men's or women's list, which Keşfet's salon-type
 * filter follows.
 */
export type HaircutStyle = { key: string; name: string; audience: 'men' | 'women' };

export const HAIRCUT_STYLES: HaircutStyle[] = [
  { key: 'skin-fade', name: 'Skin Fade', audience: 'men' },
  { key: 'taper-fade', name: 'Taper Fade', audience: 'men' },
  { key: 'klasik', name: 'Klasik Kesim', audience: 'men' },
  { key: 'crop', name: 'Crop', audience: 'men' },
  { key: 'buzz', name: 'Buzz Cut', audience: 'men' },
  { key: 'pompadour', name: 'Pompadour', audience: 'men' },
  { key: 'uzun-erkek', name: 'Uzun Saç (Erkek)', audience: 'men' },
  { key: 'sakal', name: 'Sakal Tasarımı', audience: 'men' },
  { key: 'cocuk', name: 'Çocuk Kesimi', audience: 'men' },
  { key: 'bob', name: 'Bob', audience: 'women' },
  { key: 'lob', name: 'Lob', audience: 'women' },
  { key: 'katli', name: 'Katlı Kesim', audience: 'women' },
  { key: 'kakul', name: 'Kahkül', audience: 'women' },
  { key: 'balyaj', name: 'Balyaj', audience: 'women' },
  { key: 'ombre', name: 'Ombre', audience: 'women' },
  { key: 'rofle', name: 'Röfle', audience: 'women' },
  { key: 'dalga', name: 'Dalgalı Fön', audience: 'women' },
  { key: 'gelin', name: 'Gelin Saçı', audience: 'women' },
];

export const STYLE_KEYS = HAIRCUT_STYLES.map((s) => s.key) as [string, ...string[]];
export const stylesFor = (audience: 'men' | 'women') => HAIRCUT_STYLES.filter((s) => s.audience === audience).map((s) => s.key);
