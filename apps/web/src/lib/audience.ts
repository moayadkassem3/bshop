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

// One /me per signed-in session for every screen that asks for the gender.
let cached: { token: string; gender: Promise<Me['gender'] | null> } | null = null;
function loadGender(): Promise<Me['gender'] | null> {
  const token = getToken();
  if (!token) return Promise.resolve(null);
  if (cached?.token !== token) {
    cached = {
      token,
      gender: api<Me>('/me')
        .then((me) => {
          rememberPortal(me.portal);
          return me.gender ?? null;
        })
        .catch(() => null),
    };
  }
  return cached.gender;
}

/**
 * Men see only men's haircut photos and cannot pick "Kadın kuaförü" (founder, 14 November
 * 2026), in customer and in business mode alike. Signed-out visitors, women and accounts
 * without a gender are not limited.
 */
export function useMenOnly(): boolean {
  const [male, setMale] = useState(false);
  useEffect(() => {
    let live = true;
    loadGender().then((g) => live && setMale(g === 'male'));
    return () => {
      live = false;
    };
  }, []);
  return male;
}

/** Keşfet's salon-type filter, shared with Popüler kesimler. */
export function useAudience(): [Audience, (value: Audience) => void, boolean] {
  const [audience, setAudience] = useState<Audience>('all');
  const menOnly = useMenOnly();

  useEffect(() => {
    const picked = readPicked();
    if (picked) setAudience(picked);
    loadGender().then((gender) => {
      if (!readPicked() && gender) setAudience(gender === 'male' ? 'men' : 'women');
    });
  }, []);

  function pick(value: Audience) {
    if (menOnly && value === 'women') return;
    setAudience(value);
    try {
      window.sessionStorage.setItem(KEY, value);
    } catch {
      // The choice lasts until the page is left.
    }
  }

  // A "Kadın" choice made before signing in does not carry over for men.
  return [menOnly && audience === 'women' ? 'men' : audience, pick, menOnly];
}

/** The audience for haircut photos: men customers always get men's. */
export function photoAudience(audience: Audience, menOnly: boolean): Audience {
  return menOnly ? 'men' : audience;
}
