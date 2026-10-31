import type { Metadata } from 'next';
import { History } from './History';

export const metadata: Metadata = { title: 'Geçmiş' };

export default function HistoryPage() {
  return <History />;
}
