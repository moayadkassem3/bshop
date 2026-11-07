'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { subscriptionNotice, useBusinessShops } from '@/lib/business';
import { useBusinessMode } from '@/lib/session';
import styles from './SubscriptionBanner.module.css';
import { FORWARD } from '@/lib/motion';
import { useCanSell } from '@/lib/store';

/**
 * On every business screen (v1.7): the trial is about to end, a payment is late,
 * or the salon is hidden from customers until it subscribes. Its height is shared
 * as --banner-h so full-screen pages (the Keşfet map) start below it.
 */
export function SubscriptionBanner() {
  const business = useBusinessMode();
  const { shop } = useBusinessShops(business);
  const canSell = useCanSell();
  const notice = business && shop && canSell !== null ? subscriptionNotice(shop, canSell) : null;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!el) {
      root.style.setProperty('--banner-h', '0px');
      return;
    }
    const sync = () => root.style.setProperty('--banner-h', `${el.offsetHeight}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.setProperty('--banner-h', '0px');
    };
  }, [notice?.title]);

  if (!notice || !shop) return null;
  const owner = shop.role === 'owner';
  return (
    <div ref={ref} className={`${styles.banner} ${notice.tone === 'danger' ? styles.danger : styles.warning}`} role="status">
      <p>
        <strong>{notice.title}</strong> {notice.text}
      </p>
      {canSell !== true ? null : owner ? (
        shop.subscription_requested_at && notice.tone === 'danger' ? (
          <span className={styles.note}>Talebiniz alındı, sizi arayacağız.</span>
        ) : (
          <Link transitionTypes={FORWARD} href="/abonelik" className={styles.cta}>
            {notice.tone === 'danger' ? 'Aboneliği başlat' : 'Aboneliğim'}
          </Link>
        )
      ) : (
        <span className={styles.note}>Salon sahibiyle görüşün.</span>
      )}
    </div>
  );
}
