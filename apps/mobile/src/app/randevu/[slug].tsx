import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Appear, PageSkeleton, PopIn, Skeleton } from '@/components/motion';
import { SignIn } from '@/components/SignIn';
import { Alert, Button, Card, Text } from '@/components/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { formatDuration, formatLongDate, formatPrice, formatTime, relativeDayTime, turkeyDate, turkeyHour, upcomingDays } from '@/lib/format';
import { useSession } from '@/lib/session';
import { colors, fonts, radius } from '@/lib/theme';
import type { Availability, BookingResult, CustomerAppointment, ShopProfile, Slot } from '@/lib/types';

type Step = 'services' | 'staff' | 'time' | 'confirm' | 'done';
const ORDER: Step[] = ['services', 'staff', 'time', 'confirm', 'done'];
const STEPS: { key: Exclude<Step, 'done'>; label: string }[] = [
  { key: 'services', label: 'Hizmet' },
  { key: 'staff', label: 'Personel' },
  { key: 'time', label: 'Saat' },
  { key: 'confirm', label: 'Onay' },
];

/**
 * Booking (as on the website): services, then a staff member or "Fark etmez",
 * then a day and time, then the summary with sign-in. Each step slides in from
 * the side it comes from; Android's back button steps back.
 */
export default function BookingScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<ShopProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('services');
  const [dir, setDir] = useState<'forward' | 'back'>('forward');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [date, setDate] = useState(() => turkeyDate(new Date()));
  const [slot, setSlot] = useState<Slot | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    api<ShopProfile>(`/public/shops/${slug}`)
      .then(setProfile)
      .catch((err) => setError(errorMessage(err)));
  }, [slug]);

  const go = useCallback(
    (next: Step) => {
      setDir(ORDER.indexOf(next) >= ORDER.indexOf(step) ? 'forward' : 'back');
      setStep(next);
      scroll.current?.scrollTo({ y: 0, animated: false });
    },
    [step],
  );

  const back = useCallback(() => {
    setNotice(null);
    if (step === 'staff') go('services');
    else if (step === 'time') go('staff');
    else if (step === 'confirm') go('time');
    else router.back();
  }, [step, go]);

  // Android's back button steps back through the flow; after booking it leaves.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 'services' || step === 'done') return false;
      back();
      return true;
    });
    return () => sub.remove();
  }, [step, back]);

  const selected = useMemo(() => (profile?.services ?? []).filter((s) => serviceIds.includes(s.id)), [profile, serviceIds]);
  const eligibleStaff = (profile?.staff ?? []).filter((m) => serviceIds.every((id) => m.service_ids.includes(id)));
  const totalKurus = selected.reduce((sum, s) => sum + s.price_kurus, 0);
  const startingFrom = selected.some((s) => s.price_is_starting_from);
  const duration = slot?.staff.find((s) => !staffId || s.id === staffId)?.durationMinutes ?? selected.reduce((sum, s) => sum + s.duration_minutes, 0);
  const staffName = staffId ? (profile?.staff.find((m) => m.id === staffId)?.display_name ?? null) : null;

  if (error) {
    return (
      <View style={{ flex: 1, padding: 16, paddingTop: insets.top + 16, gap: 12, backgroundColor: colors.bg }}>
        <Alert text={error} />
        <Button kind="secondary" title="Geri dön" onPress={() => router.back()} />
      </View>
    );
  }
  if (!profile) return <PageSkeleton />;

  const currentIndex = STEPS.findIndex((s) => s.key === step);
  const primary =
    step === 'services'
      ? { label: 'Devam et', disabled: selected.length === 0, onPress: () => (setSlot(null), go('staff')) }
      : step === 'staff'
        ? { label: 'Saat seç', disabled: false, onPress: () => (setSlot(null), go('time')) }
        : step === 'time'
          ? { label: 'Devam et', disabled: !slot, onPress: () => go('confirm') }
          : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={back} hitSlop={10} style={styles.headerBack} accessibilityLabel="Geri">
          <Icon name="back" size={20} color={colors.primaryLight} strokeWidth={2.4} />
          <Text weight="bold" color={colors.primaryLight} numberOfLines={1}>
            {profile.name}
          </Text>
        </Pressable>
        <Text size={26} weight="heavy" color={colors.white}>
          Randevu al
        </Text>
        {step !== 'done' ? (
          <View style={styles.progress}>
            {STEPS.map((s, i) => (
              <View key={s.key} style={{ flex: 1, gap: 6 }}>
                <View style={[styles.progressBar, i <= currentIndex && { backgroundColor: colors.primaryLight }]} />
                <Text size={12} weight={i === currentIndex ? 'bold' : 'medium'} color={i <= currentIndex ? colors.white : colors.darkMuted}>
                  {s.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, paddingBottom: 140 + insets.bottom }} keyboardShouldPersistTaps="handled">
        {notice ? <Alert tone="info" text={notice} /> : null}
        <Animated.View key={step} entering={(dir === 'forward' ? FadeInRight : FadeInLeft).duration(240)} style={{ gap: 12, marginTop: notice ? 12 : 0 }}>
          {step === 'services' ? (
            <ServiceStep profile={profile} selected={serviceIds} onChange={setServiceIds} />
          ) : step === 'staff' ? (
            <StaffStep slug={profile.slug} staff={eligibleStaff} serviceIds={serviceIds} value={staffId} onChange={(id) => (setStaffId(id), setSlot(null))} />
          ) : step === 'time' ? (
            <TimeStep slug={profile.slug} serviceIds={serviceIds} staffId={staffId} date={date} onDateChange={(d) => (setDate(d), setSlot(null))} value={slot} onChange={setSlot} />
          ) : step === 'confirm' && slot ? (
            <ConfirmStep
              profile={profile}
              services={selected}
              staffId={staffId}
              staffName={staffName}
              slot={slot}
              durationMinutes={duration}
              totalKurus={totalKurus}
              startingFrom={startingFrom}
              onBooked={(r) => {
                setResult(r);
                go('done');
              }}
              onSlotTaken={() => {
                setSlot(null);
                setNotice('Bu saat az önce doldu. Lütfen başka bir saat seçin.');
                go('time');
              }}
            />
          ) : step === 'done' && result ? (
            <DoneStep result={result} />
          ) : null}
        </Animated.View>
      </ScrollView>

      {primary ? (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <View style={{ flex: 1 }}>
            <Text weight="bold">{selected.length ? `${selected.length} hizmet · ${formatDuration(duration)}` : 'Hizmet seçin'}</Text>
            {selected.length ? (
              <Text size={14} color={colors.muted}>
                {formatPrice(totalKurus, startingFrom)}
              </Text>
            ) : null}
          </View>
          <Button title={primary.label} onPress={primary.onPress} disabled={primary.disabled} style={{ minWidth: 140 }} />
        </View>
      ) : null}
    </View>
  );
}

function Option(props: { selected: boolean; onPress: () => void; title: string; meta?: string; right?: string; avatar?: string }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: props.selected }}
      onPress={props.onPress}
      style={({ pressed }) => [styles.option, props.selected && styles.optionOn, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      {props.avatar ? (
        <View style={[styles.avatar, props.selected && { backgroundColor: colors.primary }]}>
          <Text weight="bold" color={props.selected ? colors.white : colors.primary}>
            {props.avatar}
          </Text>
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="semibold" size={16}>
          {props.title}
        </Text>
        {props.meta ? (
          <Text size={13} color={colors.muted}>
            {props.meta}
          </Text>
        ) : null}
      </View>
      {props.right ? <Text weight="bold">{props.right}</Text> : null}
      <View style={[styles.check, props.selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
        {props.selected ? (
          <Text size={13} weight="bold" color={colors.white}>
            ✓
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function ServiceStep(props: { profile: ShopProfile; selected: string[]; onChange: (ids: string[]) => void }) {
  const toggle = (id: string) => props.onChange(props.selected.includes(id) ? props.selected.filter((x) => x !== id) : [...props.selected, id]);
  return (
    <>
      <Text size={20} weight="heavy">
        Hizmet seçin
      </Text>
      {props.profile.services.map((s, i) => (
        <Appear key={s.id} index={i}>
          <Option
            selected={props.selected.includes(s.id)}
            onPress={() => toggle(s.id)}
            title={s.name}
            meta={formatDuration(s.duration_minutes)}
            right={formatPrice(s.price_kurus, s.price_is_starting_from)}
          />
        </Appear>
      ))}
    </>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toLocaleUpperCase('tr'))
    .join('');

function StaffStep(props: { slug: string; staff: ShopProfile['staff']; serviceIds: string[]; value: string | null; onChange: (id: string | null) => void }) {
  const [nextFree, setNextFree] = useState<Record<string, string | null>>({});
  const key = props.serviceIds.join(',');

  // The next free time decides more than anything else, so each option shows it.
  useEffect(() => {
    let cancelled = false;
    for (const member of [{ id: 'any' }, ...props.staff]) {
      const staffParam = member.id === 'any' ? '' : `&staffId=${member.id}`;
      api<{ result: { date: string; slot: Slot } | null }>(`/public/shops/${props.slug}/first-available?serviceIds=${key}${staffParam}`)
        .then((r) => !cancelled && setNextFree((m) => ({ ...m, [member.id]: r.result?.slot.startsAt ?? null })))
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [props.slug, props.staff, key]);

  const meta = (id: string) => (id in nextFree ? (nextFree[id] ? `İlk boş saat: ${relativeDayTime(nextFree[id]!)}` : 'Yakında boş saat yok') : 'Boş saat aranıyor…');
  return (
    <>
      <Text size={20} weight="heavy">
        Personel seçin
      </Text>
      <Appear>
        <Option selected={props.value === null} onPress={() => props.onChange(null)} avatar="★" title="Fark etmez (ilk müsait)" meta={meta('any')} />
      </Appear>
      {props.staff.map((m, i) => (
        <Appear key={m.id} index={i + 1}>
          <Option selected={props.value === m.id} onPress={() => props.onChange(m.id)} avatar={initials(m.display_name)} title={m.display_name} meta={meta(m.id)} />
        </Appear>
      ))}
    </>
  );
}

const DAYS = upcomingDays(21);
const PARTS: { label: string; test: (hour: number) => boolean }[] = [
  { label: 'Sabah', test: (h) => h < 12 },
  { label: 'Öğleden sonra', test: (h) => h >= 12 && h < 17 },
  { label: 'Akşam', test: (h) => h >= 17 },
];

function TimeStep(props: { slug: string; serviceIds: string[]; staffId: string | null; date: string; onDateChange: (d: string) => void; value: Slot | null; onChange: (s: Slot) => void }) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const days = useRef<ScrollView>(null);
  const query = `serviceIds=${props.serviceIds.join(',')}${props.staffId ? `&staffId=${props.staffId}` : ''}`;

  useEffect(() => {
    let cancelled = false;
    setSlots(null);
    setError(null);
    api<Availability>(`/public/shops/${props.slug}/availability?date=${props.date}&${query}`)
      .then((r) => !cancelled && setSlots(r.slots))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [props.slug, props.date, query]);

  async function firstAvailable() {
    setFinding(true);
    setError(null);
    try {
      const r = await api<{ result: { date: string; slot: Slot } | null }>(`/public/shops/${props.slug}/first-available?${query}`);
      if (r.result) {
        props.onDateChange(r.result.date);
        props.onChange(r.result.slot);
        const i = DAYS.findIndex((d) => d.date === r.result!.date);
        if (i > 0) days.current?.scrollTo({ x: Math.max(0, i * 72 - 24), animated: true });
      } else setError('Önümüzdeki günlerde boş saat bulunamadı.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setFinding(false);
    }
  }

  return (
    <>
      <Text size={20} weight="heavy">
        Saat seçin
      </Text>
      <Button kind="secondary" title="⚡ İlk uygun saati bul" onPress={firstAvailable} busy={finding} />
      <ScrollView ref={days} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {DAYS.map((d) => {
          const on = d.date === props.date;
          return (
            <Pressable key={d.date} onPress={() => props.onDateChange(d.date)} style={[styles.day, on && styles.dayOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
              <Text size={12} weight="semibold" color={on ? colors.white : colors.muted}>
                {d.isToday ? 'Bugün' : d.weekday}
              </Text>
              <Text size={20} weight="heavy" color={on ? colors.white : colors.ink}>
                {d.day}
              </Text>
              <Text size={12} color={on ? colors.white : colors.muted}>
                {d.month}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {error ? <Alert text={error} /> : null}
      {!slots && !error ? (
        <View style={{ gap: 10 }}>
          <Skeleton width="30%" />
          <View style={styles.slots}>
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} width="22%" height={48} />
            ))}
          </View>
        </View>
      ) : null}
      {slots && slots.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: 10 }}>
          <Text color={colors.muted}>Bu gün için boş saat kalmadı.</Text>
          <Button kind="secondary" title="Sonraki boş saati göster" onPress={firstAvailable} busy={finding} />
        </Card>
      ) : null}
      {slots
        ? PARTS.map((part) => {
            const inPart = slots.filter((s) => part.test(turkeyHour(s.startsAt)));
            if (!inPart.length) return null;
            return (
              <Appear key={part.label} style={{ gap: 8 }}>
                <Text size={14} weight="bold" color={colors.ink2}>
                  {part.label}
                </Text>
                <View style={styles.slots}>
                  {inPart.map((s) => {
                    const on = props.value?.startsAt === s.startsAt;
                    return (
                      <Pressable key={s.startsAt} onPress={() => props.onChange(s)} style={({ pressed }) => [styles.slot, on && styles.slotOn, pressed && { transform: [{ scale: 0.95 }] }]}>
                        <Text weight="bold" size={16} color={on ? colors.white : colors.ink}>
                          {formatTime(s.startsAt)}
                        </Text>
                        {s.instantConfirmation ? (
                          <Text size={10} weight="semibold" color={on ? colors.white : colors.success}>
                            Anında onay
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </Appear>
            );
          })
        : null}
    </>
  );
}

function ConfirmStep(props: {
  profile: ShopProfile;
  services: ShopProfile['services'];
  staffId: string | null;
  staffName: string | null;
  slot: Slot;
  durationMinutes: number;
  totalKurus: number;
  startingFrom: boolean;
  onBooked: (r: BookingResult) => void;
  onSlotTaken: () => void;
}) {
  const { me } = useSession();
  const [forWhom, setForWhom] = useState<'self' | 'other'>('self');
  const [guestName, setGuestName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsTerms, setNeedsTerms] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (needsTerms) {
        const docs = await api<{ key: string; version: string }[]>('/public/legal');
        const v = docs.find((d) => d.key === 'kullanici-sozlesmesi')?.version;
        if (v) await api('/me/consents', { method: 'POST', body: [{ key: 'kullanici-sozlesmesi', version: v }] });
        setNeedsTerms(false);
      }
      const result = await api<BookingResult>(`/shops/${props.profile.slug}/bookings`, {
        method: 'POST',
        body: {
          items: [
            {
              serviceIds: props.services.map((s) => s.id),
              staffId: props.staffId,
              startsAt: props.slot.startsAt,
              guestName: forWhom === 'other' ? guestName.trim() : null,
            },
          ],
        },
      });
      props.onBooked(result);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SLOT_TAKEN') return props.onSlotTaken();
      if (err instanceof ApiError && err.code === 'TERMS_REQUIRED') setNeedsTerms(true);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Text size={20} weight="heavy">
        Son bir kontrol
      </Text>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text weight="semibold">{formatLongDate(props.slot.startsAt)}</Text>
          <Text size={24} weight="heavy" color={colors.primary}>
            {formatTime(props.slot.startsAt)}
          </Text>
        </View>
        <Row label="Salon" value={props.profile.name} />
        <Row label="Personel" value={props.staffName ?? 'İlk müsait personel'} />
        {props.services.map((s) => (
          <Row key={s.id} label={s.name} value={formatPrice(s.price_kurus, s.price_is_starting_from)} />
        ))}
        <Row label="Süre" value={formatDuration(props.durationMinutes)} />
        <View style={styles.totalRow}>
          <Text weight="bold">Toplam</Text>
          <Text weight="heavy" size={18}>
            {formatPrice(props.totalKurus, props.startingFrom)}
          </Text>
        </View>
        <Text size={13} color={colors.muted}>
          Ödeme salonda yapılır.
        </Text>
      </Card>

      {!me ? (
        <Card style={{ gap: 12 }}>
          <Text weight="bold" size={17}>
            Randevuyu tamamlamak için giriş yapın
          </Text>
          <SignIn />
        </Card>
      ) : (
        <>
          <Card style={{ gap: 10 }}>
            <Text weight="bold">Randevu kimin için?</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {(['self', 'other'] as const).map((w) => (
                <Pressable key={w} onPress={() => setForWhom(w)} style={[styles.whom, forWhom === w && styles.whomOn]} accessibilityRole="radio" accessibilityState={{ checked: forWhom === w }}>
                  <Text weight="bold" color={forWhom === w ? colors.primary : colors.ink}>
                    {w === 'self' ? 'Kendim' : 'Başkası'}
                  </Text>
                </Pressable>
              ))}
            </View>
            {forWhom === 'other' ? (
              <TextInput value={guestName} onChangeText={setGuestName} placeholder="Adı (örn. Oğlum Can)" placeholderTextColor={colors.muted} style={styles.input} maxLength={60} />
            ) : null}
          </Card>
          {needsTerms ? <Alert tone="info" text="Devam ederek Kullanıcı Sözleşmesi’ni kabul etmiş olursunuz." /> : null}
          {error ? <Alert text={error} /> : null}
          <Button title="Randevuyu oluştur" onPress={submit} busy={busy} disabled={forWhom === 'other' && !guestName.trim()} />
        </>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text color={colors.muted} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Text weight="semibold" style={{ flex: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}

/** After booking: confirmed or waiting for the salon, refreshing until the salon answers. */
function DoneStep({ result }: { result: BookingResult }) {
  const [appointments, setAppointments] = useState<CustomerAppointment[] | null>(null);
  const key = result.appointments.map((a) => a.id).join(',');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const load = async () => {
      try {
        const mine = (await api<CustomerAppointment[]>('/me/appointments')).filter((a) => key.split(',').includes(a.id));
        if (cancelled) return;
        setAppointments(mine);
        if (mine.some((a) => a.status === 'pending')) timer = setTimeout(load, 10_000);
      } catch {
        if (!cancelled) timer = setTimeout(load, 15_000);
      }
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key]);

  const confirmed = (appointments ?? result.appointments).every((a) => a.status === 'confirmed');
  return (
    <View style={{ alignItems: 'center', gap: 14, paddingTop: 12 }}>
      <PopIn>
        <View style={[styles.doneIcon, { backgroundColor: confirmed ? colors.successSoft : colors.primarySoft }]}>
          {confirmed ? (
            <Text size={40} weight="heavy" color={colors.success}>
              ✓
            </Text>
          ) : (
            <Icon name="clock" size={40} color={colors.primary} strokeWidth={2.2} />
          )}
        </View>
      </PopIn>
      <Appear index={2}>
        <Text size={24} weight="heavy" center>
          {confirmed ? 'Randevunuz onaylandı' : 'Talebiniz salona iletildi'}
        </Text>
      </Appear>
      {(appointments ?? []).map((a, i) => (
        <Appear key={a.id} index={3 + i} style={{ alignSelf: 'stretch' }}>
          <Card style={{ gap: 4 }}>
            <Text weight="bold" size={16}>
              {formatLongDate(a.starts_at)} · {formatTime(a.starts_at)}
            </Text>
            <Text color={colors.muted}>
              {a.shop_name} · {a.staff_name}
              {a.guest_name ? ` · ${a.guest_name} için` : ''}
            </Text>
            <Text size={14} weight="semibold" color={a.status === 'confirmed' ? colors.success : colors.warning}>
              {a.status === 'confirmed' ? 'Onaylandı' : 'Salon onayı bekleniyor'}
            </Text>
            {a.status === 'pending' && a.deadline_at ? (
              <Text size={13} color={colors.muted}>
                Yanıt gelmezse otomatik onaylanır. Otomatik onay saati: {formatTime(a.deadline_at)}
              </Text>
            ) : null}
          </Card>
        </Appear>
      ))}
      <Appear index={5} style={{ alignSelf: 'stretch', gap: 10 }}>
        <Button title="Randevularım" onPress={() => router.replace('/randevular')} />
        <Button kind="secondary" title="Keşfet’e dön" onPress={() => router.replace('/')} />
      </Appear>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.ink, paddingHorizontal: 16, paddingBottom: 18, gap: 8 },
  headerBack: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', maxWidth: '90%' },
  progress: { flexDirection: 'row', gap: 8, marginTop: 6 },
  progressBar: { height: 4, borderRadius: 2, backgroundColor: colors.dark2 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.surface2 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  day: { width: 64, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center' },
  dayOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: '23%', minHeight: 52, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  slotOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
  whom: { flex: 1, minHeight: 46, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  whomOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  input: { minHeight: 50, paddingHorizontal: 14, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.sm, fontFamily: fonts.regular, fontSize: 16, color: colors.ink },
  doneIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  bottomBar: {
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
});
