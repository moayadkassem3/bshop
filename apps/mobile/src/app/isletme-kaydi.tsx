import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { MapPickerModal, MapPreview, type MapFocus, type Point } from '@/components/MapPicker';
import { PhotoManager } from '@/components/PhotoManager';
import { Appear, PopIn, SlideIn } from '@/components/motion';
import { SelectField } from '@/components/SelectField';
import { SignIn } from '@/components/SignIn';
import { Alert, Button, Card, Field, Text } from '@/components/ui';
import { api, ApiError, errorMessage, WEB_URL } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import { formatPhone, formatPhoneInput, phoneComplete, phoneDigits } from '@/lib/phone';
import { districtsOf, provinceCentre, PROVINCES } from '@/lib/provinces';
import { useSession } from '@/lib/session';
import { colors, fonts, radius } from '@/lib/theme';
import { AUDIENCE, type Me } from '@/lib/types';

/**
 * İşletmenizi kaydedin (as the website's RegisterWizard, v1.6–1.7): salon type,
 * details, address and map pin, hours, services and prices, staff, then the
 * agreements; photos once the salon exists. The app shows the plan's name only,
 * never its price (store rules, CLAUDE.md).
 */

type Audience = 'men' | 'women' | 'unisex';
type Day = { open: boolean; start: string; end: string };
type CatalogItem = { id: number; name: string; duration_minutes: number };
type Picked = { price: string; from: boolean };
type Custom = { name: string; duration: string; price: string; from: boolean };
type Member = { displayName: string; phone: string; role: 'staff' | 'co_owner'; bookable: boolean };
type Plans = { plans: { id: string; name: string; maxStaff: number }[]; features: string[]; terms: { trialDays: number; customQuoteAboveStaff: number } };

type Draft = {
  audience: Audience | null;
  name: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  about: string;
  city: string;
  district: string;
  address: string;
  point: Point | null;
  days: Day[];
  picked: Record<number, Picked>;
  custom: Custom[];
  ownerName: string;
  ownerBookable: boolean;
  members: Member[];
};

const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const EMPTY: Draft = {
  audience: null,
  name: '',
  phone: '',
  whatsapp: '',
  instagram: '',
  about: '',
  city: '',
  district: '',
  address: '',
  point: null,
  // Monday to Saturday 09:00–20:00, Sunday closed: the most common salon week.
  days: WEEKDAYS.map((_, i) => ({ open: i < 6, start: '09:00', end: '20:00' })),
  picked: {},
  custom: [],
  ownerName: '',
  ownerBookable: true,
  members: [],
};
const STEPS = ['Tür', 'Bilgiler', 'Adres', 'Saatler', 'Hizmetler', 'Personel', 'Onay'] as const;
const TYPES: { value: Audience; icon: string; label: string; hint: string }[] = [
  { value: 'men', icon: '💈', label: 'Erkek', hint: 'Müşterilerimiz erkek' },
  { value: 'women', icon: '💇‍♀️', label: 'Kadın', hint: 'Müşterilerimiz kadın' },
  { value: 'unisex', icon: '✂️', label: 'Kadın ve erkek', hint: 'Kadın ve erkek müşterilere hizmet veriyoruz' },
];
const TIMES = Array.from({ length: 24 * 4 + 1 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);

// The draft lives for the app session, so leaving the form and coming back keeps what was typed.
let saved: { draft: Draft; step: number } | null = null;

const toMinute = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};

/** "450" or "450,50" (Turkish decimal comma) to kuruş; null when not a price. */
function toKurus(value: string): number | null {
  const n = Number(value.replace(/\s/g, '').replace(',', '.'));
  return value.trim() && Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? Math.round(n * 100) : null;
}

const staffCount = (d: Draft) => (d.ownerBookable ? 1 : 0) + d.members.filter((m) => m.role === 'staff' || m.bookable).length;

/** Where the map goes for the chosen il and ilçe. */
function focusFor(city: string, district: string): MapFocus | null {
  const d = districtsOf(city).find((x) => x.name === district);
  if (d) return { lat: d.lat, lng: d.lng, zoom: 13 };
  const c = provinceCentre(city);
  return c ? { lat: c.lat, lng: c.lng, zoom: 10 } : null;
}

