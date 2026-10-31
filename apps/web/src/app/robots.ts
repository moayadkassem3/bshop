import type { MetadataRoute } from 'next';
import { IS_TEST_SITE, SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

/** Search engines may read the public pages; the test site stays out of results (v1.7). */
export default function robots(): MetadataRoute.Robots {
  if (IS_TEST_SITE) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/profil', '/randevularim', '/gecmis', '/isletme-ayarlari', '/istatistikler', '/qr', '/teklif-al'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
