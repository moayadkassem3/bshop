import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SalonPush } from '../../modules/salon-push';
import { Icon } from '@/components/Icon';
import { LogoMark } from '@/components/LogoMark';
import { Appear, PopIn } from '@/components/motion';
import { Text } from '@/components/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { formatLongDate, formatTime, TZ } from '@/lib/format';
import { ANSWERABLE_KINDS } from '@/lib/push';
import { useSession } from '@/lib/session';
import { colors, radius, themed } from '@/lib/theme';

type Params = {
  kind?: string;
  title?: string;
  body?: string;
  shopId?: string;
  appointmentId?: string;
  notificationId?: string;
  action?: string;
  customer?: string;
  services?: string;
  startsAt?: string;
  deadlineAt?: string;
};
type Answer = 'confirm' | 'decline';
/** open → (Onayla/Reddet) → undoable for a few seconds → sending → done; Geri al returns to open. */
type Phase = { step: 'open' } | { step: 'undo' | 'sending' | 'done'; answer: Answer };

/** How long Geri al stays possible before the answer is sent. */
const UNDO_MS = 5000;

/** The new-appointment screen's own tones, on the app's navy (colors.ink). */
const C = {
  card: '#141b29',
  cardLine: 'rgba(255,255,255,0.07)',
  tile: '#1b2740',
  avatar: '#22304d',
  iconBox: '#1c2433',
  pill: '#161d2b',
  amber: '#f2b84b',
  amberBg: '#1f1a0f',
  amberLine: '#33290f',
  amberText: '#f4e2b8',
  red: '#f07f7f',
  redBg: '#1b1317',
  redLine: '#3b2228',
  green: '#2f9e6b',
  greenBg: '#0f2119',
  greenLine: '#1f4733',
  greenText: '#a8e6c4',
};

/**
 * The new-appointment screen (phase 3), opened by the alarm: full screen, over
 * the lock screen if the phone is locked, or by the notification's Onayla /
 * Reddet buttons. It shows the customer, the day and time and the services; a
 * request is answered here, with a few seconds to take the answer back (Geri al)
 * before it is sent. The ringing stops when this screen opens an answer or closes.
 */