/** Why the current step can't continue yet; null when it can (the website's wording). */
function blocker(step: number, d: Draft): string | null {
  switch (step) {
    case 1:
      return d.audience ? null : 'Salon türünü seçin.';
    case 2:
      if (d.name.trim().length < 2) return 'İşletme adını yazın.';
      if (!phoneComplete(d.phone, 'any')) return 'Salon telefonunu 11 haneli yazın (0 ile başlayarak).';
      if (d.whatsapp && !phoneComplete(d.whatsapp)) return 'WhatsApp için 05 ile başlayan 11 haneli cep numarası yazın.';
      return null;
    case 3:
      if (!d.city) return 'İli seçin.';
      if (d.district.trim().length < 2) return 'İlçeyi seçin.';
      if (d.address.trim().length < 5) return 'Açık adresi yazın.';
      return d.point ? null : 'Haritada salonunuzun yerini işaretleyin.';
    case 4: {
      const open = d.days.filter((x) => x.open);
      if (!open.length) return 'En az bir gün açık olmalı.';
      return open.every((x) => toMinute(x.end) > toMinute(x.start)) ? null : 'Kapanış saati açılıştan sonra olmalı.';
    }
    case 5: {
      const picked = Object.values(d.picked);
      if (!picked.length && !d.custom.length) return 'En az bir hizmet seçin.';
      if (picked.some((p) => toKurus(p.price) === null)) return 'Seçtiğiniz her hizmete fiyat yazın.';
      const customOk = d.custom.every((c) => c.name.trim().length >= 2 && Number(c.duration) >= 5 && toKurus(c.price) !== null);
      return customOk ? null : 'Eklediğiniz hizmetlerin adını, süresini ve fiyatını tamamlayın.';
    }
    case 6:
      if (!d.ownerName.trim()) return 'Adınızı yazın.';
      if (d.members.some((m) => !m.displayName.trim() || !phoneComplete(m.phone))) return 'Her kişinin adını ve 11 haneli cep telefonunu yazın.';
      return staffCount(d) ? null : 'En az bir kişi randevu almalı.';
    default:
      return null;
  }
}

