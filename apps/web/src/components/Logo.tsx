import { BRAND } from '@/lib/config';

/** The scissors mark from the brand logo (v1.6); it takes the surrounding text colour. */
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 156 220" width={(size * 156) / 220} height={size} fill="currentColor" aria-hidden>
      <path d="M28 2C18 36 49 94 75 130L89 120C67 84 42 30 28 2Z" />
      <path d="M128 2C138 36 107 94 81 130L67 120C89 84 114 30 128 2Z" />
      <ellipse cx="78" cy="127" rx="15" ry="13" />
      <path d="M72 132 58 152M84 132l14 20" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
      <g fill="none" stroke="currentColor" strokeWidth="14">
        <ellipse cx="35" cy="181" rx="30" ry="24" transform="rotate(-33 35 181)" />
        <ellipse cx="121" cy="181" rx="30" ry="24" transform="rotate(33 121 181)" />
      </g>
    </svg>
  );
}

/** The brand name with its last word in the light accent, as in the mockups. */
export function BrandName() {
  const cut = BRAND.lastIndexOf(' ');
  if (cut < 0) return <>{BRAND}</>;
  return (
    <>
      {BRAND.slice(0, cut)} <span className="brand-accent">{BRAND.slice(cut + 1)}</span>
    </>
  );
}
