import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { BookingFlow } from '@/components/booking/BookingFlow';
import { loadProfile } from '@/lib/server';
import styles from '../shop.module.css';
import { BackArrow } from '@/components/BackArrow';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ personel?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await loadProfile((await params).slug);
  return profile ? { title: `${profile.name} — Randevu al` } : { title: 'Salon bulunamadı' };
}

/** Booking for one shop. A staff member's personal link adds ?personel=<id>. */
export default async function BookingPage({ params, searchParams }: Props) {
  const [{ slug }, { personel }] = await Promise.all([params, searchParams]);
  const profile = await loadProfile(slug);
  if (!profile) notFound();
  // An earlier link still works and moves to the current one (v1.7).
  if (profile.slug !== slug) permanentRedirect(`/${profile.slug}/randevu${personel ? `?personel=${encodeURIComponent(personel)}` : ''}`);

  return (
    <div className="container narrow">
      <header className={styles.bookingHeader}>
        <Link href={`/${profile.slug}`} className={styles.backToProfile}>
          <BackArrow />
          {profile.name}
        </Link>
        <h1 className={styles.bookingTitle}>Randevu al</h1>
      </header>
      <BookingFlow profile={profile} presetStaffId={personel ?? null} />
    </div>
  );
}
