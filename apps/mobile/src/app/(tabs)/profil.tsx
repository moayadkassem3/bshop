import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { SignIn } from '@/components/SignIn';
import { Alert, Badge, Button, Card, Screen, Text } from '@/components/ui';
import { errorMessage, WEB_URL } from '@/lib/api';
import { formatPhone } from '@/lib/phone';
import { useSession } from '@/lib/session';
import { colors, radius } from '@/lib/theme';

/** Profil: sign-in when signed out; otherwise the account, the mode switch and sign-out. */
export default function ProfileScreen() {
  const { me } = useSession();
  return me ? <Account /> : <SignedOut />;
}

function SignedOut() {
  return (
    <Screen title="Salon Randevu" subtitle="Kuaförünü bul, randevunu hemen al.">
      <Card style={{ gap: 14 }}>
        <Text size={20} weight="bold">
          Giriş yap
        </Text>
        <SignIn />
      </Card>
    </Screen>
  );
}

function Account() {
  const { me, business, switchMode, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;
  const name = [me.first_name, me.last_name].filter(Boolean).join(' ') || 'Hesabım';

  async function toggleMode() {
    setBusy(true);
    setError(null);
    try {
      await switchMode(business ? 'customer' : 'business');
      router.replace(business ? '/' : '/salonum');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title={name}
      subtitle={formatPhone(me.phone)}
      header={
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
          <Badge label={business ? (me.portal === 'owner' ? 'İşletme · Sahibi' : 'İşletme · Personel') : 'Müşteri'} tone="info" />
          {me.verified ? <Badge label="Doğrulanmış" tone="success" /> : null}
        </View>
      }
    >
      <Text size={13} weight="bold" color={colors.muted} style={styles.section}>
        HESAP
      </Text>
      <Card style={{ padding: 0 }}>
        <MenuRow label="Yasal metinler" onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/sozlesmeler`).catch(() => undefined)} />
      </Card>

      {business || me.has_business ? (
        <Button kind="secondary" title={business ? 'Müşteri moduna geç' : 'İşletme moduna geç'} onPress={toggleMode} busy={busy} />
      ) : null}
      {error ? <Alert text={error} /> : null}

      <Button kind="dangerOutline" title="Çıkış yap" onPress={() => void signOut()} />
      {/* Quiet, as on the website (founder, v1.7): available as the stores require, not a main action. */}
      <Pressable onPress={() => router.push('/hesabi-sil')} style={{ alignSelf: 'center', padding: 8 }}>
        <Text size={13} color={colors.muted}>
          Hesabı sil
        </Text>
      </Pressable>
    </Screen>
  );
}

function MenuRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}>
      <Text size={16} weight="semibold" style={{ flex: 1 }}>
        {label}
      </Text>
      <Icon name="chevron" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { letterSpacing: 1, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 16, borderRadius: radius.md },
});
