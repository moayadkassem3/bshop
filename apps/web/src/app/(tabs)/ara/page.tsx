import type { Metadata } from 'next';
import { Search } from './Search';

export const metadata: Metadata = { title: 'Ara' };

export default function SearchPage() {
  return <Search />;
}
