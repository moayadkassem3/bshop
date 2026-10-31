import { districtsOf, PROVINCES } from '@/components/register/provinces';

/**
 * Listing-page links (v1.7): /istanbul, /istanbul/avcilar, /istanbul/avcilar/erkek-kuaforu.
 * Same rule as salon links on the server: lowercase English letters and hyphens.
 */
const TURKISH: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u' };

export function slugify(name: string): string {
  return name
    .toLocaleLowerCase('tr')
    .replace(/[çğıiöşü]/g, (c) => TURKISH[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const SALON_TYPES = {
  // Turkish takes the singular after a number: "2 erkek kuaförü", but "Kadıköy erkek kuaförleri".
  'erkek-kuaforu': { audience: 'men', title: 'erkek kuaförleri', one: 'erkek kuaförü' },
  'kadin-kuaforu': { audience: 'women', title: 'kadın kuaförleri', one: 'kadın kuaförü' },
} as const;
export type SalonType = keyof typeof SALON_TYPES;

/** "istanbul" → "İstanbul"; null for anything that is not one of the 81 provinces. */
export function provinceBySlug(slug: string): string | null {
  return PROVINCES.find((p) => slugify(p) === slug) ?? null;
}

/** "avcilar" in İstanbul → "Avcılar". */
export function districtBySlug(province: string, slug: string): string | null {
  return districtsOf(province).find((d) => slugify(d.name) === slug)?.name ?? null;
}

/** The listing page for a place, from the names a salon stores ("İstanbul", "Avcılar"). */
export function placeHref(city: string, district?: string | null, type?: SalonType | null): string | null {
  const province = PROVINCES.find((p) => p.toLocaleLowerCase('tr') === city.toLocaleLowerCase('tr'));
  if (!province) return null;
  let href = `/${slugify(province)}`;
  if (!district) return href;
  const d = districtsOf(province).find((x) => x.name.toLocaleLowerCase('tr') === district.toLocaleLowerCase('tr'));
  if (!d) return href;
  href += `/${slugify(d.name)}`;
  return type ? `${href}/${type}` : href;
}

export const typeForAudience = (audience: 'men' | 'women' | 'unisex'): SalonType | null =>
  audience === 'men' ? 'erkek-kuaforu' : audience === 'women' ? 'kadin-kuaforu' : null;
