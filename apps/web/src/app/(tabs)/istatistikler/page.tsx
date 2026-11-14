import type { Metadata } from 'next';
import { Stats } from './Stats';

export const metadata: Metadata = { title: 'İstatistikler' };

export default function StatsPage() {
  return <Stats />;
}
