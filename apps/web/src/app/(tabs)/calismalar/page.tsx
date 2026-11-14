import type { Metadata } from 'next';
import { MyWork } from './MyWork';

export const metadata: Metadata = { title: 'Çalışmalarımız' };

export default function MyWorkPage() {
  return <MyWork />;
}
