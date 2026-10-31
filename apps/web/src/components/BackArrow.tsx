/**
 * The arrow in "← Profil"-style back links (v1.7): drawn, so it sits on the text's
 * centre line and has the same weight as the label at any size.
 */
export function BackArrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1.05em"
      height="1.05em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: 'inline-block', verticalAlign: '-0.17em', marginRight: '0.3em', flexShrink: 0 }}
    >
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}
