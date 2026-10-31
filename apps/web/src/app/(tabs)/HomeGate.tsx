'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ExploreMap } from '@/components/explore/ExploreMap';
import { storedPortal } from '@/lib/session';

/**
 * Opening the app in business mode lands on Salonum (v1.7). The map is still
 * reachable from there ("Haritada gör" opens /?harita), and customers always
 * get Keşfet.
 */
export function HomeGate() {
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const portal = storedPortal();
    const business = portal === 'owner' || portal === 'staff';
    if (business && !new URLSearchParams(window.location.search).has('harita')) router.replace('/salonum');
    else setShow(true);
  }, [router]);

  return show ? <ExploreMap /> : null;
}
