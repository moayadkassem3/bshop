'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getToken, rememberPortal } from '@/lib/session';
import type { Me } from '@/lib/types';
import { BusinessAppointments } from './BusinessAppointments';
import { MyAppointments } from './MyAppointments';

/** Randevular shows the customer's own bookings, or the shop's requests and schedule in business mode. */
export function AppointmentsTab() {
  const [mode, setMode] = useState<'customer' | 'business' | null>(null);

  useEffect(() => {
    if (!getToken()) return setMode('customer');
    api<Me>('/me')
      .then((me) => {
        rememberPortal(me.portal);
        setMode(me.portal && me.portal !== 'customer' ? 'business' : 'customer');
      })
      .catch(() => setMode('customer'));
  }, []);

  if (!mode) return null;
  return mode === 'business' ? <BusinessAppointments /> : <MyAppointments />;
}
