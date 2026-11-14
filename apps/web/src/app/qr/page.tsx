import type { Metadata } from 'next';
import { QrPoster } from './QrPoster';

export const metadata: Metadata = { title: 'QR kod' };

export default function QrPage() {
  return <QrPoster />;
}
