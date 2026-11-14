import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { Text as RNText, StyleSheet, View, type TextStyle } from 'react-native';
import { LogoMark } from './LogoMark';
import { captureRef } from 'react-native-view-shot';
import { QrCode } from './QrCode';
import { colors, fonts, radius, themed } from '@/lib/theme';
import { Alert, Button, Card, Text } from './ui';

/** The story is drawn at 360 × 640 and saved at 1080 × 1920, Instagram's and WhatsApp's story size. */
const W = 360;
const H = 640;
const PREVIEW = 0.62;
const C = { bg: '#0b1120', panel: '#172033', line: 'rgba(255,255,255,0.09)', accent: '#8daeff', blue: '#2b5cf0', muted: '#9aa0a9' };

/** The words on the story, as on the website (lib/story.ts). */
const STEPS = ['Okut', 'Saatini seç', 'Gel'];

/**
 * "Hikâye olarak paylaş" (as on the website): a ready story with the salon's QR
 * code, its name, its link and the three steps. Sharing copies the link first,
 * for Instagram's "Bağlantı" sticker.
 */
export function StoryShare({ shop, link, brand }: { shop: { name: string; slug: string }; link: string; brand: string }) {
  const story = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const label = `${shop.name} | ${brand}`;

  async function share() {
    setBusy(true);
    setNote(null);
    try {
      const uri = await captureRef(story, { format: 'png', quality: 1, width: 1080, height: 1920, fileName: `${shop.slug}-hikaye` });
      const copied = await Clipboard.setStringAsync(link).catch(() => false);
      if (!(await Sharing.isAvailableAsync())) throw new Error('share');
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Hikâye olarak paylaş', UTI: 'public.png' });
      if (copied) setNote({ ok: true, text: 'Bağlantı kopyalandı: Instagram hikâyesinde “Bağlantı” çıkartmasına yapıştırabilirsiniz.' });
    } catch {
      setNote({ ok: false, text: 'Hikâye görseli hazırlanamadı. Tekrar deneyin.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 12 }}>
      <Text size={18} weight="heavy">
        Hikâye olarak paylaş
      </Text>
      <Text size={14} color={colors.ink2}>
        Instagram veya WhatsApp hikâyenize hazır görsel: QR kodunuz, salon adınız ve bağlantınızla.
      </Text>
      {/* The preview is the story itself, shown smaller; it is captured at full size. */}
      <View style={styles.previewBox}>
        <View style={styles.previewInner}>
          <View ref={story} collapsable={false} style={styles.story}>
            <View style={[styles.ring, { width: 334, height: 334, top: -144, right: -174 }]} />
            <View style={[styles.ring, { width: 240, height: 240, bottom: -100, left: -127 }]} />

            <View style={styles.topPill}>
              <View style={styles.logo}>
                <LogoMark size={10} color="#fff" />
              </View>
              <S style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 11, flexShrink: 1 }} lines={1}>
                {label}
              </S>
            </View>

            <S style={styles.title}>Randevunu</S>
            <S style={styles.title}>
              <S style={{ color: C.accent }}>saniyeler</S> içinde al.
            </S>
            <S style={styles.lead}>Sıra beklemek yok. Kodu okut, saatini seç, gel.</S>

            <View style={styles.glow} />
            <View style={styles.card}>
              <QrCode text={`${link}?k=qr`} size={193} />
              <S style={styles.caption} lines={2}>
                {label}
              </S>
            </View>

            <S style={styles.link} lines={1}>
              {link.replace(/^https?:\/\//, '')}
            </S>
            <View style={styles.steps}>
              {STEPS.map((step, i) => (
                <View key={step} style={styles.step}>
                  <View style={styles.stepNo}>
                    <S style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 9 }}>{String(i + 1)}</S>
                  </View>
                  <S style={{ color: '#fff', fontFamily: fonts.semibold, fontSize: 11 }}>{step}</S>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>
      <Button title={busy ? 'Hazırlanıyor…' : 'Hikâye olarak paylaş'} onPress={share} busy={busy} />
      {note ? <Alert tone={note.ok ? 'success' : 'danger'} text={note.text} /> : null}
    </Card>
  );
}

/** Text that keeps its size whatever the phone's font setting, so the story always looks the same. */
function S({ children, style, lines }: { children: React.ReactNode; style?: TextStyle | TextStyle[]; lines?: number }) {
  return (
    <RNText allowFontScaling={false} numberOfLines={lines} style={style}>
      {children}
    </RNText>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    previewBox: { alignSelf: 'center', width: W * PREVIEW, height: H * PREVIEW, borderRadius: radius.md, overflow: 'hidden', backgroundColor: C.bg },
    previewInner: { position: 'absolute', left: (W * PREVIEW - W) / 2, top: (H * PREVIEW - H) / 2, width: W, height: H, transform: [{ scale: PREVIEW }] },
    story: { width: W, height: H, backgroundColor: C.bg, alignItems: 'center', overflow: 'hidden' },
    ring: { position: 'absolute', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    topPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: 290,
      marginTop: 39,
      marginBottom: 34,
      paddingLeft: 8,
      paddingRight: 11,
      height: 26,
      borderRadius: 13,
      backgroundColor: C.panel,
      borderWidth: 1,
      borderColor: C.line,
    },
    logo: { width: 17, height: 17, borderRadius: 9, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
    title: { color: '#fff', fontFamily: fonts.heavy, fontSize: 40, lineHeight: 44, letterSpacing: -1.3, textAlign: 'center' },
    lead: { color: C.muted, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17, textAlign: 'center', marginTop: 14, paddingHorizontal: 40 },
    glow: { position: 'absolute', top: 222, width: 250, height: 250, borderRadius: 125, backgroundColor: 'rgba(43,92,240,0.28)', transform: [{ scaleY: 1.1 }] },
    card: { marginTop: 22, width: 220, paddingTop: 12, paddingBottom: 14, alignItems: 'center', borderRadius: 19, backgroundColor: '#fff' },
    caption: { color: colors.ink, fontFamily: fonts.heavy, fontSize: 14.5, letterSpacing: -0.3, textAlign: 'center', paddingHorizontal: 14, marginTop: 6 },
    link: { color: C.muted, fontFamily: fonts.medium, fontSize: 10.5, marginTop: 16, paddingHorizontal: 20 },
    steps: { flexDirection: 'row', gap: 7, marginTop: 14 },
    step: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 29, paddingLeft: 6, paddingRight: 10, borderRadius: 15, backgroundColor: C.panel },
    stepNo: { width: 17, height: 17, borderRadius: 9, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
  }),
);
