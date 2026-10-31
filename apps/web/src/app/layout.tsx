import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import { BRAND } from '@/lib/config';
import './globals.css';
import './layout.css';

export const metadata: Metadata = {
  title: { default: `${BRAND} — Kuaför randevusu`, template: `%s · ${BRAND}` },
  description: 'Yakınınızdaki kuaförleri bulun, boş saatleri görün ve randevunuzu hemen oluşturun.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0e1013', viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
