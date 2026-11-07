/**
 * The scissors mark from the brand logo as SVG markup, for places that build
 * HTML themselves (map pins). It takes the surrounding text colour.
 */
export function logoGlyphSvg(height: number): string {
  const width = Math.round((height * 156) / 220);
  return `<svg viewBox="0 0 156 220" width="${width}" height="${height}" fill="currentColor" aria-hidden="true">
  <path d="M28 2C18 36 49 94 75 130L89 120C67 84 42 30 28 2Z"/>
  <path d="M128 2C138 36 107 94 81 130L67 120C89 84 114 30 128 2Z"/>
  <ellipse cx="78" cy="127" rx="15" ry="13"/>
  <path d="M72 132 58 152M84 132l14 20" stroke="currentColor" stroke-width="12" stroke-linecap="round"/>
  <g fill="none" stroke="currentColor" stroke-width="14">
    <ellipse cx="35" cy="181" rx="30" ry="24" transform="rotate(-33 35 181)"/>
    <ellipse cx="121" cy="181" rx="30" ry="24" transform="rotate(33 121 181)"/>
  </g>
</svg>`;
}
