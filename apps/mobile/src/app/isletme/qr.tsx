import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { BackLink } from '@/components/BackLink';
import { Appear } from '@/components/motion';
import { QrCode } from '@/components/QrCode';
import { ShopPicker } from '@/components/ShopPicker';
import { StoryShare } from '@/components/StoryShare';
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
          <Appear index={2}>
            <StoryShare shop={shop} link={link} brand={BRAND} />
          </Appear>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  poster: { alignSelf: 'center', alignItems: 'center', padding: 22, borderRadius: radius.md, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, width: 330 },
});