export default function RegisterScreen() {
  const { me, signIn } = useSession();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Draft>(saved?.draft ?? EMPTY);
  const [step, setStep] = useState(saved?.step ?? 1);
  const [dir, setDir] = useState<'right' | 'left'>('right');
  const [result, setResult] = useState<{ shopId: string; slug: string } | null>(null);
  const [finished, setFinished] = useState(false);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    if (!result) saved = { draft, step };
  }, [draft, step, result]);

  // The owner's name starts as the account name.
  useEffect(() => {
    if (me && !draft.ownerName) {
      const name = [me.first_name, me.last_name].filter(Boolean).join(' ');
      if (name) setDraft((d) => ({ ...d, ownerName: name }));
    }
  }, [me, draft.ownerName]);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const go = (next: number) => {
    setDir(next > step ? 'right' : 'left');
    setStep(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const back = () => (step > 1 && !result ? go(step - 1) : router.canGoBack() ? router.back() : router.replace('/profil'));

  // Android's back button steps back through the form.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step > 1 && !result) {
        go(step - 1);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  });

  if (finished && result) return <DoneScreen slug={result.slug} />;
  if (result) return <PhotosScreen shopId={result.shopId} onDone={() => setFinished(true)} />;

  if (!me) {
    return (
      <Shell title="İşletmenizi kaydedin" onBack={back} backLabel="Vazgeç">
        <Heading kicker="Başlamadan önce" title="Telefon numaranızı doğrulayın" lead="Bu numara işletme sahibi hesabınız olur. Kayda kaldığınız yerden devam edebilirsiniz." />
        <Card style={{ gap: 14 }}>
          <SignIn />
        </Card>
      </Shell>
    );
  }

  const problem = blocker(step, draft);
  const last = step === STEPS.length;

  return (
    <Shell
      title={STEPS[step - 1]!}
      onBack={back}
      backLabel={step > 1 ? 'Geri' : 'Vazgeç'}
      progress={step / (STEPS.length + 1)}
      count={`Adım ${step}/${STEPS.length + 1}`}
      scrollRef={scroll}
      footer={
        last ? null : (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
            {problem ? (
              <Text size={13} color={colors.muted} style={{ flex: 1 }}>
                {problem}
              </Text>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <Button title="Devam" onPress={() => go(step + 1)} disabled={Boolean(problem)} style={{ minWidth: 130 }} />
          </View>
        )
      }
    >
      <SlideIn key={step} from={dir} style={{ gap: 14 }}>
        {step === 1 ? <TypeStep draft={draft} update={update} /> : null}
        {step === 2 ? <DetailsStep draft={draft} update={update} /> : null}
        {step === 3 ? <AddressStep draft={draft} update={update} /> : null}
        {step === 4 ? <HoursStep draft={draft} update={update} /> : null}
        {step === 5 ? <ServicesStep draft={draft} update={update} /> : null}
        {step === 6 ? <StaffStep draft={draft} update={update} me={me} /> : null}
        {step === 7 ? (
          <ConfirmStep
            draft={draft}
            me={me}
            onRegistered={async (r) => {
              saved = null;
              // The answer carries an owner session for the new salon: the app continues in business mode.
              await signIn(r.token, { ...me, portal: 'owner' }, true);
              setResult(r);
            }}
          />
        ) : null}
      </SlideIn>
    </Shell>
  );
}

function Shell(props: {
  title: string;
  onBack: () => void;
  backLabel: string;
  progress?: number;
  count?: string;
  children: ReactNode;
  footer?: ReactNode;
  scrollRef?: React.RefObject<ScrollView | null>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={props.onBack} hitSlop={10} style={styles.headerBack} accessibilityLabel={props.backLabel}>
            <Icon name="back" size={20} color={colors.primaryLight} strokeWidth={2.4} />
            <Text weight="bold" color={colors.primaryLight}>
              {props.backLabel}
            </Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          {props.count ? (
            <Text size={13} weight="semibold" color={colors.darkMuted}>
              {props.count}
            </Text>
          ) : null}
        </View>
        <Text size={26} weight="heavy" color={colors.white}>
          {props.title}
        </Text>
        {props.progress !== undefined ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(props.progress * 100)}%` }]} />
          </View>
        ) : null}
      </View>
      <ScrollView ref={props.scrollRef} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 130 + insets.bottom }} keyboardShouldPersistTaps="handled">
        {props.children}
      </ScrollView>
      {props.footer}
    </KeyboardAvoidingView>
  );
}

function Heading(props: { kicker: string; title: string; lead: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text size={13} weight="bold" color={colors.primary} style={{ letterSpacing: 0.5 }}>
        {props.kicker.toLocaleUpperCase('tr-TR')}
      </Text>
      <Text size={24} weight="heavy" style={{ letterSpacing: -0.4 }}>
        {props.title}
      </Text>
      <Text color={colors.ink2}>{props.lead}</Text>
    </View>
  );
}

type StepProps = { draft: Draft; update: (patch: Partial<Draft>) => void };

function TypeStep({ draft, update }: StepProps) {
  return (
    <>
      <Heading kicker="Hoş geldiniz" title="Müşterileriniz kimler?" lead="Salonunuz Keşfet'te ve Popüler kesimlerde bu seçime göre listelenir. Kadın ve erkek salonları iki listede de görünür." />
      {TYPES.map((o, i) => {
        const on = draft.audience === o.value;
        return (
          <Appear key={o.value} index={i}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => update({ audience: o.value })}
              style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && { transform: [{ scale: 0.98 }] }]}
            >
              <View style={[styles.typeIcon, on && { backgroundColor: colors.white }]}>
                <Text size={26}>{o.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text size={17} weight="bold">
                  {o.label}
                </Text>
                <Text size={14} color={colors.muted}>
                  {o.hint}
                </Text>
              </View>
              <Radio on={on} />
            </Pressable>
          </Appear>
        );
      })}
    </>
  );
}

function DetailsStep({ draft, update }: StepProps) {
  return (
    <>
      <Heading kicker="İşletme bilgileri" title="Salonunuzu tanıtın" lead="Bu bilgiler profil sayfanızda görünür; sonradan değiştirebilirsiniz." />
      <Field label="İşletme adı" value={draft.name} maxLength={80} placeholder="Örn. Nirvana Erkek Kuaförü" onChangeText={(name) => update({ name })} />
      <View style={{ gap: 4 }}>
        <Field
          label="Salon telefonu"
          value={formatPhoneInput(draft.phone)}
          keyboardType="phone-pad"
          placeholder="0216 555 44 33 ya da 05xx…"
          maxLength={14}
          onChangeText={(phone) => update({ phone: phoneDigits(phone) })}
        />
        <Text size={13} color={colors.muted}>
          Müşteriler “Ara” düğmesiyle bu numarayı arar. Sabit hat da olabilir.
        </Text>
      </View>
      <View style={{ gap: 4 }}>
        <Field
          label="WhatsApp (isteğe bağlı)"
          value={formatPhoneInput(draft.whatsapp)}
          keyboardType="phone-pad"
          placeholder="05xx xxx xx xx"
          maxLength={14}
          onChangeText={(whatsapp) => update({ whatsapp: phoneDigits(whatsapp) })}
        />
        {phoneComplete(draft.phone) && !draft.whatsapp ? (
          <Pressable onPress={() => update({ whatsapp: draft.phone })} hitSlop={6} style={{ alignSelf: 'flex-start' }}>
            <Text size={14} weight="bold" color={colors.primary}>
              Salon telefonunu kullan
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Field label="Instagram (isteğe bağlı)" value={draft.instagram} placeholder="@kullaniciadi" autoCapitalize="none" autoCorrect={false} onChangeText={(instagram) => update({ instagram })} />
      <Area label="Hakkında (isteğe bağlı)" value={draft.about} maxLength={600} placeholder="Salonunuzu birkaç cümleyle anlatın." onChange={(about) => update({ about })} />
    </>
  );
}

function AddressStep({ draft, update }: StepProps) {
  const [picking, setPicking] = useState(false);
  const focus = focusFor(draft.city, draft.district);
  return (
    <>
      <Heading kicker="Adres" title="Salonunuz nerede?" lead="Müşteriler sizi haritada bu konumda görür ve yol tarifi alır." />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <SelectField label="İl" value={draft.city} options={PROVINCES} searchable placeholder="Seçin" onChange={(city) => update({ city, district: '', point: null })} />
        <SelectField
          label="İlçe"
          value={draft.district}
          options={districtsOf(draft.city).map((d) => d.name)}
          searchable
          disabled={!draft.city}
          placeholder={draft.city ? 'Seçin' : 'Önce il seçin'}
          onChange={(district) => update({ district, point: null })}
        />
      </View>
      <Area label="Açık adres" value={draft.address} maxLength={300} placeholder="Mahalle, cadde/sokak, bina no" onChange={(address) => update({ address })} />
      <View style={{ gap: 6 }}>
        <Text size={14} weight="semibold" color={colors.ink2}>
          Haritadaki yeri
        </Text>
        <MapPreview point={draft.point} focus={focus} onPress={() => setPicking(true)} />
        <Text size={13} color={draft.point ? colors.success : colors.muted}>
          {draft.point ? '✓ Konum işaretlendi.' : 'Haritaya dokunun ve iğneyi salonunuzun yerine getirin ya da salondaysanız “Konumumu kullan”a basın.'}
        </Text>
      </View>
      {picking ? (
        <MapPickerModal
          visible
          point={draft.point}
          focus={focus}
          onClose={() => setPicking(false)}
          onPick={(point) => {
            update({ point });
            setPicking(false);
          }}
        />
      ) : null}
    </>
  );
}

function HoursStep({ draft, update }: StepProps) {
  const setDay = (i: number, patch: Partial<Day>) => update({ days: draft.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const firstOpen = draft.days.find((d) => d.open);
  return (
    <>
      <Heading kicker="Çalışma saatleri" title="Hangi saatlerde açıksınız?" lead="Müşteriler yalnızca bu saatlerde randevu alabilir. Her personel kendi saatlerini sonradan değiştirebilir." />
      <Card style={{ padding: 4 }}>
        {draft.days.map((d, i) => (
          <View key={WEEKDAYS[i]} style={[styles.dayRow, i < 6 && styles.rowLine]}>
            <Switch
              value={d.open}
              onValueChange={(open) => setDay(i, { open })}
              trackColor={{ true: colors.primary, false: colors.line }}
              thumbColor={colors.white}
              accessibilityLabel={`${WEEKDAYS[i]} açık`}
            />
            <Text weight="semibold" style={{ width: 92 }}>
              {WEEKDAYS[i]}
            </Text>
            {d.open ? (
              <View style={styles.times}>
                <SelectField compact title={`${WEEKDAYS[i]} açılış`} value={d.start} options={TIMES} onChange={(start) => setDay(i, { start })} />
                <Text color={colors.muted}>–</Text>
                <SelectField compact title={`${WEEKDAYS[i]} kapanış`} value={d.end} options={TIMES} onChange={(end) => setDay(i, { end })} />
              </View>
            ) : (
              <Text color={colors.muted} style={{ flex: 1, textAlign: 'right', paddingRight: 8 }}>
                Kapalı
              </Text>
            )}
          </View>
        ))}
      </Card>
      {firstOpen ? (
        <Pressable onPress={() => update({ days: draft.days.map((d) => (d.open ? { ...d, start: firstOpen.start, end: firstOpen.end } : d)) })} hitSlop={6}>
          <Text weight="bold" color={colors.primary}>
            {firstOpen.start}–{firstOpen.end} saatini tüm açık günlere uygula
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}

function ServicesStep({ draft, update }: StepProps) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<CatalogItem[]>('/catalog')
      .then(setCatalog)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return q ? catalog.filter((c) => c.name.toLocaleLowerCase('tr-TR').includes(q)) : catalog;
  }, [catalog, query]);

  const toggle = (id: number) => {
    const picked = { ...draft.picked };
    if (picked[id]) delete picked[id];
    else picked[id] = { price: '', from: false };
    update({ picked });
  };
  const setPicked = (id: number, patch: Partial<Picked>) => update({ picked: { ...draft.picked, [id]: { ...draft.picked[id]!, ...patch } } });
  const setCustom = (i: number, patch: Partial<Custom>) => update({ custom: draft.custom.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const total = Object.keys(draft.picked).length + draft.custom.length;

  return (
    <>
      <Heading
        kicker="Hizmetler ve fiyatlar"
        title="Hangi hizmetleri veriyorsunuz?"
        lead="Listeden seçip fiyatını yazın. Listede olmayanları en alttan ekleyin. Süreleri her personel kendine göre ayarlayabilir."
      />
      <View style={styles.search}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Hizmet ara…" placeholderTextColor={colors.muted} style={styles.searchInput} />
      </View>
      {total > 0 ? (
        <Text size={14} weight="bold" color={colors.primary}>
          {total} hizmet seçildi
        </Text>
      ) : null}
      {error ? <Alert text={error} /> : null}
      <Card style={{ padding: 4 }}>
        {shown.map((c, i) => {
          const p = draft.picked[c.id];
          return (
            <View key={c.id} style={[{ paddingHorizontal: 10, paddingVertical: 4 }, i < shown.length - 1 && styles.rowLine]}>
              <Pressable onPress={() => toggle(c.id)} style={styles.serviceHead} accessibilityRole="checkbox" accessibilityState={{ checked: Boolean(p) }}>
                <Box on={Boolean(p)} />
                <Text weight="semibold" style={{ flex: 1 }}>
                  {c.name}
                </Text>
                <Text size={13} color={colors.muted}>
                  {formatDuration(c.duration_minutes)}
                </Text>
              </Pressable>
              {p ? (
                <View style={styles.priceRow}>
                  <PriceInput value={p.price} label={`${c.name} fiyatı`} onChange={(price) => setPicked(c.id, { price })} />
                  <Pressable onPress={() => setPicked(c.id, { from: !p.from })} style={styles.smallCheck}>
                    <Box on={p.from} small />
                    <Text size={14}>“ve üzeri”</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
        {catalog.length > 0 && shown.length === 0 ? (
          <Text color={colors.muted} style={{ padding: 12 }}>
            “{query}” listede yok. Aşağıdan kendi hizmetinizi ekleyin.
          </Text>
        ) : null}
      </Card>

      <Text size={18} weight="heavy" style={{ marginTop: 6 }}>
        Kendi hizmetleriniz
      </Text>
      {draft.custom.map((c, i) => (
        <Appear key={i}>
          <Card style={{ gap: 10 }}>
            <View style={styles.personHead}>
              <Text weight="bold">Hizmet {i + 1}</Text>
              <Pressable onPress={() => update({ custom: draft.custom.filter((_, j) => j !== i) })} hitSlop={8}>
                <Text weight="bold" color={colors.danger}>
                  Kaldır
                </Text>
              </Pressable>
            </View>
            <Field label="Hizmet adı" value={c.name} maxLength={80} onChangeText={(name) => setCustom(i, { name })} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="Süre (dk)" value={c.duration} keyboardType="number-pad" onChangeText={(v) => setCustom(i, { duration: v.replace(/\D/g, '') })} />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text size={14} weight="semibold" color={colors.ink2}>
                  Fiyat
                </Text>
                <PriceInput value={c.price} label="Fiyat" onChange={(price) => setCustom(i, { price })} />
              </View>
            </View>
            <Pressable onPress={() => setCustom(i, { from: !c.from })} style={styles.smallCheck}>
              <Box on={c.from} small />
              <Text size={14}>Fiyatı “ve üzeri” olarak göster</Text>
            </Pressable>
          </Card>
        </Appear>
      ))}
      <Button kind="secondary" title="+ Hizmet ekle" onPress={() => update({ custom: [...draft.custom, { name: query.trim(), duration: '30', price: '', from: false }] })} />
    </>
  );
}

function StaffStep({ draft, update, me }: StepProps & { me: Me }) {
  const plans = usePlans();
  const setMember = (i: number, patch: Partial<Member>) => update({ members: draft.members.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  return (
    <>
      <Heading kicker="Personel" title="Kimler randevu alacak?" lead="Paket, randevu alan personel sayısına göre belirlenir. Ortaklar sizinle aynı yetkilere sahip olur." />
      <Card style={{ gap: 12 }}>
        <View style={styles.personHead}>
          <Text weight="bold">Siz · İşletme sahibi</Text>
          <Text size={14} color={colors.muted}>
            {formatPhone(me.phone)}
          </Text>
        </View>
        <Field label="Müşterilerin göreceği adınız" value={draft.ownerName} maxLength={60} onChangeText={(ownerName) => update({ ownerName })} />
        <Pressable onPress={() => update({ ownerBookable: !draft.ownerBookable })} style={styles.smallCheck}>
          <Box on={draft.ownerBookable} small />
          <Text size={14}>Ben de randevu alıyorum</Text>
        </Pressable>
      </Card>

      {draft.members.map((m, i) => (
        <Appear key={i}>
          <Card style={{ gap: 12 }}>
            <View style={styles.personHead}>
              <Text weight="bold">
                {m.role === 'co_owner' ? 'Ortak' : 'Personel'} {i + 1}
              </Text>
              <Pressable onPress={() => update({ members: draft.members.filter((_, j) => j !== i) })} hitSlop={8}>
                <Text weight="bold" color={colors.danger}>
                  Kaldır
                </Text>
              </Pressable>
            </View>
            <View style={styles.segmented}>
              {(['staff', 'co_owner'] as const).map((role) => (
                <Pressable key={role} onPress={() => setMember(i, { role, bookable: true })} style={[styles.segment, m.role === role && { backgroundColor: colors.primary }]}>
                  <Text weight="bold" color={m.role === role ? colors.white : colors.ink2}>
                    {role === 'staff' ? 'Personel' : 'Ortak'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Field label="Ad" value={m.displayName} maxLength={60} onChangeText={(displayName) => setMember(i, { displayName })} />
            <Field
              label="Cep telefonu"
              value={formatPhoneInput(m.phone)}
              keyboardType="phone-pad"
              maxLength={14}
              placeholder="05xx xxx xx xx"
              onChangeText={(v) => setMember(i, { phone: phoneDigits(v) })}
            />
            {m.role === 'co_owner' ? (
              <>
                <Text size={13} color={colors.muted}>
                  Ortak, sizinle aynı yetkilere sahiptir: fiyatlar, personel ve ayarlar.
                </Text>
                <Pressable onPress={() => setMember(i, { bookable: !m.bookable })} style={styles.smallCheck}>
                  <Box on={m.bookable} small />
                  <Text size={14}>Randevu alıyor</Text>
                </Pressable>
              </>
            ) : null}
          </Card>
        </Appear>
      ))}
      <Button kind="secondary" title="+ Personel veya ortak ekle" onPress={() => update({ members: [...draft.members, { displayName: '', phone: '', role: 'staff', bookable: true }] })} />
      <Text size={13} color={colors.muted}>
        Eklediğiniz kişiler kendi telefon numaralarıyla giriş yapar.
      </Text>
      <PlanName count={staffCount(draft)} plans={plans} />
    </>
  );
}

function usePlans() {
  const [plans, setPlans] = useState<Plans | null>(null);
  useEffect(() => {
    api<Plans>('/public/plans')
      .then(setPlans)
      .catch(() => setPlans(null));
  }, []);
  return plans;
}

/** The plan this team falls under: its name only (store rules: no prices in the app). */
function PlanName({ count, plans }: { count: number; plans: Plans | null }) {
  if (!plans) return null;
  const plan = plans.plans.find((p) => count <= p.maxStaff);
  return (
    <View style={styles.planBox}>
      <Text size={13} color={colors.muted}>
        {count} kişi randevu alıyor · Paketiniz
      </Text>
      <Text size={17} weight="heavy">
        {plan ? plan.name : `${plans.terms.customQuoteAboveStaff}’dan fazla personel`}
      </Text>
    </View>
  );
}

function ConfirmStep({ draft, me, onRegistered }: { draft: Draft; me: Me; onRegistered: (r: { shopId: string; slug: string; token: string }) => Promise<void> }) {
  const insets = useSafeAreaInsets();
  const plans = usePlans();
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [business, setBusiness] = useState(false);
  const [dataProcessing, setDataProcessing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const serviceCount = Object.keys(draft.picked).length + draft.custom.length;
  const openDays = draft.days.filter((d) => d.open).length;

  useEffect(() => {
    api<{ key: string; version: string }[]>('/public/legal')
      .then((docs) => setVersions(Object.fromEntries(docs.map((d) => [d.key, d.version]))))
      .catch(() => undefined);
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ shopId: string; slug: string; token: string }>('/registrations', {
        method: 'POST',
        body: {
          audience: draft.audience,
          name: draft.name.trim(),
          phone: draft.phone,
          whatsapp: draft.whatsapp || null,
          instagram: draft.instagram.trim() || null,
          about: draft.about.trim() || null,
          city: draft.city,
          district: draft.district.trim(),
          address: draft.address.trim(),
          latitude: draft.point!.lat,
          longitude: draft.point!.lng,
          hours: draft.days.flatMap((d, i) => (d.open ? [{ weekday: i + 1, startMinute: toMinute(d.start), endMinute: toMinute(d.end) }] : [])),
          services: [
            ...Object.entries(draft.picked).map(([id, p]) => ({ catalogId: Number(id), priceKurus: toKurus(p.price)!, priceIsStartingFrom: p.from })),
            ...draft.custom.map((c) => ({ name: c.name.trim(), durationMinutes: Number(c.duration), priceKurus: toKurus(c.price)!, priceIsStartingFrom: c.from })),
          ],
          owner: { displayName: draft.ownerName.trim(), bookable: draft.ownerBookable },
          members: draft.members.map((m) => ({ ...m, displayName: m.displayName.trim(), bookable: m.role === 'staff' || m.bookable })),
          consents: [
            { key: 'isletme-sozlesmesi', version: versions['isletme-sozlesmesi'] },
            { key: 'veri-isleme-sozlesmesi', version: versions['veri-isleme-sozlesmesi'] },
          ],
        },
      });
      await onRegistered(r);
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'VALIDATION' ? 'Bazı bilgiler eksik veya hatalı görünüyor. Önceki adımları kontrol edin.' : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const rows: [string, string][] = [
    ['İşletme', draft.name],
    ['Tür', draft.audience ? AUDIENCE[draft.audience]! : ''],
    ['Konum', `${draft.district}, ${draft.city}`],
    ['Açık günler', `Haftada ${openDays} gün`],
    ['Hizmetler', `${serviceCount} hizmet`],
    ['Sahibi', `${draft.ownerName} · ${formatPhone(me.phone)}`],
  ];

  return (
    <>
      <Heading kicker="Son adım" title="Kontrol ve sözleşmeler" lead="Bilgilerinizi kontrol edin. Göndermeden önce sözleşmeleri onaylamanız gerekir." />
      <Card style={{ gap: 10 }}>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.summaryRow}>
            <Text color={colors.muted}>{k}</Text>
            <Text weight="semibold" style={{ flex: 1, textAlign: 'right' }}>
              {v}
            </Text>
          </View>
        ))}
      </Card>
      <PlanName count={staffCount(draft)} plans={plans} />
      {plans ? (
        <>
          <View style={{ gap: 6 }}>
            {plans.features.map((f) => (
              <Text key={f} size={14} color={colors.ink2}>
                ✓ {f}
              </Text>
            ))}
          </View>
          <Alert tone="success" text={`Salonunuz kaydı tamamladığınız anda yayına girer. İlk ${plans.terms.trialDays} gün ücretsiz deneme.`} />
        </>
      ) : null}
      <View style={{ gap: 12 }}>
        <Consent on={business} onPress={() => setBusiness(!business)} doc="isletme-sozlesmesi" title="İşletme Hizmet Sözleşmesi" />
        <Consent on={dataProcessing} onPress={() => setDataProcessing(!dataProcessing)} doc="veri-isleme-sozlesmesi" title="Veri İşleme Sözleşmesi" />
        <Text size={13} color={colors.muted}>
          Kişisel verileriniz KVKK Aydınlatma Metni kapsamında işlenir.
        </Text>
      </View>
      {error ? <Alert text={error} /> : null}
      <Button title="Başvuruyu gönder" onPress={submit} busy={busy} disabled={!business || !dataProcessing || !versions['isletme-sozlesmesi']} style={{ marginBottom: insets.bottom }} />
    </>
  );
}

function Consent(props: { on: boolean; onPress: () => void; doc: string; title: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: props.on }} onPress={props.onPress} style={[styles.smallCheck, { alignItems: 'flex-start' }]}>
        <Box on={props.on} />
        <Text size={14} style={{ flex: 1 }}>
          <Text size={14} weight="semibold" color={colors.primary}>
            {props.title}
          </Text>
          ’ni okudum ve kabul ediyorum.
        </Text>
      </Pressable>
      <Pressable onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/sozlesmeler/${props.doc}`).catch(() => undefined)} style={{ marginLeft: 34 }} hitSlop={6}>
        <Text size={13} weight="bold" color={colors.primary}>
          Sözleşmeyi oku ›
        </Text>
      </Pressable>
    </View>
  );
}

