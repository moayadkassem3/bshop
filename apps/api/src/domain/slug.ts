/**
 * Türkiye's 81 provinces: /istanbul, /istanbul/avcilar and /istanbul/avcilar/erkek-kuaforu
 * are listing pages (v1.7), so no salon may take a province's name as its link.
 */
export const PROVINCE_SLUGS = [
  'adana', 'adiyaman', 'afyonkarahisar', 'agri', 'aksaray', 'amasya', 'ankara', 'antalya', 'ardahan', 'artvin',
  'aydin', 'balikesir', 'bartin', 'batman', 'bayburt', 'bilecik', 'bingol', 'bitlis', 'bolu', 'burdur',
  'bursa', 'canakkale', 'cankiri', 'corum', 'denizli', 'diyarbakir', 'duzce', 'edirne', 'elazig', 'erzincan',
  'erzurum', 'eskisehir', 'gaziantep', 'giresun', 'gumushane', 'hakkari', 'hatay', 'igdir', 'isparta',
  'istanbul', 'izmir', 'kahramanmaras', 'karabuk', 'karaman', 'kars', 'kastamonu', 'kayseri', 'kirikkale',
  'kirklareli', 'kirsehir', 'kilis', 'kocaeli', 'konya', 'kutahya', 'malatya', 'manisa', 'mardin', 'mersin',
  'mugla', 'mus', 'nevsehir', 'nigde', 'ordu', 'osmaniye', 'rize', 'sakarya', 'samsun', 'siirt', 'sinop',
  'sivas', 'sanliurfa', 'sirnak', 'tekirdag', 'tokat', 'trabzon', 'tunceli', 'usak', 'van', 'yalova', 'yozgat',
  'zonguldak',
];

/** Shop links live at the website's top level (/<slug>), so they must not clash with its pages. */
export const RESERVED_SLUGS = new Set([
  ...PROVINCE_SLUGS,
  'api',
  'admin',
  'harita',
  'kesfet',
  'randevularim',
  'favoriler',
  'profil',
  'isletmeler',
  'isletme-kaydi',
  'sozlesmeler',
  'giris',
  'hesap',
  'yardim',
  'gizlilik',
  'kvkk',
  'sozlesme',
  'iletisim',
  'hakkimizda',
  'arama',
  'salon',
  'salonlar',
  'uygulama',
  'static',
  'favicon-ico',
  'maplibre',
  'qr',
  'gecmis',
  'kesimler',
  'akis',
  'calismalar',
  'isletme-ayarlari',
  'istatistikler',
  'teklif-al',
  'salonum',
]);

const TURKISH: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u' };

/** "Salih Esen Nirvana For✂Men" → "salih-esen-nirvana-for-men"; may be short or empty, see shopLinkCandidates. */
export function slugify(name: string): string {
  return name
    .toLocaleLowerCase('tr')
    .replace(/[çğıiöşü]/g, (c) => TURKISH[c] ?? c)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
}

/** A salon link: lowercase English letters, digits and single hyphens, 3–50 characters. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Links tried for a new salon (v1.7): its name, then name + district
 * ("mk-avcilar"), then name + district + city, then numbered as a last resort.
 * A name too short to stand alone starts at name + district.
 */
export function shopLinkCandidates(name: string, district?: string | null, city?: string | null): string[] {
  const base = slugify(name) || 'salon';
  const parts = [slugify(district ?? ''), slugify(city ?? '')].filter(Boolean);
  const out: string[] = [];
  if (base.length >= 3) out.push(base);
  if (parts[0]) out.push(`${base}-${parts[0]}`);
  if (parts.length === 2) out.push(`${base}-${parts[0]}-${parts[1]}`);
  const last = out.at(-1) ?? `${base}-salon`;
  for (let n = 2; n < 50; n++) out.push(`${last}-${n}`);
  return out.map((c) => c.slice(0, 50).replace(/-+$/g, '')).filter((c) => c.length >= 3);
}