export default function AlarmScreen() {
  const p = useLocalSearchParams<Params>();
  const insets = useSafeAreaInsets();
  const { business, switchMode } = useSession();
  const [phase, setPhase] = useState<Phase>({ step: 'open' });
  const [error, setError] = useState<string | null>(null);
  const answerable = ANSWERABLE_KINDS.has(p.kind ?? '') && Boolean(p.shopId && p.appointmentId);
  const started = useRef(false);
  const pending = useRef<Answer | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const who = customerName(p.customer);
  const hasDetails = Boolean(p.startsAt);

  const silence = () => {
    if (p.notificationId) SalonPush?.dismiss(Number(p.notificationId));
  };

  async function send(answer: Answer) {
    pending.current = null;
    setPhase({ step: 'sending', answer });
    const path = `/staff/shops/${p.shopId}/appointments/${p.appointmentId}/${answer}`;
    try {
      try {
        await api(path, { method: 'POST', body: {} });
      } catch (err) {
        // The app was in customer mode: business mode answers it.
        if (!(err instanceof ApiError && err.status === 403) || business) throw err;
        await switchMode('business');
        await api(path, { method: 'POST', body: {} });
      }
      setPhase({ step: 'done', answer });
      SalonPush?.releaseLockScreen();
    } catch (err) {
      setError(errorMessage(err));
      setPhase({ step: 'open' });
    }
  }

  function answer(a: Answer) {
    silence();
    setError(null);
    pending.current = a;
    setPhase({ step: 'undo', answer: a });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void send(a), UNDO_MS);
  }

  function undo() {
    if (timer.current) clearTimeout(timer.current);
    pending.current = null;
    setPhase({ step: 'open' });
  }

  /** Leaving with an answer still in its Geri al time sends it at once. */
  function flush() {
    if (!pending.current) return;
    if (timer.current) clearTimeout(timer.current);
    void send(pending.current);
  }

  const close = (to?: '/randevular') => {
    flush();
    silence();
    SalonPush?.releaseLockScreen();
    if (to) router.replace(to);
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  // The phone going to the background or this screen closing never loses an answer.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') flush();
    });
    return () => {
      sub.remove();
      flush();
      silence();
      SalonPush?.releaseLockScreen();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Onayla / Reddet tapped on the notification itself.
  useEffect(() => {
    if (started.current || !answerable) return;
    started.current = true;
    if (p.action === 'onayla') answer('confirm');
    else if (p.action === 'reddet') answer('decline');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answered = phase.step !== 'open';
  const badge =
    p.kind === 'reminder'
      ? { label: 'Yanıt bekliyor', dot: C.amber }
      : p.kind === 'confirmed'
        ? { label: 'Yeni randevu', dot: C.green }
        : answerable
          ? { label: 'Yeni talep', dot: colors.primaryLight }
          : { label: 'Bildirim', dot: colors.primaryLight };
  const heading = !hasDetails ? (p.title ?? 'Yeni randevu') : p.kind === 'confirmed' ? `${who.name} randevu aldı` : `${who.name} randevu istiyor`;
  const subtitle = !hasDetails
    ? null
    : p.kind === 'confirmed'
      ? 'Randevu onaylandı; yanıt vermeniz gerekmiyor.'
      : p.kind === 'reminder'
        ? 'Bu talep hâlâ yanıtınızı bekliyor.'
        : 'Talebi inceleyip yanıtlayın.';

  return (
    <View style={[styles.page, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.top}>
        <View style={styles.pill}>
          <Dot color={badge.dot} />
          <Text size={14} weight="semibold" color={colors.white}>
            {badge.label}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => close()} hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Text size={15} weight="medium" color={colors.darkMuted}>
            {answerable && !answered ? 'Sonra yanıtla' : 'Kapat'}
          </Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 18, paddingTop: 22, paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 6 }}>
          <Text size={28} weight="heavy" color={colors.white} style={{ letterSpacing: -0.5, lineHeight: 34 }}>
            {heading}
          </Text>
          {subtitle ? (
            <Text size={15} color={colors.darkMuted}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <Appear>
          <View style={styles.card}>
            {hasDetails ? (
              <>
                <View style={styles.row}>
                  <View style={styles.avatar}>
                    <Text size={17} weight="bold" color={colors.primaryLight}>
                      {initials(who.name)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text size={17} weight="bold" color={colors.white} numberOfLines={1}>
                      {who.name}
                    </Text>
                    <Text size={14} color={colors.darkMuted} numberOfLines={1}>
                      {who.bookedBy ? `${who.bookedBy} adına` : 'Müşteri'}
                    </Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.row}>
                  <DateTile iso={p.startsAt!} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text size={34} weight="heavy" color={colors.white} style={{ letterSpacing: -0.8 }}>
                      {formatTime(p.startsAt!)}
                    </Text>
                    <Text size={15} color={colors.darkMuted}>
                      {formatLongDate(p.startsAt!)}
                    </Text>
                  </View>
                </View>
                {p.services ? (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.row}>
                      <View style={styles.iconBox}>
                        <LogoMark size={24} color={colors.white} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text size={13} color={colors.darkMuted}>
                          Hizmet
                        </Text>
                        <Text size={16} weight="bold" color={colors.white}>
                          {p.services}
                        </Text>
                      </View>
                    </View>
                  </>
                ) : null}
              </>
            ) : (
              <Text size={16} color={colors.white} style={{ lineHeight: 23 }}>
                {p.body ?? ''}
              </Text>
            )}
          </View>
        </Appear>

        {answerable && !answered && p.deadlineAt ? (
          <Appear index={1}>
            <View style={styles.deadline}>
              <Icon name="clock" size={20} color={C.amber} />
              <Text size={15} color={C.amberText} style={{ flex: 1, lineHeight: 21 }}>
                Yanıt vermezseniz{' '}
                <Text size={15} weight="bold" color={colors.white}>
                  {formatTime(p.deadlineAt)}
                </Text>{' '}
                saatinde otomatik onaylanır.
              </Text>
            </View>
          </Appear>
        ) : null}

        {error ? (
          <View style={[styles.deadline, { backgroundColor: C.redBg, borderColor: C.redLine }]}>
            <Text size={14} color={C.red} style={{ flex: 1 }}>
              {error}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={{ gap: 14 }}>
        {answerable && phase.step === 'open' ? (
          <View style={styles.buttons}>
            <Pressable accessibilityRole="button" onPress={() => answer('decline')} style={({ pressed }) => [styles.decline, pressed && styles.pressed]}>
              <Icon name="close" size={20} color={C.red} strokeWidth={2.4} />
              <Text size={17} weight="bold" color={C.red}>
                Reddet
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => answer('confirm')} style={({ pressed }) => [styles.confirm, pressed && styles.pressed]}>
              <Icon name="check" size={20} color={colors.white} strokeWidth={2.4} />
              <Text size={17} weight="bold" color={colors.white}>
                Onayla
              </Text>
            </Pressable>
          </View>
        ) : null}
        {phase.step !== 'open' ? <AnswerBar phase={phase} when={p.startsAt} onUndo={undo} /> : null}
        <Pressable accessibilityRole="link" onPress={() => close('/randevular')} hitSlop={8} style={({ pressed }) => [styles.allLink, pressed && { opacity: 0.6 }]}>
          <Text size={16} weight="medium" color={colors.darkMuted}>
            Tüm randevulara git
          </Text>
          <Icon name="chevron" size={16} color={colors.darkMuted} />
        </Pressable>
      </View>
    </View>
  );
}

/** "Randevu onaylandı · 7 Kasım · 10:00" with Geri al while it can still be taken back. */
function AnswerBar({ phase, when, onUndo }: { phase: Exclude<Phase, { step: 'open' }>; when?: string; onUndo: () => void }) {
  const ok = phase.answer === 'confirm';
  const reduced = useReducedMotion();
  const left = useSharedValue(1);
  useEffect(() => {
    if (phase.step === 'undo' && !reduced) {
      left.value = 1;
      left.value = withTiming(0, { duration: UNDO_MS, easing: Easing.linear });
    } else left.value = 0;
  }, [phase.step, reduced, left]);
  const progress = useAnimatedStyle(() => ({ width: `${left.value * 100}%` }));
  const detail = when ? `${new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'long' }).format(new Date(when))} · ${formatTime(when)}` : null;
  return (
    <PopIn>
      <View style={[styles.answer, ok ? { backgroundColor: C.greenBg, borderColor: C.greenLine } : { backgroundColor: C.redBg, borderColor: C.redLine }]} accessibilityLiveRegion="polite">
        <View style={[styles.answerIcon, { backgroundColor: ok ? C.green : '#b93a3a' }]}>
          <Icon name={ok ? 'check' : 'close'} size={20} color={colors.white} strokeWidth={2.6} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text size={17} weight="bold" color={ok ? C.greenText : '#f3c0c0'}>
            {ok ? 'Randevu onaylandı' : 'Talep reddedildi'}
          </Text>
          <Text size={14} color={ok ? '#7fb79a' : '#c99a9a'}>
            {phase.step === 'done' ? 'Müşteriye SMS ile bildirildi.' : phase.step === 'sending' ? 'Gönderiliyor…' : detail}
          </Text>
        </View>
        {phase.step === 'undo' ? (
          <Pressable accessibilityRole="button" onPress={onUndo} hitSlop={12} style={({ pressed }) => [{ paddingHorizontal: 6 }, pressed && { opacity: 0.6 }]}>
            <Text size={16} weight="bold" color={colors.white}>
              Geri al
            </Text>
          </Pressable>
        ) : null}
        {phase.step === 'undo' ? <Animated.View style={[styles.undoLine, { backgroundColor: ok ? C.green : '#b93a3a' }, progress]} /> : null}
      </View>
    </PopIn>
  );
}

/** "KAS / 7 / Cmt" */
function DateTile({ iso }: { iso: string }) {
  const d = new Date(iso);
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, ...o }).format(d);
  return (
    <View style={styles.tile}>
      <Text size={13} weight="bold" color={colors.primaryLight} style={{ letterSpacing: 1 }}>
        {part({ month: 'short' }).replace('.', '').toLocaleUpperCase('tr-TR')}
      </Text>
      <Text size={30} weight="heavy" color={colors.white} style={{ lineHeight: 34 }}>
        {part({ day: 'numeric' })}
      </Text>
      <Text size={13} weight="medium" color={colors.primaryLight}>
        {part({ weekday: 'short' }).replace('.', '')}
      </Text>
    </View>
  );
}

