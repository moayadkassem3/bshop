'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useBusinessShops } from '@/lib/business';
import { BRAND } from '@/lib/config';
import { qrSvg } from '@/lib/qr';
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
    if (!svg || !shop) return;
    const width = 1200;
    const height = 1330;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    ctx.drawImage(img, 100, 100, 1000, 1000);
    await document.fonts.load('800 52px "Inter Variable"').catch(() => undefined);
    ctx.fillStyle = '#0e1013';
    ctx.textAlign = 'center';
    let size = 56;
    do {
      ctx.font = `800 ${size}px "Inter Variable", sans-serif`;
      size -= 2;
    } while (ctx.measureText(caption).width > width - 160 && size > 24);
    ctx.fillText(caption, width / 2, 1215);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${shop.slug}-qr.png`;
    a.click();
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
