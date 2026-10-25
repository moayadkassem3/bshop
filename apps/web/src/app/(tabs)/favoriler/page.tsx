import type { Metadata } from 'next';
import { MyShops } from '@/components/MyShops';

export const metadata: Metadata = { title: 'Favoriler' };

export default function FavoritesPage() {
  return (
    <>
      <header className="page-header">
        <div className="container narrow">
          <h1>Favoriler</h1>
          <p>Kuaförünüz bir dokunuş uzağınızda.</p>
        </div>
      </header>
      <div className="container narrow">
        <MyShops />
      </div>
    </>
  );
}
