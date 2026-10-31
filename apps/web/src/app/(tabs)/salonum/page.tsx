import type { Metadata } from 'next';
import { Salonum } from './Salonum';

export const metadata: Metadata = { title: 'Salonum' };

export default function SalonumPage() {
  return <Salonum />;
}
