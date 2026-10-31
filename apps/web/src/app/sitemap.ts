import type { MetadataRoute } from 'next';
import { placeHref, typeForAudience } from '@/lib/places';
import { loadSitemap } from '@/lib/server';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

/**
 * For search engines (v1.7): every public salon, and the listing pages that have
 * salons (province, district, district + type).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const shops = await loadSitemap();
  const places = new Set<string>();
  for (const s of shops) {
    if (!s.city) continue;
    for (const href of [
      placeHref(s.city),
      placeHref(s.city, s.district),
      ...(s.audience === 'unisex' ? (['erkek-kuaforu', 'kadin-kuaforu'] as const) : [typeForAudience(s.audience)]).map((t) => placeHref(s.city!, s.district, t)),
    ]) {
      if (href) places.add(href);
    }
  }
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
    ...[...places].map((href) => ({ url: `${SITE_URL}${href}`, changeFrequency: 'daily' as const, priority: 0.8 })),
    ...shops.map((s) => ({ url: `${SITE_URL}/${s.slug}`, changeFrequency: 'weekly' as const, priority: 0.7 })),
  ];
}
