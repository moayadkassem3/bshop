'use client';

import { useEffect, useState } from 'react';
import type { BusinessShop } from '@/lib/business';
import { BRAND } from '@/lib/config';
import { qrPosterPng, saveFile } from '@/lib/qr';
import { qrLink } from '@/lib/views';
import styles from './ShareShop.module.css';

/**
 * "Paylaş": the salon's QR poster and its link together, through the phone's
 * share menu (WhatsApp, Instagram, ...). Where files cannot be shared, the PNG
 * is downloaded and the link copied instead.
 */
export function ShareShop(props: { shop: BusinessShop; onDone: (note: string | null) => void; className?: string }) {
  const { shop, onDone } = props;
  const [file, setFile] = useState<File | null>(null);
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/${shop.slug}`;

  // Built ahead of the tap: browsers only open the share menu right after a user gesture.
  useEffect(() => {
    let cancelled = false;
    qrPosterPng(qrLink(link), `${shop.name} | ${BRAND}`)
      .then((png) => !cancelled && setFile(new File([png], `${shop.slug}-qr.png`, { type: 'image/png' })))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [link, shop.name, shop.slug]);

  async function share() {
    if (!file) return;
    onDone(null);
    const text = `${shop.name}: randevu almak için ${link}`;
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: shop.name, text });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    saveFile(file, file.name);
    try {
      await navigator.clipboard.writeText(link);
      onDone('QR kod indirildi, bağlantı kopyalandı.');
    } catch {
      onDone(`QR kod indirildi. Bağlantı: ${link}`);
    }
  }

  return (
    <button type="button" className={`btn ${styles.shareBtn} ${props.className ?? ''}`} disabled={!file} onClick={share}>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
      </svg>
      Paylaş
    </button>
  );
}
