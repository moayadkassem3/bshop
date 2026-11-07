import { DateTime } from 'luxon';
import sharp from 'sharp';
import { systemClock } from '../clock.js';
import { loadConfig } from '../config.js';
import { createPool, migrate } from '../db.js';
import type { Deps } from '../deps.js';
import { consolePush, consoleSms } from '../notifications.js';
import { photoStorageFor } from '../storage.js';
import type { User } from '../services/auth.js';
import { createStaffAppointment } from '../services/booking.js';
import { addPost } from '../services/haircuts.js';
import { addPhoto } from '../services/photos.js';
import { createShop, markReviewed, setAutoConfirmHours, setSubscription, updateShopSettings } from '../services/shops.js';
import { addMember, importCatalog, setMemberServices, setWorkingHours } from '../services/team.js';

// Local demo data: two reviewed, subscribed shops in Kadıköy with staff, hours,
// prices, and a few bookings today. Safe to run again: existing shops are skipped.
const ADMIN_PHONE = process.env.ADMIN_PHONE ?? '+905000000000';

const config = loadConfig();
const db = createPool(config.databaseUrl);
const deps: Deps = { db, clock: systemClock, sms: consoleSms, push: consolePush, photos: photoStorageFor(config, db), config };
await migrate(db);

const userByPhone = async (phone: string, portal: User['portal']): Promise<User> => {
  const { rows } = await db.query<Omit<User, 'portal'>>(
    'SELECT id, phone, first_name, last_name, is_platform_admin, gender FROM users WHERE phone = $1',
    [phone],
  );
  return { ...rows[0]!, portal };
};

await db.query(
  `INSERT INTO users (phone, first_name, last_name, is_platform_admin) VALUES ($1, 'Platform', 'Admin', true)
   ON CONFLICT (phone) DO UPDATE SET is_platform_admin = true`,
  [ADMIN_PHONE],
);
const admin = await userByPhone(ADMIN_PHONE, 'customer');

type DemoShop = {
  slug: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  audience: 'men' | 'women' | 'unisex';
  district: string;
  city: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  about: string;
  colors: [string, string][];
  owner: { phone: string; firstName: string; lastName: string };
  staff: { phone: string; displayName: string }[];
  services: { catalogId: number; lira: number; startingFrom?: boolean }[];
};

const shops: DemoShop[] = [
  {
    slug: 'demo-berber',
    name: 'Demo Erkek Kuaförü',
    address: 'Caferağa Mah. Moda Cad. No: 12, Kadıköy, İstanbul',
    latitude: 40.9867,
    longitude: 29.0262,
    audience: 'men',
    district: 'Kadıköy',
    city: 'İstanbul',
    phone: '+905320000001',
    whatsapp: '+905320000001',
    instagram: 'demoberber',
    about: 'Moda’nın klasik erkek kuaförü. Saç, sakal ve damat tıraşında 15 yıllık deneyim.',
    colors: [
      ['#0e1013', '#1c2027'],
      ['#0e1013', '#1f48c9'],
      ['#111a33', '#2b3550'],
      ['#1c2027', '#3a3f48'],
      ['#0e1013', '#16307f'],
    ],
    owner: { phone: '+905320000001', firstName: 'Salih', lastName: 'Demir' },
    staff: [
      { phone: '+905320000002', displayName: 'Cumali Yıldız' },
      { phone: '+905320000003', displayName: 'Tahir Aksoy' },
    ],
    // Catalog ids from migrations/002_catalog.sql.
    services: [
      { catalogId: 1, lira: 450 },
      { catalogId: 2, lira: 300 },
      { catalogId: 3, lira: 600 },
      { catalogId: 14, lira: 500 },
      { catalogId: 32, lira: 350 },
      { catalogId: 13, lira: 350 },
      { catalogId: 21, lira: 700 },
      { catalogId: 5, lira: 2000 },
      { catalogId: 29, lira: 400, startingFrom: true },
    ],
  },
  {
    slug: 'demo-kuafor-moda',
    name: 'Demo Kuaför Moda',
    address: 'Moda Mah. Bahariye Cad. No: 40, Kadıköy, İstanbul',
    latitude: 40.9843,
    longitude: 29.0301,
    audience: 'unisex',
    district: 'Kadıköy',
    city: 'İstanbul',
    phone: '+905320000011',
    whatsapp: '+905320000011',
    instagram: 'demokuafor',
    about: 'Kadın ve erkek için kesim, fön, boya ve bakım.',
    colors: [
      ['#111a33', '#1f48c9'],
      ['#0e1013', '#2b3550'],
      ['#1c2027', '#8daeff'],
    ],
    owner: { phone: '+905320000011', firstName: 'Elif', lastName: 'Kaya' },
    staff: [{ phone: '+905320000012', displayName: 'Zeynep Arslan' }],
    services: [
      { catalogId: 1, lira: 600 },
      { catalogId: 33, lira: 400 },
      { catalogId: 35, lira: 1200, startingFrom: true },
      { catalogId: 25, lira: 300 },
      { catalogId: 19, lira: 1500, startingFrom: true },
    ],
  },
];

