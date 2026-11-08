import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppearanceSwitch } from '@/components/AppearanceSwitch';
import { useKeyboardRoom } from '@/lib/keyboard';
import { StaffPhotoPicker } from '@/components/StaffAvatar';
import { Icon, type IconName } from '@/components/Icon';
import { Appear, PopIn } from '@/components/motion';
import { GenderChoice, SignIn } from '@/components/SignIn';
import { Alert, Badge, Button, Card, Field, Screen, Text, type Tone } from '@/components/ui';
import { api, ApiError, errorMessage, WEB_URL } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import { daysLeft } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import type { BusinessShop } from '@/lib/types';
import { testPush } from '@/lib/push';
import { useSession } from '@/lib/session';
import { colors, radius, themed } from '@/lib/theme';

/** Profil: sign-in when signed out; otherwise the account, the mode switch and sign-out. */
export default function ProfileScreen() {
  const { me } = useSession();
  return me ? <Account /> : <SignedOut />;
}

function SignedOut() {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const keyboard = useKeyboardRoom(scroll);
  return (
    <View style={{ flex: 1, backgroundColor: colors.night }}>
      <StatusBar style="light" />
      <ScrollView ref={scroll} onScroll={keyboard.onScroll} scrollEventThrottle={16} contentContainerStyle={{ flexGrow: 1, paddingBottom: keyboard.room }} keyboardShouldPersistTaps="handled">
        <View style={[styles.hero, { paddingTop: insets.top + 36 }]}>
          <PopIn>
            <Image source={require('../../../assets/icon.png')} style={styles.mark} contentFit="cover" accessibilityIgnoresInvertColors />
          </PopIn>
          <Text size={32} weight="heavy" color={colors.white} style={{ letterSpacing: -0.6 }}>
            Salon Randevu
          </Text>
          <Text size={16} color={colors.darkMuted}>
            Kuaförünü bul, randevunu hemen al.
          </Text>
        </View>
        <Appear style={styles.sheet}>
          <Text size={22} weight="heavy">
            Giriş yap
          </Text>
          <SignIn />
          <Pressable onPress={() => router.push('/isletme-kaydi')} style={({ pressed }) => [styles.businessLink, pressed && { opacity: 0.8 }]}>
            <Text weight="heavy" color={colors.primary}>
              İşletmeyim
            </Text>
            <Text color={colors.ink2} style={{ flex: 1 }}>
              Salonumu kaydetmek istiyorum
            </Text>
            <Icon name="chevron" size={18} color={colors.primary} />
          </Pressable>
          <View style={{ gap: 10, marginTop: 8 }}>
            <Text size={13} weight="bold" color={colors.muted} style={{ letterSpacing: 1 }}>
              GÖRÜNÜM
            </Text>
            <AppearanceSwitch />
          </View>
        </Appear>
      </ScrollView>
    </View>
  );
}

