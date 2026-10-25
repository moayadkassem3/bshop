import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FavoriteButton } from '@/components/FavoriteButton';
import { PhotoGallery, PhotoGrid } from '@/components/PhotoGallery';
import { formatDuration, formatPrice } from '@/lib/format';
import { loadProfile } from '@/lib/server';
import { AUDIENCE, directionsUrl, formatPhone, placeLabel, todayHours, turkeyWeekday, WEEKDAYS, whatsappUrl } from '@/lib/shop';
import { ServiceList } from './ServiceList';
import styles from './shop.module.css';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await loadProfile((await params).slug);
  return profile
    ? {
        title: profile.name,
        description: `${profile.name}${profile.district ? `, ${profile.district}` : ''}: fotoğraflar, fiyatlar, adres ve online randevu.`,
      }
    : { title: 'Salon bulunamadı' };
}

/** The shop's public profile (handoff v1.3), behind its link and QR code. */
export default async function ShopProfilePage({ params }: Props) {
  const { slug } = await params;
  const profile = await loadProfile(slug);
  if (!profile) notFound();

  const directions = directionsUrl(profile);
  const today = todayHours(profile.openingHours);
  const weekday = turkeyWeekday();
  const bookUrl = `/${profile.slug}/randevu`;

  return (
    <div className={styles.profile}>
      <Link href="/" className={styles.floatingBack} aria-label="Keşfet'e dön">
        ←
      </Link>
      <PhotoGallery photos={profile.photos} name={profile.name} />

      <div className="container narrow">
        <header className={styles.profileHeader}>
          <div className={styles.titleRow}>
            <h1 className={styles.name}>{profile.name}</h1>
            <FavoriteButton slug={profile.slug} />
          </div>
          <p className={styles.subline}>
            {AUDIENCE[profile.audience]}
            {placeLabel(profile) ? ` · ${placeLabel(profile)}` : ''}
          </p>
          <p className={today?.open ? styles.openNow : styles.closedNow}>
            {today?.open ? `Bugün açık · ${today.open}–${today.close}` : 'Bugün kapalı'}
          </p>
          {profile.about && <p className={styles.about}>{profile.about}</p>}
        </header>

        <section className={`card ${styles.section}`} aria-labelledby="info-title">
          <h2 id="info-title" className={styles.sectionTitle}>
            Salon bilgileri
          </h2>
          {profile.address && (
            <div className={styles.infoRow}>
              <span className={styles.infoIcon} aria-hidden>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
                  <circle cx="12" cy="9.5" r="2.5" />
                </svg>
              </span>
              <span className={styles.infoText}>{profile.address}</span>
              {directions && (
                <a href={directions} target="_blank" rel="noreferrer" className={`btn ${styles.infoAction}`}>
                  Yol tarifi
                </a>
              )}
            </div>
          )}
          {profile.phone && (
            <a href={`tel:${profile.phone}`} className={styles.infoRow}>
              <span className={styles.infoIcon} aria-hidden>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
                </svg>
              </span>
              <span className={styles.infoText}>{formatPhone(profile.phone)}</span>
              <span className={styles.infoHint}>Ara</span>
            </a>
          )}
          {profile.whatsapp && (
            <a href={whatsappUrl(profile.whatsapp)} target="_blank" rel="noreferrer" className={styles.infoRow}>
              <span className={`${styles.infoIcon} ${styles.whatsappIcon}`} aria-hidden>
                <WhatsAppIcon />
              </span>
              <span className={styles.infoText}>WhatsApp ile yazın</span>
              <span className={styles.infoHint}>Aç</span>
            </a>
          )}
          {profile.instagram && (
            <a
              href={`https://instagram.com/${profile.instagram}`}
              target="_blank"
              rel="noreferrer"
              className={styles.infoRow}
            >
              <span className={`${styles.infoIcon} ${styles.instagramIcon}`} aria-hidden>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
                </svg>
              </span>
              <span className={styles.infoText}>@{profile.instagram}</span>
              <span className={styles.infoHint}>Instagram</span>
            </a>
          )}
        </section>

        {profile.photos.length > 1 && (
          <section className={`card ${styles.section}`} aria-labelledby="photos-title">
            <h2 id="photos-title" className={styles.sectionTitle}>
              Fotoğraflar <span className={styles.count}>{profile.photos.length}</span>
            </h2>
            <PhotoGrid photos={profile.photos} />
          </section>
        )}

        <section className={`card ${styles.section}`} aria-labelledby="hours-title">
          <h2 id="hours-title" className={styles.sectionTitle}>
            Çalışma saatleri
          </h2>
          <dl className={styles.hours}>
            {profile.openingHours.map((h) => (
              <div key={h.weekday} className={h.weekday === weekday ? styles.hoursToday : undefined}>
                <dt>{WEEKDAYS[h.weekday - 1]}</dt>
                <dd>{h.open ? `${h.open}–${h.close}` : 'Kapalı'}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={`card ${styles.section}`} aria-labelledby="services-title">
          <h2 id="services-title" className={styles.sectionTitle}>
            Hizmetler ve fiyatlar
          </h2>
          <ServiceList
            services={profile.services.map((s) => ({
              id: s.id,
              name: s.name,
              meta: formatDuration(s.duration_minutes),
              price: formatPrice(s.price_kurus, s.price_is_starting_from),
            }))}
          />
          <p className={styles.note}>Ödeme salonda yapılır.</p>
        </section>

        {profile.staff.length > 0 && (
          <section className={`card ${styles.section}`} aria-labelledby="staff-title">
            <h2 id="staff-title" className={styles.sectionTitle}>
              Personel
            </h2>
            <ul className={styles.staffList} role="list">
              {profile.staff.map((m) => (
                <li key={m.id}>
                  <span className={styles.staffAvatar} aria-hidden>
                    {m.display_name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((p) => p[0])
                      .join('')}
                  </span>
                  <span className={styles.staffName}>{m.display_name}</span>
                  <Link href={`${bookUrl}?personel=${m.id}`} className={styles.staffBook}>
                    Randevu al
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <nav className={styles.actionBar} aria-label="Salonla iletişim">
        <div className={styles.actionInner}>
          {profile.whatsapp && (
            <a href={whatsappUrl(profile.whatsapp)} target="_blank" rel="noreferrer" className={`${styles.action} ${styles.actionWhatsapp}`} aria-label="WhatsApp">
              <WhatsAppIcon />
            </a>
          )}
          {profile.phone && (
            <a href={`tel:${profile.phone}`} className={styles.action} aria-label="Ara">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
              </svg>
            </a>
          )}
          {directions && (
            <a href={directions} target="_blank" rel="noreferrer" className={styles.action} aria-label="Yol tarifi">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="m3 11 18-8-8 18-2-8z" />
              </svg>
            </a>
          )}
          <Link href={bookUrl} className={`btn btn-primary ${styles.bookButton}`}>
            Randevu al
          </Link>
        </div>
      </nav>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2m0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2m4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.4 3.9c1.6.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.7-1.2 2.2 2.2 0 0 0 .2-1.2c-.1-.1-.3-.2-.6-.3" />
    </svg>
  );
}
