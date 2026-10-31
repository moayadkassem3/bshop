import { BRAND } from './config';
import { logoGlyphSvg } from './logo';
import { qrSvg } from './qr';

/** Instagram / WhatsApp story size. */
const W = 1080;
const H = 1920;
const FONT = '"Inter Variable", system-ui, sans-serif';
const C = { bg: '#0e1013', panel: '#1c2027', line: 'rgba(255,255,255,0.09)', white: '#ffffff', accent: '#8daeff', blue: '#2b5cf0', muted: '#9aa0a9', ink: '#0e1013' };

/** The words on the story (v1.7); the salon's name, code and link are filled in. */
export const STORY_TEXT = {
  title: ['Randevunu', 'saniyeler', ' içinde al.'] as const,
  lead: 'Sıra beklemek yok. Kodu okut, saatini seç, gel.',
  steps: ['Okut', 'Saatini seç', 'Gel'],
};

function image(svg: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return img.decode().then(() => img);
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Largest size up to `size` at which `text` fits in `max` pixels. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, max: number, min = 20): number {
  for (; size > min; size -= 2) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= max) break;
  }
  return size;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  return line ? [...lines, line] : lines;
}

/**
 * "Hikâye olarak paylaş" (v1.7): a 1080×1920 story with the salon's QR code,
 * its name, its link and the three steps, drawn on the phone (no server work).
 */
export async function storyPng(input: { qrLink: string; shownLink: string; shopName: string }): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  await Promise.all([500, 600, 700, 800, 900].map((w) => document.fonts.load(`${w} 40px "Inter Variable"`).catch(() => undefined)));
  const label = `${input.shopName} | ${BRAND}`;

  // Background with two faint rings.
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(W + 20, 70, 500, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-20, H - 60, 360, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textBaseline = 'alphabetic';

  // Top pill: logo + "Salon | Brand".
  const pillSize = fit(ctx, label, 700, 32, 760);
  ctx.font = `700 ${pillSize}px ${FONT}`;
  const pillW = 24 + 50 + 16 + ctx.measureText(label).width + 30;
  const pillX = (W - pillW) / 2;
  pill(ctx, pillX, 118, pillW, 78, 39);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.stroke();
  ctx.fillStyle = C.blue;
  ctx.beginPath();
  ctx.arc(pillX + 24 + 25, 157, 25, 0, Math.PI * 2);
  ctx.fill();
  // As an image the SVG needs its namespace; inline in HTML (map pins) it does not.
  const glyph = await image(logoGlyphSvg(30).replaceAll('currentColor', '#ffffff').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
  ctx.drawImage(glyph, pillX + 49 - 10.5, 142, 21, 30);
  ctx.fillStyle = C.white;
  ctx.textAlign = 'left';
  ctx.fillText(label, pillX + 24 + 50 + 16, 157 + pillSize * 0.36);

  // Headline: "Randevunu / saniyeler içinde al."
  const [first, accent, rest] = STORY_TEXT.title;
  let size = 132;
  const width = () => {
    ctx.font = `800 ${size}px ${FONT}`;
    return ctx.measureText(accent + rest).width;
  };
  ctx.letterSpacing = '-4px';
  while (width() > 960 && size > 70) size -= 4;
  ctx.textAlign = 'center';
  ctx.fillStyle = C.white;
  ctx.fillText(first, W / 2, 360);
  const total = width();
  const left = (W - total) / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = C.accent;
  ctx.fillText(accent, left, 360 + size * 0.95);
  ctx.fillStyle = C.white;
  ctx.fillText(rest, left + ctx.measureText(accent).width, 360 + size * 0.95);
  ctx.letterSpacing = '0px';

  // Lead.
  ctx.font = `500 38px ${FONT}`;
  ctx.fillStyle = C.muted;
  ctx.textAlign = 'center';
  const leadTop = 360 + size * 0.95 + 90;
  wrap(ctx, STORY_TEXT.lead, 860).forEach((l, i) => ctx.fillText(l, W / 2, leadTop + i * 52));

  // The card: QR code and the salon's name, with a blue glow behind it.
  const cardW = 660;
  const cardX = (W - cardW) / 2;
  const cardY = 690;
  const cardH = 720;
  ctx.save();
  ctx.shadowColor = 'rgba(43, 92, 240, 0.45)';
  ctx.shadowBlur = 140;
  pill(ctx, cardX, cardY, cardW, cardH, 56);
  ctx.fillStyle = C.white;
  ctx.fill();
  ctx.restore();
  const code = await image(qrSvg(input.qrLink));
  ctx.drawImage(code, cardX + 40, cardY + 30, cardW - 80, cardW - 80);
  const capSize = fit(ctx, label, 800, 46, cardW - 90);
  ctx.font = `800 ${capSize}px ${FONT}`;
  ctx.letterSpacing = '-1px';
  ctx.fillStyle = C.ink;
  ctx.fillText(label, W / 2, cardY + cardH - 58);
  ctx.letterSpacing = '0px';

  // The link, without "https://".
  const linkSize = fit(ctx, input.shownLink, 500, 32, 960);
  ctx.font = `500 ${linkSize}px ${FONT}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(input.shownLink, W / 2, cardY + cardH + 82);

  // Steps: ① Okut ② Saatini seç ③ Gel
  ctx.font = `600 34px ${FONT}`;
  const widths = STORY_TEXT.steps.map((s) => 20 + 50 + 16 + ctx.measureText(s).width + 28);
  const gap = 20;
  let x = (W - widths.reduce((a, b) => a + b, 0) - gap * (widths.length - 1)) / 2;
  const y = cardY + cardH + 136;
  STORY_TEXT.steps.forEach((step, i) => {
    pill(ctx, x, y, widths[i]!, 86, 43);
    ctx.fillStyle = C.panel;
    ctx.fill();
    ctx.fillStyle = C.blue;
    ctx.beginPath();
    ctx.arc(x + 20 + 25, y + 43, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.white;
    ctx.textAlign = 'center';
    ctx.font = `700 28px ${FONT}`;
    ctx.fillText(String(i + 1), x + 45, y + 53);
    ctx.textAlign = 'left';
    ctx.font = `600 34px ${FONT}`;
    ctx.fillText(step, x + 20 + 50 + 16, y + 55);
    x += widths[i]! + gap;
  });

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG oluşturulamadı'))), 'image/png'));
}