/** Clearly labelled placeholder photos until shops upload their own. */
function samplePhoto([from, to]: [string, string], n: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <g fill="#fff" opacity="0.2" transform="translate(600 430) rotate(${-20 + n * 9}) scale(1.4) translate(-78 -110)">
      <path d="M28 2C18 36 49 94 75 130L89 120C67 84 42 30 28 2Z"/>
      <path d="M128 2C138 36 107 94 81 130L67 120C89 84 114 30 128 2Z"/>
      <ellipse cx="78" cy="127" rx="15" ry="13"/>
      <path d="M72 132 58 152M84 132l14 20" stroke="#fff" stroke-width="12" stroke-linecap="round"/>
      <g fill="none" stroke="#fff" stroke-width="14">
        <ellipse cx="35" cy="181" rx="30" ry="24" transform="rotate(-33 35 181)"/>
        <ellipse cx="121" cy="181" rx="30" ry="24" transform="rotate(33 121 181)"/>
      </g>
    </g>
    <text x="60" y="840" font-family="sans-serif" font-size="40" fill="#fff" opacity="0.9">Örnek fotoğraf ${n}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

for (const demo of shops) {
  const exists = await db.query('SELECT 1 FROM shops WHERE slug = $1', [demo.slug]);
  if (exists.rowCount) {
    console.log(`${demo.slug}: already there`);
    continue;
  }
  const { shopId, ownerMemberId } = await createShop(deps, admin, {
    name: demo.name,
    slug: demo.slug,
    address: demo.address,
    latitude: demo.latitude,
    longitude: demo.longitude,
    audience: demo.audience,
    owner: { ...demo.owner, displayName: `${demo.owner.firstName} ${demo.owner.lastName}`, bookable: true },
  });
  await markReviewed(deps, admin, shopId);
  await setSubscription(deps, admin, shopId, { status: 'active' });
  const owner = await userByPhone(demo.owner.phone, 'owner');
  await updateShopSettings(deps, owner, shopId, {
    district: demo.district,
    city: demo.city,
    phone: demo.phone,
    whatsapp: demo.whatsapp,
    instagram: demo.instagram,
    about: demo.about,
  });
  for (const [i, colors] of demo.colors.entries()) {
    await addPhoto(deps, owner, shopId, await samplePhoto(colors, i + 1));
  }

  const serviceIds = await importCatalog(
    deps,
    owner,
    shopId,
    demo.services.map((s) => ({ catalogId: s.catalogId, priceKurus: s.lira * 100, priceIsStartingFrom: s.startingFrom })),
  );
  const memberIds = [ownerMemberId];
  for (const s of demo.staff) {
    memberIds.push((await addMember(deps, owner, shopId, { ...s, role: 'staff', bookable: true })).memberId);
  }

  // Mon–Sat 10:00–21:00 with a 14:00–14:30 break; Sunday 11:00–18:00.
  const hours = [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
    { weekday, startMinute: 600, endMinute: 840 },
    { weekday, startMinute: 870, endMinute: 1260 },
  ]);
  hours.push({ weekday: 7, startMinute: 660, endMinute: 1080 });
  for (const [i, memberId] of memberIds.entries()) {
    await setWorkingHours(deps, owner, shopId, memberId, hours);
    // The last staff member does not offer the last two services.
    const offered = i === memberIds.length - 1 ? serviceIds.slice(0, -2) : serviceIds;
    await setMemberServices(deps, owner, shopId, memberId, offered.map((serviceId) => ({ serviceId })));
  }
  await setAutoConfirmHours(deps, owner, shopId, [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 600, endMinute: 720 })));

  // A few bookings later today, so the times screen shows busy slots.
  const today = DateTime.now().setZone('Europe/Istanbul').startOf('day');
  for (const [i, hhmm] of ['15:00', '17:30', '19:00'].entries()) {
    const startsAt = today.plus({ hours: Number(hhmm.slice(0, 2)), minutes: Number(hhmm.slice(3)) }).toJSDate();
    if (startsAt <= new Date()) continue;
    try {
      await createStaffAppointment(deps, shopId, {
        staffId: memberIds[i % memberIds.length]!,
        serviceIds: [serviceIds[0]!],
        startsAt,
        customerName: 'Demo Müşteri',
        walkIn: false,
      });
    } catch {
      // A booking that does not fit today's hours is simply skipped.
    }
  }
  console.log(`${demo.slug}: created (owner ${demo.owner.phone})`);
}

