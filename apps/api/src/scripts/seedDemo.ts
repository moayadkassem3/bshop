import { DateTime } from 'luxon';
import { systemClock } from '../clock.js';
import { loadConfig } from '../config.js';
import { createPool, migrate } from '../db.js';
import type { Deps } from '../deps.js';
import { consolePush, consoleSms } from '../notifications.js';
import type { User } from '../services/auth.js';
import { createStaffAppointment } from '../services/booking.js';
import { createShop, markReviewed, setAutoConfirmHours, setSubscription } from '../services/shops.js';
import { addMember, importCatalog, setMemberServices, setWorkingHours } from '../services/team.js';

// Local demo data: two reviewed, subscribed shops in Kadıköy with staff, hours,
// prices, and a few bookings today. Safe to run again: existing shops are skipped.
const ADMIN_PHONE = process.env.ADMIN_PHONE ?? '+905000000000';

const config = loadConfig();
const db = createPool(config.databaseUrl);
const deps: Deps = { db, clock: systemClock, sms: consoleSms, push: consolePush, config };
await migrate(db);

const userByPhone = async (phone: string, portal: User['portal']): Promise<User> => {
  const { rows } = await db.query<Omit<User, 'portal'>>(
    'SELECT id, phone, first_name, last_name, is_platform_admin FROM users WHERE phone = $1',
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
  owner: { phone: string; firstName: string; lastName: string };
  staff: { phone: string; displayName: string }[];
  services: { catalogId: number; lira: number; startingFrom?: boolean }[];
};

const shops: DemoShop[] = [
  {
    slug: 'demo-berber',
    name: 'Demo Berber Kadıköy',
    address: 'Caferağa Mah. Moda Cad. No: 12, Kadıköy, İstanbul',
    latitude: 40.9867,
    longitude: 29.0262,
    audience: 'men',
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
await db.end();
