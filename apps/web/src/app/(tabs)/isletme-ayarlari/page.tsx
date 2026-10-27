import type { Metadata } from 'next';
import { ShopSettings } from './ShopSettings';

export const metadata: Metadata = { title: 'Salon bilgileri' };

export default function ShopSettingsPage() {
  return <ShopSettings />;
}
