import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import { BRAND } from '@/lib/config';
import './globals.css';
import './layout.css';
import { THEME_BOOT } from '@/lib/themeBoot';

export const metadata: Metadata = {
  title: { default: `${BRAND} — Kuaför randevusu`, template: `%s · ${BRAND}` },
  description: 'Yakınınızdaki kuaförleri bulun, boş saatleri görün ve randevunuzu hemen oluşturun.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0b1120', viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The theme script sets data-theme before React starts, hence suppressHydrationWarning.
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
