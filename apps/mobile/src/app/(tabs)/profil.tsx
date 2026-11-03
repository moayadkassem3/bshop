import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/components/Icon';
import { Appear } from '@/components/motion';
import { GenderChoice, SignIn } from '@/components/SignIn';
import { Alert, Badge, Button, Card, Field, Screen, Text, type Tone } from '@/components/ui';
import { api, ApiError, errorMessage, WEB_URL } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import { daysLeft } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import type { BusinessShop } from '@/lib/types';
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
  const { me, business, switchMode, signOut, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  if (!me) return null;
  const name = [me.first_name, me.last_name].filter(Boolean).join(' ') || 'Hesabım';
  const mode = business ? (me.portal === 'owner' ? 'İşletme sahibi' : 'Personel') : 'Müşteri';

  async function toggleMode() {
    setBusy(true);
    setError(null);
    try {
      await switchMode(business ? 'customer' : 'business');
      router.replace(business ? '/' : '/salonum');
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'NOT_BUSINESS' ? 'Bu numara henüz bir işletmeye kayıtlı değil.' : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title={name}
      subtitle={formatPhone(me.phone)}
      back={
        <View style={styles.avatar}>
          <Text size={26} weight="heavy" color={colors.white}>
            {(me.first_name ?? me.phone.slice(-2))[0]?.toLocaleUpperCase('tr-TR')}
          </Text>
        </View>
      }
      header={
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
          <Badge label={mode} tone="info" />
          {me.verified ? <Badge label="Doğrulanmış" tone="success" /> : null}
        </View>
      }
      onRefresh={refresh}
    >
      {business ? <MyBusinesses /> : null}

      {/* Favourites are a customer thing; in business mode the salons above take their place (as on the website). */}
      {!business ? (
        <Appear>
          <Section title="İşlemlerim" />
          <Card style={styles.menu}>
            <MenuRow icon="randevular" label="Randevu ve taleplerim" onPress={() => router.push('/randevular')} />
            <MenuRow icon="favoriler" label="Favorilerim" onPress={() => router.push('/favoriler')} last />
          </Card>
        </Appear>
      ) : null}

      <Appear index={1}>
        <Section title="Hesap" />
        <Card style={styles.menu}>
          <MenuRow
            icon="edit"
            label="Profili düzenle"
            open={editing}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setEditing((e) => !e);
            }}
          />
          {editing ? <EditProfile onDone={() => setEditing(false)} /> : null}
          {business && me.portal === 'owner' ? <MenuRow icon="card" label="Aboneliğim" onPress={() => router.push('/isletme/abonelik')} /> : null}
          <MenuRow icon="doc" label="Yasal metinler" onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/sozlesmeler`).catch(() => undefined)} last />
        </Card>
      </Appear>

      {business || me.has_business ? (
        <Pressable onPress={toggleMode} disabled={busy} style={({ pressed }) => [styles.switch, (pressed || busy) && { opacity: 0.7 }]}>
          <Icon name="swap" size={20} color={colors.primary} strokeWidth={2} />
          <Text weight="bold" color={colors.primary}>
            {busy ? 'Geçiliyor…' : business ? 'Müşteri moduna geç' : 'İşletme moduna geç'}
          </Text>
        </Pressable>
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

/** Ad, soyad and gender, as on the website's "Profili düzenle". */
function EditProfile({ onDone }: { onDone: () => void }) {
  const { me, refresh } = useSession();
  const [firstName, setFirstName] = useState(me?.first_name ?? '');
  const [lastName, setLastName] = useState(me?.last_name ?? '');
  const [gender, setGender] = useState<'male' | 'female' | null>(me?.gender ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api('/me', { method: 'PATCH', body: { firstName: firstName.trim(), lastName: lastName.trim(), gender } });
      await refresh();
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.form}>
      <Field label="Ad" value={firstName} onChangeText={setFirstName} autoCapitalize="words" textContentType="givenName" />
      <Field label="Soyad" value={lastName} onChangeText={setLastName} autoCapitalize="words" textContentType="familyName" />
      <GenderChoice value={gender} onChange={setGender} />
      {error ? <Alert text={error} /> : null}
      <Button title="Kaydet" onPress={() => void save()} busy={busy} disabled={!firstName.trim() || !lastName.trim()} />
    </View>
  );
}

function businessStatus(b: BusinessShop): { label: string; tone: Tone } {
  if (b.suspended_at) return { label: 'Yayından kaldırıldı', tone: 'danger' };
  if (b.subscription_status === 'trial' && b.current_period_end) {
    const days = daysLeft(b.current_period_end);
    return days ? { label: `Deneme · ${days} gün kaldı`, tone: 'info' } : { label: 'Deneme bitti', tone: 'danger' };
  }
  if (b.subscription_status === 'active') return { label: 'Aktif', tone: 'success' };
  if (b.subscription_status === 'past_due') return { label: 'Süresi doldu', tone: 'danger' };
  return { label: 'Pasif', tone: 'muted' };
}

/** İşletmelerim: the salons this person works at, with their role and state; a row opens Salonum on it. */
function MyBusinesses() {
  const { shops, selectShop } = useBusinessShops();
  if (!shops || shops.length === 0) return null;
  return (
    <Appear>
      <Section title="İşletmelerim" />
      <Card style={styles.menu}>
        {shops.map((b, i) => {
          const st = businessStatus(b);
          const role = b.role === 'staff' ? 'Personel' : b.owner_label === 'co_owner' ? 'Ortak' : 'Sahibi';
          return (
            <Pressable
              key={b.id}
              onPress={() => {
                selectShop(b.id);
                router.push('/salonum');
              }}
              style={({ pressed }) => [styles.row, i < shops.length - 1 && styles.rowLine, pressed && { backgroundColor: colors.surface2 }]}
            >
              <View style={styles.rowIcon}>
                <Icon name="salonum" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text weight="bold" numberOfLines={1}>
                  {b.name}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Text size={13} color={colors.muted}>
                    {role}
                  </Text>
                  <Badge label={st.label} tone={st.tone} />
                </View>
              </View>
              <Icon name="chevron" size={18} color={colors.muted} />
            </Pressable>
          );
        })}
      </Card>
    </Appear>
  );
}

function Section({ title }: { title: string }) {
  return (
    <Text size={13} weight="bold" color={colors.muted} style={styles.section}>
      {title.toLocaleUpperCase('tr-TR')}
    </Text>
  );
}

function MenuRow({ icon, label, onPress, last, open }: { icon: IconName; label: string; onPress: () => void; last?: boolean; open?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.rowLine, pressed && { backgroundColor: colors.surface2 }]}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={20} color={colors.primary} />
      </View>
      <Text size={16} weight="semibold" style={{ flex: 1 }}>
        {label}
      </Text>
      <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
        <Icon name="chevron" size={18} color={colors.muted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  section: { letterSpacing: 1, marginTop: 4, marginBottom: 8 },
  menu: { padding: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  form: { gap: 12, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  switch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
});
