import type { Metadata } from 'next';
import { ShopRatings } from './ShopRatings';

export const metadata: Metadata = { title: 'Değerlendirmeler' };

export default function ShopRatingsPage() {
  return <ShopRatings />;
}
