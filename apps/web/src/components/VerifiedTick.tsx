/**
 * Verified tick (v1.7): a salon after 3 completed bookings made through the app,
 * a customer after 3 completed visits. Sits right after a name.
 */
export function VerifiedTick({ kind, size = 16 }: { kind: 'salon' | 'customer'; size?: number }) {
  const label = kind === 'salon' ? 'Doğrulanmış salon' : 'Doğrulanmış müşteri';
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      style={{ display: 'inline-block', flexShrink: 0, verticalAlign: '-0.15em', marginLeft: '0.3em' }}
    >
      <title>{label}</title>
      {/* A rosette rather than a plain circle, so it reads as a badge next to text. */}
      <path
        fill="var(--primary)"
        d="M12 1.5l2.3 1.7 2.8-.4 1.1 2.6 2.6 1.1-.4 2.8 1.7 2.3-1.7 2.3.4 2.8-2.6 1.1-1.1 2.6-2.8-.4L12 22.5l-2.3-1.7-2.8.4-1.1-2.6-2.6-1.1.4-2.8L1.9 12l1.7-2.3-.4-2.8 2.6-1.1 1.1-2.6 2.8.4z"
      />
      <path d="m7.8 12.2 2.8 2.8 5.6-5.8" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
