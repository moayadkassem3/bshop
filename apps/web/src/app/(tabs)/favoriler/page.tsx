import type { Metadata } from 'next';
import { PopularStrip } from '@/components/haircuts/PopularStrip';
import { MyShops } from '@/components/MyShops';
import styles from './favorites.module.css';

export const metadata: Metadata = { title: 'Favoriler' };

export default function FavoritesPage() {
  return (
    <div className={styles.page}>
      <header className="page-header">
        <div className="container narrow">
          <h1>Favoriler</h1>
          <p>Kuaförünüz bir dokunuş uzağınızda.</p>
        </div>
      </header>
      <div className={`container narrow ${styles.body}`}>
        <MyShops />
        <div className={styles.bottom}>
          <PopularStrip />
        </div>
      </div>
    </div>
  );
}
