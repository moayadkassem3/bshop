'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { photoUrl } from '@/lib/shop';
import type { Photo } from '@/lib/types';
import styles from './PhotoGallery.module.css';

/** Swipeable cover photos at the top of the profile; tapping one opens the photo viewer. */
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

/** All photos as thumbnails ("Fotoğraflar"), opening the same photo viewer. */
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

/**
 * The photos opened from a salon's page (founder request, 7 November 2026): a card
 * in the middle of the screen, not full screen, with the neighbours peeking in at
 * the sides. Swipe (or the arrows and the keyboard) to move; the one in the middle
 * is full size, the others smaller and dimmed. A click outside a photo closes it.
 */
function Lightbox({ photos, index, onChange }: { photos: Photo[]; index: number; onChange: (i: number | null) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(index);

  const goTo = useCallback((i: number, smooth = true) => {
    const el = track.current;
    const slide = el?.children[i] as HTMLElement | undefined;
    if (!el || !slide) return;
    el.scrollTo({ left: slide.offsetLeft - (el.clientWidth - slide.clientWidth) / 2, behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  // Open on the photo that was clicked.
  useEffect(() => {
    goTo(index, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChange(null);
      if (e.key === 'ArrowRight') goTo(Math.min(current + 1, photos.length - 1));
      if (e.key === 'ArrowLeft') goTo(Math.max(current - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [current, photos.length, onChange, goTo]);

  // The photo nearest the middle is the current one; the others shrink and dim with their distance.
  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const middle = el.scrollLeft + el.clientWidth / 2;
    let nearest = 0;
    Array.from(el.children).forEach((child, i) => {
      const c = child as HTMLElement;
      const distance = Math.min(1, Math.abs(c.offsetLeft + c.clientWidth / 2 - middle) / c.clientWidth);
      c.style.setProperty('--away', distance.toFixed(3));
      const best = el.children[nearest] as HTMLElement;
      if (Math.abs(c.offsetLeft + c.clientWidth / 2 - middle) < Math.abs(best.offsetLeft + best.clientWidth / 2 - middle)) nearest = i;
    });
    setCurrent(nearest);
  };
  useEffect(onScroll, []);

  return (
    <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label="Fotoğraflar" onClick={() => onChange(null)}>
      <div className={styles.lightboxTop}>
        <span className={styles.lightboxCounter}>
          {current + 1} / {photos.length}
        </span>
        <button type="button" className={styles.close} onClick={() => onChange(null)} aria-label="Kapat">
          ✕
        </button>
      </div>
      <div ref={track} className={styles.carousel} onScroll={onScroll}>
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={styles.card}
            aria-label={`Fotoğraf ${i + 1}`}
            aria-current={i === current}
            onClick={(e) => {
              // A click on a photo does not close; a click on a neighbour brings it to the middle.
              e.stopPropagation();
              if (i !== current) goTo(i);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(p.id)} alt="" width={p.width} height={p.height} loading={Math.abs(i - index) <= 1 ? 'eager' : 'lazy'} />
          </button>
        ))}
      </div>
      {current > 0 && (
        <button
          type="button"
          className={`${styles.nav} ${styles.prev}`}
          onClick={(e) => {
            e.stopPropagation();
            goTo(current - 1);
          }}
          aria-label="Önceki"
        >
          ‹
        </button>
      )}
      {current < photos.length - 1 && (
        <button
          type="button"
          className={`${styles.nav} ${styles.next}`}
          onClick={(e) => {
            e.stopPropagation();
            goTo(current + 1);
          }}
          aria-label="Sonraki"
        >
          ›
        </button>
      )}
      {photos.length > 1 && (
        <div className={styles.dots} aria-hidden>
          {photos.map((p, i) => (
            <span key={p.id} className={i === current ? styles.dotOn : ''} />
          ))}
        </div>
      )}
    </div>
  );
}
