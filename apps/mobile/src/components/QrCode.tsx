import QRCode from 'qrcode';
import { useMemo } from 'react';
import Svg, { Ellipse, G, Path, Rect } from 'react-native-svg';

/** A QR code with the app's scissors on a black tile in the middle (high error correction keeps it readable). */
export function QrCode({ text, size }: { text: string; size: number }) {
  const { path, n } = useMemo(() => {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
    const count = qr.modules.size;
    let d = '';
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.modules.get(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { path: d, n: count + 8 };
  }, [text]);
  const tile = n * 0.2;
  const pad = 1.2;
  const x = (n - tile) / 2;
  const glyphH = tile * 0.66;
  const glyphW = (glyphH * 156) / 220;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`}>
      <Rect width={n} height={n} fill="#fff" />
      <Path d={path} fill="#0b1120" />
      <Rect x={x - pad} y={x - pad} width={tile + pad * 2} height={tile + pad * 2} rx={tile * 0.28} fill="#fff" />
      <Rect x={x} y={x} width={tile} height={tile} rx={tile * 0.24} fill="#000" />
      <G transform={`translate(${(n - glyphW) / 2} ${(n - glyphH) / 2}) scale(${glyphH / 220})`} fill="#fff">
        <Path d="M28 2C18 36 49 94 75 130L89 120C67 84 42 30 28 2Z" />
        <Path d="M128 2C138 36 107 94 81 130L67 120C89 84 114 30 128 2Z" />
        <Ellipse cx={78} cy={127} rx={15} ry={13} />
        <Path d="M72 132 58 152M84 132l14 20" stroke="#fff" strokeWidth={12} strokeLinecap="round" />
        <G fill="none" stroke="#fff" strokeWidth={14}>
          <Ellipse cx={35} cy={181} rx={30} ry={24} transform="rotate(-33 35 181)" />
          <Ellipse cx={121} cy={181} rx={30} ry={24} transform="rotate(33 121 181)" />
        </G>
      </G>
    </Svg>
  );
}
