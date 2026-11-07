import type { Metadata } from 'next';
import { QuoteForm } from './QuoteForm';

export const metadata: Metadata = { title: 'Teklif al' };

export default function QuotePage() {
  return <QuoteForm />;
}
