import * as Sharing from 'expo-sharing';
import QRCode from 'qrcode';
import { useMemo, useRef, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import Svg, { Ellipse, G, Path, Rect } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { BackLink } from '@/components/BackLink';
import { Appear } from '@/components/motion';
import { ShopPicker } from '@/components/ShopPicker';
import { Alert, Button, Screen, Text } from '@/components/ui';
import { WEB_URL } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import { colors, radius } from '@/lib/theme';

const BRAND = 'Salon Randevu';

/**
 * QR kod (as on the website): it opens the salon's page, tagged so scans show
 * up as "QR kod" in İstatistikler. The logo sits in the middle and "Salon adı |
 * Salon Randevu" below; the poster is shared as a picture (WhatsApp, print, save).
 */
export default function QrScreen() {
  const { shops, shop, selectShop, error } = useBusinessShops();
  const poster = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const link = shop ? `${WEB_URL}/${shop.slug}` : null;

  async function sharePoster() {
    if (!shop) return;
    setBusy(true);
    setProblem(null);
    try {
      const uri = await captureRef(poster, { format: 'png', quality: 1, width: 1200, fileName: `${shop.slug}-qr` });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `${shop.name} QR kod`, UTI: 'public.png' });
      else setProblem('Bu telefonda paylaşım açılamadı.');
    } catch {
      setProblem('QR kod resmi oluşturulamadı. Tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="QR kod"
      subtitle="Salonunuza asın: müşteriler okutunca salon sayfanız açılır ve randevu alır."
      back={<BackLink label="Salonum" />}
      header={<ShopPicker shops={shops} shop={shop} onSelect={selectShop} />}
    >
      {error || problem ? <Alert text={(error || problem)!} /> : null}
      {shop && link ? (
        <>
          <Appear>
            {/* The poster is captured exactly as drawn here. */}
            <View ref={poster} collapsable={false} style={styles.poster}>
              <QrCode text={`${link}?k=qr`} size={280} />
              <Text size={18} weight="heavy" center style={{ marginTop: 12 }} numberOfLines={2}>
                {shop.name} | {BRAND}
              </Text>
            </View>
          </Appear>
          <Text size={14} color={colors.muted} center>
            {link}
          </Text>
          <Appear index={1} style={{ gap: 10 }}>
            <Button title={busy ? 'Hazırlanıyor…' : 'QR kodu paylaş veya kaydet'} onPress={sharePoster} busy={busy} />
            <Button kind="secondary" title="Bağlantıyı paylaş" onPress={() => Share.share({ message: `${shop.name}: randevu almak için ${link}`, url: link }).catch(() => undefined)} />
          </Appear>
          <Text size={13} color={colors.muted} center>
            Paylaş menüsünden WhatsApp’a gönderebilir, Fotoğraflar’a kaydedebilir veya yazdırabilirsiniz.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}

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
      <Path d={path} fill={colors.ink} />
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

const styles = StyleSheet.create({
  poster: { alignSelf: 'center', alignItems: 'center', padding: 22, borderRadius: radius.md, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, width: 330 },
});