function PhotosScreen({ shopId, onDone }: { shopId: string; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [count, setCount] = useState(0);
  return (
    <Shell
      title="Fotoğraflar"
      onBack={onDone}
      backLabel="Atla"
      progress={1}
      count={`Adım ${STEPS.length + 1}/${STEPS.length + 1}`}
      footer={
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <View style={{ flex: 1 }} />
          <Button kind={count ? 'primary' : 'secondary'} title={count ? 'Bitir' : 'Şimdilik atla'} onPress={onDone} style={{ minWidth: 150 }} />
        </View>
      }
    >
      <Heading
        kicker="Salonunuz yayında"
        title="Salonunuzun fotoğraflarını ekleyin"
        lead="Fotoğraflı salonlar daha çok randevu alır. İlk fotoğraf kapak olur. Bu adımı şimdi atlayıp sonra da ekleyebilirsiniz."
      />
      <PhotoManager shopId={shopId} onCountChange={setCount} />
    </Shell>
  );
}

function DoneScreen({ slug }: { slug: string }) {
  return (
    <Shell title="Yayında" onBack={() => router.replace('/salonum')} backLabel="Salonum">
      <View style={{ alignItems: 'center', gap: 10, paddingTop: 12 }}>
        <PopIn>
          <View style={styles.doneMark}>
            <Text size={40} weight="heavy" color={colors.success}>
              ✓
            </Text>
          </View>
        </PopIn>
        <Text size={24} weight="heavy" center>
          Salonunuz yayında
        </Text>
        <Text color={colors.ink2} center>
          Müşteriler salonunuzu haritada ve kendi sayfasında görüp hemen randevu alabilir. Ücretsiz denemeniz bugün başladı.
        </Text>
      </View>
      <Card style={{ gap: 8 }}>
        <Text>1. Salonum → QR kod’dan kodunuzu indirip salona asın.</Text>
        <Text>2. Personeliniz kendi numarasıyla giriş yapar.</Text>
        <Text>3. Hizmetleri, saatleri ve fotoğrafları Salonum’dan istediğiniz zaman düzenleyin.</Text>
      </Card>
      <Text color={colors.muted} center>
        Sayfa adresiniz: /{slug}
      </Text>
      <Button title="Salonum’a git" onPress={() => router.replace('/salonum')} />
      <Button kind="secondary" title="Salon sayfamı gör" onPress={() => router.push(`/salon/${slug}`)} />
    </Shell>
  );
}

function Area(props: { label: string; value: string; maxLength: number; placeholder: string; onChange: (v: string) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text size={14} weight="semibold" color={colors.ink2}>
        {props.label}
      </Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChange}
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        placeholderTextColor={colors.muted}
        multiline
        style={[styles.input, { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' }]}
      />
    </View>
  );
}

function PriceInput(props: { value: string; label: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.price}>
      <Text weight="bold" color={colors.muted}>
        ₺
      </Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChange}
        keyboardType="decimal-pad"
        placeholder="Fiyat"
        placeholderTextColor={colors.muted}
        accessibilityLabel={props.label}
        style={styles.priceInput}
      />
    </View>
  );
}

function Box({ on, small }: { on: boolean; small?: boolean }) {
  const size = small ? 20 : 24;
  return (
    <View style={[styles.box, { width: size, height: size }, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
      {on ? (
        <Text size={small ? 12 : 14} weight="bold" color={colors.white}>
          ✓
        </Text>
      ) : null}
    </View>
  );
}

function Radio({ on }: { on: boolean }) {
  return <View style={[styles.radio, on && { borderColor: colors.primary, borderWidth: 7 }]} />;
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.ink, paddingHorizontal: 16, paddingBottom: 18, gap: 8 },
  headerBack: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.dark2, marginTop: 6, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.primaryLight },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.surface2 },
  typeIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 58, paddingHorizontal: 8 },
  times: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, paddingVertical: 8 },
  serviceHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 36, paddingBottom: 10 },
  price: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 120,
    minHeight: 46,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  priceInput: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.ink, paddingVertical: 8 },
  smallCheck: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: { borderRadius: 6, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  personHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  segmented: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  segment: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  planBox: { gap: 2, padding: 14, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  summaryRow: { flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: '31.5%', aspectRatio: 1, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface2 },
  coverBadge: { position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: 'rgba(14,16,19,0.75)' },
  doneMark: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' },
});