/** The badge's dot, gently pulsing while the screen waits for an answer. */
function Dot({ color }: { color: string }) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!reduced) pulse.value = withRepeat(withTiming(0.35, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [reduced, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }, style]} />;
}

/** "Ali Yılmaz (Ayşe Kaya adına)" → the guest, and who booked for them. */
function customerName(raw?: string): { name: string; bookedBy: string | null } {
  const text = (raw ?? '').trim();
  const guest = /^(.*) \((.*) adına\)$/.exec(text);
  if (guest) return { name: guest[1]!, bookedBy: guest[2]! };
  return { name: text || 'Müşteri', bookedBy: null };
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = (parts.length > 1 ? [parts[0]!, parts[parts.length - 1]!] : parts.slice(0, 1)).map((w) => w[0]!.toLocaleUpperCase('tr-TR'));
  return letters.join('') || '?';
}

const styles = themed(() =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.night, paddingHorizontal: 20 },
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: C.pill },
    card: { padding: 20, gap: 16, borderRadius: 22, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardLine },
    row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: C.avatar },
    divider: { height: 1, backgroundColor: C.cardLine },
    tile: { width: 70, paddingVertical: 8, borderRadius: 16, alignItems: 'center', backgroundColor: C.tile },
    iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.iconBox },
    deadline: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 18, borderRadius: 18, borderWidth: 1, backgroundColor: C.amberBg, borderColor: C.amberLine },
    buttons: { flexDirection: 'row', gap: 12 },
    decline: { flex: 1, height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18, borderWidth: 1, backgroundColor: C.redBg, borderColor: C.redLine },
    confirm: { flex: 1.45, height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18, backgroundColor: colors.primary },
    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
    answer: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 16, borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
    answerIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    undoLine: { position: 'absolute', left: 0, bottom: 0, height: 3 },
    allLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6 },
  }),
);
