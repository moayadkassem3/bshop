/** Shop links live at the website's top level (/<slug>), so they must not clash with its pages. */
export const RESERVED_SLUGS = new Set([
  'api', 'admin', 'harita', 'kesfet', 'randevularim', 'favoriler', 'profil', 'isletmeler', 'isletme-kaydi',
  'sozlesmeler', 'giris', 'hesap', 'yardim', 'gizlilik', 'kvkk', 'sozlesme', 'iletisim', 'hakkimizda', 'arama',
  'salon', 'salonlar', 'uygulama', 'static', 'favicon-ico', 'maplibre', 'qr', 'gecmis', 'kesimler', 'akis',
]);

const TURKISH: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u' };

/** "Salih Esen Nirvana For✂Men" → "salih-esen-nirvana-for-men" */
export function slugify(name: string): string {
  const base = name
    .toLocaleLowerCase('tr')
    .replace(/[çğıiöşü]/g, (c) => TURKISH[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
  return base.length >= 3 ? base : `kuafor-${base || 'salon'}`;
}
