import type { Metadata } from 'next';
import { Payment } from './Payment';

export const metadata: Metadata = { title: 'Ödeme', robots: { index: false, follow: false } };

export default function PaymentPage() {
  return <Payment />;
}