function Account() {
  const { me, business, switchMode, signOut, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // Re-read on every visit: business mode appears as soon as the number joins a salon's team.
  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => undefined);
    }, [refresh]),
  );
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
              setEditing((e) => !e);
            }}
          />
          {editing ? (
            <Appear>
              <EditProfile business={business} onDone={() => setEditing(false)} />
            </Appear>
          ) : null}
          {/* Salon owners manage their salon from İşletmelerim instead (as on the website). */}
          {!me.owns_shop ? <MenuRow icon="salonum" label="İşletmenizi kaydedin" onPress={() => router.push('/isletme-kaydi')} /> : null}
          {business && me.portal === 'owner' ? <MenuRow icon="card" label="Aboneliğim" onPress={() => router.push('/isletme/abonelik')} /> : null}
          <PushTestRow />
          <MenuRow icon="doc" label="Yasal metinler" onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/sozlesmeler`).catch(() => undefined)} last />
        </Card>
      </Appear>

      <Appear index={2}>
        <Section title="Görünüm" />
        <Card>
          <AppearanceSwitch />
        </Card>
        <Section title="Bildirimler" />
        <Card>
          <AnnouncementsSwitch />
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
function EditProfile({ business, onDone }: { business: boolean; onDone: () => void }) {
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
      {business ? <MyStaffPhoto /> : null}
      <Field label="Ad" value={firstName} onChangeText={setFirstName} autoCapitalize="words" textContentType="givenName" />
      <Field label="Soyad" value={lastName} onChangeText={setLastName} autoCapitalize="words" textContentType="familyName" />
      <GenderChoice value={gender} onChange={setGender} />
      {error ? <Alert text={error} /> : null}
      <Button title="Kaydet" onPress={() => void save()} busy={busy} disabled={!firstName.trim() || !lastName.trim()} />
    </View>
  );
}

/**
 * Profili düzenle → the staff photo (founder, 8 November 2026): business mode only, one photo
 * for every salon the person works at. Saved straight away, apart from the name's Kaydet.
 */
function MyStaffPhoto() {
  const { shops } = useBusinessShops();
  // Set here after an upload; until then the photo the server gave.
  const [photo, setPhoto] = useState<{ id: string | null } | null>(null);
  if (!shops?.length) return null;
  return (
    <View style={{ gap: 8, paddingBottom: 4 }}>
      <StaffPhotoPicker
        name={shops[0]!.display_name ?? shops[0]!.name}
        photoId={photo ? photo.id : (shops[0]!.photo_id ?? null)}
        targets={shops.map((b) => ({ shopId: b.id, memberId: b.member_id }))}
        onChange={(id) => setPhoto({ id })}
      />
      <Text size={13} color={colors.muted}>
        Müşteriler salonunuzun sayfasında ve randevu alırken sizi bu fotoğrafla görür.
      </Text>
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

/**
 * Profil → Bildirimler (founder, 8 November 2026): announcements from our team (Yönetim →
 * Bildirimler) can be turned off; appointment notifications always come.
 */
function AnnouncementsSwitch() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ on: boolean }>('/me/announcements')
      .then((r) => setOn(r.on))
      .catch(() => setOn(true));
  }, []);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text weight="semibold" style={{ flex: 1 }}>
          Duyurular ve hatırlatmalar
        </Text>
        <Switch
          value={on ?? true}
          disabled={on === null}
          onValueChange={(next) => {
            setOn(next);
            api('/me/announcements', { method: 'PUT', body: { on: next } }).catch(() => setOn(!next));
          }}
          trackColor={{ true: colors.primary, false: colors.line }}
          thumbColor={colors.white}
        />
      </View>
      <Text size={13} color={colors.muted}>
        Ekibimizden ara sıra gelen haberler. Randevu bildirimleriniz her zaman gelir.
      </Text>
    </View>
  );
}

function Section({ title }: { title: string }) {
  return (
    <Text size={13} weight="bold" color={colors.muted} style={styles.section}>
      {title.toLocaleUpperCase('tr-TR')}
    </Text>
  );
}

/** Bildirimleri test et (phase 3): a test alarm to this phone, or what stops it. */
function PushTestRow() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  if (Platform.OS !== 'android') return null;
  return (
    <>
      <MenuRow
        icon="clock"
        label={busy ? 'Test ediliyor…' : 'Bildirimleri test et'}
        onPress={async () => {
          if (busy) return;
          setBusy(true);
          setResult(null);
          setResult(await testPush());
          setBusy(false);
        }}
      />
      {result ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <Alert text={result.message} tone={result.ok ? 'success' : 'danger'} />
        </View>
      ) : null}
    </>
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

const styles = themed(() =>
  StyleSheet.create({
    hero: { alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingBottom: 36 },
    mark: { width: 84, height: 84, borderRadius: 24, marginBottom: 12, borderWidth: 1.5, borderColor: colors.dark2 },
    sheet: { flexGrow: 1, gap: 16, padding: 20, paddingBottom: 32, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.bg },
    businessLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 16,
      marginTop: 4,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.line,
      backgroundColor: colors.surface,
    },
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
  }),
);
