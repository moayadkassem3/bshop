import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { BRAND } from '@/lib/config';
import './globals.css';
import './layout.css';

export const metadata: Metadata = {
  title: { default: `${BRAND} — Berber ve kuaför randevusu`, template: `%s · ${BRAND}` },
  description: 'Berberinizin ve kuaförünüzün boş saatlerini görün, randevunuzu uygulama indirmeden oluşturun.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f6f4f0' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <header className="site-header">
          <div className="container site-header-inner">
            <Logo />
            <nav className="site-nav">
              <Link href="/harita">Harita</Link>
              <Link href="/randevularim" className="nav-pill">
                Randevularım
              </Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="container site-footer-inner">
            <div>
              <Logo />
              <p className="muted">Ödeme salonda yapılır. Randevu almak ücretsizdir.</p>
            </div>
            <div className="footer-links">
              <Link href="/isletmeler#sahip">Salon Sahibi Girişi</Link>
              <Link href="/isletmeler#calisan">Çalışan Girişi</Link>
              <Link href="/isletmeler#basvuru">Salonunuzu ekleyin</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
