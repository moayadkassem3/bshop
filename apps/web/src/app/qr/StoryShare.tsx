'use client';

import { useEffect, useState } from 'react';
import { saveFile } from '@/lib/qr';
import { storyPng } from '@/lib/story';
import { qrLink } from '@/lib/views';
import styles from './qr.module.css';

/**
 * "Hikâye olarak paylaş" (v1.7): the salon's story image (QR code, name, link,
 * three steps) through the phone's share menu, with a call to action and the
 * link as text. The link is also copied, for Instagram's "Bağlantı" sticker.
 */
export function StoryShare({ shop, link }: { shop: { name: string; slug: string }; link: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Built ahead of the tap: browsers only open the share menu right after a user gesture.
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    storyPng({ qrLink: qrLink(link), shownLink: link.replace(/^https?:\/\//, ''), shopName: shop.name })
      .then((png) => {
        if (cancelled) return;
        setFile(new File([png], `${shop.slug}-hikaye.png`, { type: 'image/png' }));
        url = URL.createObjectURL(png);
        setPreview(url);
      })
      .catch((err) => console.error('Story image failed', err));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [link, shop.name, shop.slug]);

  async function share() {
    if (!file) return;
    setNote(null);
    const text = `${shop.name}: Randevunu saniyeler içinde al. Saatini seç, gel: ${link}`;
    let copied = false;
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
    } catch {
      // The link is in the text and on the image anyway.
    }
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text });
        if (copied) setNote('Bağlantı kopyalandı: Instagram hikâyesinde “Bağlantı” çıkartmasına yapıştırabilirsiniz.');
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    saveFile(file, file.name);
    setNote(copied ? 'Hikâye görseli indirildi, bağlantı kopyalandı.' : `Hikâye görseli indirildi. Bağlantı: ${link}`);
  }

  return (
    <section className={styles.story} aria-labelledby="story-title">
      <h2 id="story-title">Hikâye olarak paylaş</h2>
      <p className={styles.storyLead}>Instagram veya WhatsApp hikâyenize hazır görsel: QR kodunuz, salon adınız ve bağlantınızla.</p>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Hikâye görseli önizlemesi" className={styles.storyPreview} width={1080} height={1920} />
      ) : (
        <div className={styles.storyPreview} aria-hidden />
      )}
      <button type="button" className="btn btn-primary" disabled={!file} onClick={share}>
        Hikâye olarak paylaş
      </button>
      {note && (
        <p className={styles.storyNote} role="status">
          {note}
        </p>
      )}
    </section>
  );
}
