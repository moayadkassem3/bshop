import QRCode from 'qrcode';

/** The scissors mark from the logo, as SVG markup (viewBox 0 0 156 220). */
const GLYPH = `
  <path d="M28 2C18 36 49 94 75 130L89 120C67 84 42 30 28 2Z"/>
  <path d="M128 2C138 36 107 94 81 130L67 120C89 84 114 30 128 2Z"/>
  <ellipse cx="78" cy="127" rx="15" ry="13"/>
  <path d="M72 132 58 152M84 132l14 20" stroke="#fff" stroke-width="12" stroke-linecap="round"/>
  <g fill="none" stroke="#fff" stroke-width="14">
    <ellipse cx="35" cy="181" rx="30" ry="24" transform="rotate(-33 35 181)"/>
    <ellipse cx="121" cy="181" rx="30" ry="24" transform="rotate(33 121 181)"/>
  </g>`;

/**
 * A QR code for the link as SVG, with the app logo in the middle. The highest
 * error correction (H, 30%) keeps it readable with the centre covered.
 */
export function qrSvg(text: string, size = 1000): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
  const n = qr.modules.size;
  const quiet = 4;
  const cell = size / (n + quiet * 2);
  let modules = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) {
        modules += `M${((c + quiet) * cell).toFixed(2)} ${((r + quiet) * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`;
      }
    }
  }
  // Logo tile: about a fifth of the code, on a white margin so no module touches it.
  const tile = size * 0.2;
  const pad = cell * 1.2;
  const x = (size - tile) / 2;
  const glyphH = tile * 0.66;
  const glyphW = (glyphH * 156) / 220;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="#fff"/>
  <path d="${modules}" fill="#0e1013"/>
  <rect x="${x - pad}" y="${x - pad}" width="${tile + pad * 2}" height="${tile + pad * 2}" rx="${tile * 0.28}" fill="#fff"/>
  <rect x="${x}" y="${x}" width="${tile}" height="${tile}" rx="${tile * 0.24}" fill="#000"/>
  <g fill="#fff" transform="translate(${(size - glyphW) / 2} ${(size - glyphH) / 2}) scale(${glyphH / 220})">${GLYPH}</g>
</svg>`;
}
