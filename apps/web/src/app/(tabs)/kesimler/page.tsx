import type { Metadata } from 'next';
import { PopularHaircuts } from './PopularHaircuts';

export const metadata: Metadata = { title: 'Popüler kesimler' };

export default function HaircutsPage() {
  return <PopularHaircuts />;
}
