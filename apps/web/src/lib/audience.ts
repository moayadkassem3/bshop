'use client';

import { useEffect, useState } from 'react';
import { api } from './api';
import { getToken, rememberPortal } from './session';
import type { Me } from './types';

export type Audience = 'all' | 'men' | 'women';

// The salon type the customer picked stays for this visit; otherwise it follows their gender (v1.7).
const KEY = 'salon-randevu-tur';

function readPicked(): Audience | null {
  try {
    return (window.sessionStorage.getItem(KEY) as Audience | null) ?? null;
  } catch {
    return null;
  }
}

/** Keşfet's salon-type filter, shared with Popüler kesimler. */
export function useAudience(): [Audience, (value: Audience) => void] {
  const [audience, setAudience] = useState<Audience>('all');

  useEffect(() => {
    const picked = readPicked();
    if (picked) return setAudience(picked);
    if (!getToken()) return;
    api<Me>('/me')
      .then((me) => {
        rememberPortal(me.portal);
        if (me.gender && !readPicked()) setAudience(me.gender === 'male' ? 'men' : 'women');
      })
      .catch(() => undefined);
  }, []);

  function pick(value: Audience) {
    setAudience(value);
    try {
      window.sessionStorage.setItem(KEY, value);
    } catch {
      // The choice lasts until the page is left.
    }
  }

  return [audience, pick];
}
