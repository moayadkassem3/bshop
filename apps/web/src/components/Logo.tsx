import Link from 'next/link';
import { BRAND } from '@/lib/config';

export function Logo() {
  return (
    <Link href="/" className="logo" aria-label={`${BRAND} ana sayfa`}>
      <span className="logo-mark" aria-hidden>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" />
        </svg>
      </span>
      <span className="logo-text">{BRAND}</span>
    </Link>
  );
}
