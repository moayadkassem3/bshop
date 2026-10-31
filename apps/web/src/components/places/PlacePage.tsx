import type { Metadata } from 'next';
import Link from 'next/link';
import { VerifiedTick } from '@/components/VerifiedTick';
import { SALON_TYPES, slugify, type SalonType } from '@/lib/places';
import { loadDistricts, loadListing } from '@/lib/server';
import { AUDIENCE, photoUrl } from '@/lib/shop';
import styles from './places.module.css';
import { BackArrow } from '@/components/BackArrow';

export type Place = { province: string; district?: string; type?: SalonType };

const heading = (p: Place) => `${p.district ?? p.province} ${p.type ? SALON_TYPES[p.type].title : 'kuaförleri'}`;
const capital = (s: string) => s.charAt(0).toLocaleUpperCase('tr') + s.slice(1);

export async function placeMetadata(p: Place): Promise<Metadata> {
  const shops = await loadListing({ city: p.province, district: p.district, audience: p.type ? SALON_TYPES[p.type].audience : undefined });
  const where = p.district ? `${p.district}, ${p.province}` : p.province;
  return {
    title: capital(heading(p)),
    description: `${where}: ${shops.length ? `${shops.length} ${p.type ? SALON_TYPES[p.type].one : 'kuaför'}` : 'kuaförler yakında'}. Fiyatları ve çalışma saatlerini görün, online randevu alın.`,
    // Empty places are not worth a search result until a salon joins.
    robots: shops.length ? undefined : { index: false, follow: true },
  };
}

/**
 * Listing pages (v1.7): a province, a district, or a district and a salon type.
 * Rendered on the server so search engines see every salon on the page.
 */
export async function PlacePage(p: Place) {
  const provinceHref = `/${slugify(p.province)}`;
  const districtHref = p.district ? `${provinceHref}/${slugify(p.district)}` : null;
  const [shops, districts] = await Promise.all([
    loadListing({ city: p.province, district: p.district, audience: p.type ? SALON_TYPES[p.type].audience : undefined }),
    p.district ? Promise.resolve(null) : loadDistricts(p.province),
  ]);
  const one = p.type ? SALON_TYPES[p.type].one : 'kuaför';

  return (
    <div className={`container narrow ${styles.page}`}>
      <Link href="/" className={styles.back}>
        <BackArrow />
        Keşfet
      </Link>
      <nav className={styles.crumbs} aria-label="Konum">
        <Link href={provinceHref}>{p.province}</Link>
        {p.district && (
          <>
            <span aria-hidden>›</span>
            <Link href={districtHref!}>{p.district}</Link>
          </>
        )}
        {p.type && (
          <>
            <span aria-hidden>›</span>
            <span>{capital(SALON_TYPES[p.type].title)}</span>
          </>
        )}
      </nav>
      <h1 className={styles.title}>{capital(heading(p))}</h1>
      <p className={styles.lead}>
        {shops.length ? `${shops.length} ${one}` : 'Henüz kayıtlı salon yok'} · fiyatları ve çalışma saatlerini görün, online randevu alın.
      </p>

      {districtHref && (
        <div className={styles.types} aria-label="Salon türü">
          <Link href={districtHref} className={!p.type ? styles.typeOn : undefined} aria-current={!p.type ? 'page' : undefined}>
            Tümü
          </Link>
          {(Object.keys(SALON_TYPES) as SalonType[]).map((t) => (
            <Link key={t} href={`${districtHref}/${t}`} className={p.type === t ? styles.typeOn : undefined} aria-current={p.type === t ? 'page' : undefined}>
              {capital(SALON_TYPES[t].title)}
            </Link>
          ))}
        </div>
      )}

      {districts && districts.length > 0 && (
        <section className={styles.section} aria-labelledby="districts-title">
          <h2 id="districts-title">İlçeler</h2>
          <ul className={styles.districts} role="list">
            {districts.map((d) => (
              <li key={d.district}>
                <Link href={`${provinceHref}/${slugify(d.district)}`}>
                  <span>{d.district}</span>
                  <span className={styles.count}>{d.total}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section} aria-label="Salonlar">
        {districts && <h2>Salonlar</h2>}
        {shops.length === 0 ? (
          <div className={`card ${styles.empty}`}>
            <p>Bu bölgede henüz uygulamamıza katılan salon yok.</p>
            <Link href="/" className="btn btn-primary">
              Haritada kuaför keşfet
            </Link>
          </div>
        ) : (
          <ul className={styles.list} role="list">
            {shops.map((s) => (
              <li key={s.slug}>
                <Link href={`/${s.slug}`} className={`card ${styles.item}`}>
                  {s.cover_photo_id ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl(s.cover_photo_id)} alt="" className={styles.thumb} width={64} height={64} loading="lazy" />
                  ) : (
                    <span className={`${styles.thumb} ${styles.initial}`} aria-hidden>
                      {s.name[0]}
                    </span>
                  )}
                  <span className={styles.text}>
                    <span className={styles.name}>
                      {s.name}
                      {s.verified && <VerifiedTick kind="salon" size={15} />}
                    </span>
                    <span className={styles.meta}>
                      {AUDIENCE[s.audience]}
                      {s.district ? ` · ${s.district}` : ''}
                    </span>
                    {s.address && <span className={styles.address}>{s.address}</span>}
                  </span>
                  <span className={styles.go} aria-hidden>
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
