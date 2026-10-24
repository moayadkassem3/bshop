import type { Metadata } from 'next';
import { ShopMap } from '@/components/ShopMap';

export const metadata: Metadata = { title: 'Haritada salon bul' };

export default function MapPage() {
  return (
    <div className="container">
      <h1 style={{ margin: '28px 0 6px', fontSize: 28, letterSpacing: '-0.02em' }}>Haritada salon bul</h1>
      <p className="muted" style={{ margin: '0 0 16px' }}>
        Online randevu alan salonlar haritada görünür.
      </p>
      <ShopMap />
    </div>
  );
}
