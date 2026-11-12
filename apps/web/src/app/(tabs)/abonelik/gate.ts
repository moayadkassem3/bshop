'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getToken, setToken, useBusinessMode } from '@/lib/session';
import type { Me } from '@/lib/types';

export type GateState = 'checking' | 'signed-out' | 'no-business' | 'business';

/**
 * Aboneliğim and the payment page are opened from an SMS, often while signed out or in
 * customer mode: asks for sign-in, or switches to the salon account.
 */
export function useBusinessGate(): GateState {
  const business = useBusinessMode();
  const [state, setState] = useState<GateState>('checking');
  useEffect(() => {
    if (!getToken()) return setState('signed-out');
    if (business) return setState('business');
    api<Me>('/me')
      .then(async (me) => {
        if (!me.has_business) return setState('no-business');
        const r = await api<{ token: string; user: Me }>('/me/switch', { method: 'POST', body: { to: 'business' } });
        setToken(r.token, r.user.portal);
        setState('business');
      })
      .catch(() => setState('signed-out'));
  }, [business]);
  return state;
}
