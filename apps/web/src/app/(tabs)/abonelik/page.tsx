import type { Metadata } from 'next';
import { MySubscription } from './MySubscription';

export const metadata: Metadata = { title: 'Aboneliğim', robots: { index: false, follow: false } };

export default function MySubscriptionPage() {
  return <MySubscription />;
}