// Sample posts for Popüler kesimler (v1.7), added once per demo shop, also to shops seeded before posts existed.
const DEMO_POSTS: Record<string, [string, string, string][]> = {
  'demo-berber': [
    ['skin-fade', '#0e1013', '#1f48c9'],
    ['klasik', '#1c2027', '#3a3f48'],
    ['sakal', '#111a33', '#2b3550'],
    ['crop', '#0e1013', '#16307f'],
  ],
  'demo-kuafor-moda': [
    ['balyaj', '#111a33', '#8daeff'],
    ['bob', '#0e1013', '#1f48c9'],
    ['dalga', '#1c2027', '#2b3550'],
  ],
};
for (const demo of shops) {
  const { rows } = await db.query<{ id: string; posts: number }>(
    'SELECT s.id, (SELECT count(*)::int FROM haircut_posts p WHERE p.shop_id = s.id) AS posts FROM shops s WHERE s.slug = $1',
    [demo.slug],
  );
  const shop = rows[0];
  if (!shop || shop.posts > 0) continue;
  const owner = await userByPhone(demo.owner.phone, 'owner');
  for (const [i, [style, from, to]] of (DEMO_POSTS[demo.slug] ?? []).entries()) {
    await addPost(deps, owner, shop.id, await samplePhoto([from, to], i + 1), { style });
  }
  console.log(`${demo.slug}: sample haircut posts added`);
}
// Sample visits for the last 45 days, so İstatistikler has something to show on the test site.
const SOURCE_SHARE = { kesfet: 0.45, kesimler: 0.25, qr: 0.15, diger: 0.15 };
for (const demo of shops) {
  const { rows } = await db.query<{ id: string; seeded: boolean }>(
    'SELECT s.id, EXISTS (SELECT 1 FROM shop_view_counts v WHERE v.shop_id = s.id) AS seeded FROM shops s WHERE s.slug = $1',
    [demo.slug],
  );
  const shop = rows[0];
  if (!shop || shop.seeded) continue;
  const today = DateTime.now().setZone('Europe/Istanbul').startOf('day');
  for (let i = 0; i < 45; i++) {
    const day = today.minus({ days: i });
    // Busier at weekends, with a gentle wave so no two weeks look the same.
    const base = (day.weekday >= 5 ? 14 : 8) * (1 + 0.35 * Math.sin(i / 3));
    for (const [source, share] of Object.entries(SOURCE_SHARE)) {
      const views = Math.round(base * share + ((i * 7 + source.length) % 3));
      if (views > 0) {
        await db.query('INSERT INTO shop_view_counts (shop_id, day, source, views) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [
          shop.id,
          day.toISODate(),
          source,
          views,
        ]);
      }
    }
  }
  console.log(`${demo.slug}: sample visits added`);
}
await db.end();
