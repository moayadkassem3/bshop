import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BookingFlow } from '@/components/booking/BookingFlow';
import { SERVER_API_URL } from '@/lib/config';
import type { ShopProfile } from '@/lib/types';
import styles from './shop.module.css';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ personel?: string }> };

async function loadProfile(slug: string): Promise<ShopProfile | null> {
  const res = await fetch(`${SERVER_API_URL}/public/shops/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Shop profile failed: ${res.status}`);
  return res.json();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await loadProfile((await params).slug);
  return profile
    ? { title: `${profile.name} — Randevu al`, description: `${profile.name} için boş saatleri görün ve randevunuzu oluşturun.` }
    : { title: 'Salon bulunamadı' };
}

/** The shop's own booking link (also behind its QR code). */
export default async function ShopPage({ params, searchParams }: Props) {
  const [{ slug }, { personel }] = await Promise.all([params, searchParams]);
  const profile = await loadProfile(slug);
  if (!profile) notFound();

  const mapsUrl =
    profile.latitude !== null && profile.longitude !== null
      ? `https://www.google.com/maps/search/?api=1&query=${profile.latitude},${profile.longitude}`
      : null;

  return (
    <div className="container narrow">
      <header className={styles.header}>
        <p className={styles.kicker}>Randevu al</p>
        <h1 className={styles.name}>{profile.name}</h1>
        {profile.address && (
          <p className={styles.address}>
            {profile.address}
            {mapsUrl && (
              <>
                {' · '}
                <a href={mapsUrl} target="_blank" rel="noreferrer">
                  Yol tarifi
                </a>
              </>
            )}
          </p>
        )}
        <div className={styles.tags}>
          <span className="badge badge-muted">Ödeme salonda</span>
          <span className="badge badge-muted">{profile.staff.length} usta</span>
        </div>
      </header>
      <BookingFlow profile={profile} presetStaffId={personel ?? null} />
    </div>
  );
}
