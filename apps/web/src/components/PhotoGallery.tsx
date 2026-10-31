'use client';

import { useEffect, useRef, useState } from 'react';
import { photoUrl } from '@/lib/shop';
import type { Photo } from '@/lib/types';
import styles from './PhotoGallery.module.css';

/** Swipeable cover photos at the top of the profile; tapping one opens it full screen. */
export function PhotoGallery({ photos, name }: { photos: Photo[]; name: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState<number | null>(null);

  if (photos.length === 0) {
    const initials = name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0])
      .join('');
    return (
      <div className={styles.placeholder} aria-hidden>
        <span>{initials}</span>
      </div>
    );
  }

  return (
    <>
      <div className={styles.hero}>
        <div
          ref={track}
          className={styles.track}
          onScroll={(e) => {
            const el = e.currentTarget;
            setIndex(Math.round(el.scrollLeft / el.clientWidth));
          }}
        >
          {photos.map((p, i) => (
            <button key={p.id} type="button" className={styles.slide} onClick={() => setOpen(i)} aria-label={`Fotoğraf ${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(p.id)} alt="" width={p.width} height={p.height} loading={i === 0 ? 'eager' : 'lazy'} />
            </button>
          ))}
        </div>
        {photos.length > 1 && (
          <span className={styles.counter}>
            {index + 1} / {photos.length}
          </span>
        )}
      </div>

      {open !== null && <Lightbox photos={photos} index={open} onChange={setOpen} />}
    </>
  );
}

/** All photos as thumbnails ("Fotoğraflar"), opening the same full-screen view. */
export function PhotoGrid({ photos }: { photos: Photo[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <div className={styles.grid}>
        {photos.map((p, i) => (
          <button key={p.id} type="button" className={styles.thumb} onClick={() => setOpen(i)} aria-label={`Fotoğraf ${i + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(p.id)} alt="" loading="lazy" width={p.width} height={p.height} />
          </button>
        ))}
      </div>
      {open !== null && <Lightbox photos={photos} index={open} onChange={setOpen} />}
    </>
  );
}

function Lightbox({ photos, index, onChange }: { photos: Photo[]; index: number; onChange: (i: number | null) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChange(null);
      if (e.key === 'ArrowRight') onChange(Math.min(index + 1, photos.length - 1));
      if (e.key === 'ArrowLeft') onChange(Math.max(index - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [index, photos.length, onChange]);

  return (
    <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label="Fotoğraflar">
      <button type="button" className={styles.close} onClick={() => onChange(null)} aria-label="Kapat">
        ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl(photos[index]!.id)} alt="" className={styles.full} />
      {index > 0 && (
        <button type="button" className={`${styles.nav} ${styles.prev}`} onClick={() => onChange(index - 1)} aria-label="Önceki">
          ‹
        </button>
      )}
      {index < photos.length - 1 && (
        <button type="button" className={`${styles.nav} ${styles.next}`} onClick={() => onChange(index + 1)} aria-label="Sonraki">
          ›
        </button>
      )}
      <span className={styles.lightboxCounter}>
        {index + 1} / {photos.length}
      </span>
    </div>
  );
}
