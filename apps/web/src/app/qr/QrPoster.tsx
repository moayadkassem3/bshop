'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useBusinessShops } from '@/lib/business';
import { BRAND } from '@/lib/config';
import { qrPosterPng, qrSvg, saveFile } from '@/lib/qr';
import styles from './qr.module.css';

/**
 * The salon's QR code (v1.7): it opens the salon's page. The logo sits in the
 * middle and "Salon adı | Uygulama adı" below; owners download it or print it.
 */
export function QrPoster() {
  const { shops, shop, shopId, selectShop, error } = useBusinessShops();
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);
  const link = shop && origin ? `${origin}/${shop.slug}` : null;
  const svg = useMemo(() => (link ? qrSvg(link) : null), [link]);
  const caption = shop ? `${shop.name} | ${BRAND}` : '';

  async function download() {
    if (!link || !shop) return;
    saveFile(await qrPosterPng(link, caption), `${shop.slug}-qr.png`);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link is shown on the page to copy by hand.
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div className="container narrow">
          <Link href="/profil" className={styles.back}>
            ← Profil
          </Link>
          <h1>QR kod</h1>
          <p>Salonunuza asın: müşteriler okutunca salon sayfanız açılır ve randevu alır.</p>
          {shops && shops.length > 1 && (
            <select className={styles.select} value={shopId ?? ''} aria-label="İşletme" onChange={(e) => selectShop(e.target.value)}>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      <main className="container narrow">
        {error && <p className="alert alert-danger">{error}</p>}
        {shops && shops.length === 0 && <p className="muted">Bu hesap henüz bir işletmeye bağlı değil.</p>}
        {svg && shop && (
          <>
            <figure className={styles.poster}>
              {/* Generated here from the salon's link; no outside content. */}
              <div className={styles.code} dangerouslySetInnerHTML={{ __html: svg }} />
              <figcaption className={styles.caption}>{caption}</figcaption>
            </figure>
            <p className={styles.link}>{link}</p>
            <div className={styles.actions}>
              <button type="button" className="btn btn-primary" onClick={download}>
                PNG indir
              </button>
              <button type="button" className="btn" onClick={() => window.print()}>
                Yazdır
              </button>
              <button type="button" className="btn" onClick={copy}>
                {copied ? 'Kopyalandı' : 'Bağlantıyı kopyala'}
              </button>
            </div>
            {!shop.reviewed_at && <p className="alert alert-info">Salonunuz onaylanana kadar bu bağlantı açılmaz.</p>}
          </>
        )}
      </main>
    </div>
  );
}
