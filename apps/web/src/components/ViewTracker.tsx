'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';
import { storedPortal } from '@/lib/session';
import { takeViewSource } from '@/lib/views';

/**
 * Counts a visit to the salon's page for its statistics: once per browser
 * session, and not when the salon's own people look at it (business mode).
 */
export function ViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    const source = takeViewSource();
    const portal = storedPortal();
    if (portal === 'owner' || portal === 'staff') return;
    const key = `salon-randevu-ziyaret:${slug}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      // Without storage each visit counts.
    }
    api(`/public/shops/${encodeURIComponent(slug)}/views`, { method: 'POST', body: { source } }).catch(() => undefined);
  }, [slug]);
  return null;
}
