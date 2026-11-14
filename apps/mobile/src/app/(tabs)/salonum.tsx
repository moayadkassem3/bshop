import { Redirect, router, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { AlarmSetup } from '@/components/AlarmSetup';
import { Icon, type IconName } from '@/components/Icon';
import { Appear, SkeletonList } from '@/components/motion';
import { ShopPicker } from '@/components/ShopPicker';
import { Alert, Badge, Button, Card, Empty, Screen, Text } from '@/components/ui';
import { api, errorMessage, WEB_URL } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import { daysLeft, formatDuration, formatFullDate, formatPrice, formatTime, greeting, turkeyDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { colors, radius, themed } from '@/lib/theme';
import type { BusinessShop, ShopAppointment } from '@/lib/types';
import { usePolling } from '@/lib/usePolling';

const LIVE = new Set<ShopAppointment['status']>(['pending', 'offered', 'confirmed']);

/**
 * Salonum (business home, as on the website): today at a glance, the salon's
 * page and sharing, and its shortcuts. Facts only about the subscription
 * (store rules, CLAUDE.md): no prices, no buy or "pay on the website" wording.
 */
export default function SalonumScreen() {
  const { me, business } = useSession();
  const { shops, shop, selectShop, error: shopsError } = useBusinessShops();
  const [items, setItems] = useState<ShopAppointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!shop) return;
    const from = new Date(`${turkeyDate(new Date())}T00:00:00+03:00`);
    const to = new Date(Date.now() + 365 * 86_400_000);
    try {
      setItems(await api<ShopAppointment[]>(`/staff/shops/${shop.id}/appointments?from=${from.toISOString()}&to=${to.toISOString()}`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [shop]);
  const { refreshing, refresh } = usePolling(load);

  if (!me) return <SignInFirst />;
  // A customer session never stays on a business screen (e.g. after the mode was corrected).
  if (!business) return <Redirect href="/" />;
  const now = Date.now();
  const today = turkeyDate(new Date());
  const owner = shop?.role === 'owner';
  const waiting = items?.filter((a) => a.status === 'pending') ?? [];
  const todays = items?.filter((a) => LIVE.has(a.status) && turkeyDate(new Date(a.starts_at)) === today) ?? [];
  const next = todays.filter((a) => new Date(a.ends_at).getTime() > now).slice(0, 5);

  return (
    <Screen title="Salonum" header={<ShopPicker shops={shops} shop={shop} onSelect={selectShop} />} onRefresh={refresh} refreshing={refreshing}>
      {shopsError || error ? <Alert text={(shopsError || error)!} /> : null}
      {shops && shops.length === 0 ? <Empty title="Bu hesap henüz bir işletmeye bağlı değil." /> : null}
      {!shops && !shopsError ? <SkeletonList rows={3} /> : null}
      {shop ? (
        <>
          <Notice shop={shop} />
          <AlarmSetup />
          {/* Today at a glance (founder's design, 14 November 2026): a greeting, two tiles, the
              requests waiting and the next appointment. */}
          <Appear>
            <Card style={{ gap: 14, padding: 18 }}>
              <View style={{ gap: 2 }}>
                <Text size={26} weight="heavy" style={{ letterSpacing: -0.4 }}>
                  {greeting()}
                  {me.first_name ? `, ${me.first_name}` : ''}
                </Text>
                <Text color={colors.muted}>{!items ? ' ' : todays.length ? 'Bugünün planı hazır.' : 'Bugün için randevu yok.'}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Tile value={items ? todays.length : null} label="Randevu" icon="randevular" tone="info" onPress={() => router.push('/randevular?tab=takvim')} />
                <Tile value={items ? waiting.length : null} label="Bekleyen talep" icon="clock" tone="warning" onPress={() => router.push('/randevular')} />
              </View>
              {waiting.length > 0 ? (
                <Pressable onPress={() => router.push('/randevular')} style={({ pressed }) => [styles.requests, pressed && { opacity: 0.85 }]} accessibilityRole="button">
                  <Icon name="clock" size={20} color={colors.warning} strokeWidth={2.2} />
                  <Text weight="bold" color={colors.warning} style={{ flex: 1 }}>
                    {waiting.length} yeni randevu talebi
                  </Text>
                  <Text weight="bold" color={colors.primary}>
                    İncele
                  </Text>
                  <Icon name="chevron" size={16} color={colors.primary} strokeWidth={2.4} />
                </Pressable>
              ) : null}
              <View style={styles.nextHead}>
                <Text size={18} weight="heavy">
                  Sıradaki randevu
                </Text>
                <Pressable onPress={() => router.push('/randevular?tab=takvim')} hitSlop={10}>
                  <Text weight="bold" color={colors.primary}>
                    Tümünü gör
                  </Text>
                </Pressable>
              </View>
              {!items && !error ? <SkeletonList rows={1} /> : null}
              {items && !next[0] ? <Text color={colors.muted}>Bugün başka randevu yok.</Text> : null}
              {next[0] ? <NextCard a={next[0]} /> : null}
            </Card>
          </Appear>

          <Text size={20} weight="heavy" style={{ marginTop: 8 }}>
            Salonunuz
          </Text>
          {shop.visible ? (
            <Appear index={2}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Müşteri gözüyle gör" onPress={() => router.push(`/salon/${shop.slug}`)} style={{ flex: 1 }} />
                <ShareButton shop={shop} />
              </View>
            </Appear>
          ) : null}
          <Appear index={3}>
            <ShortcutGroups owner={owner} />
          </Appear>
        </>
      ) : null}
    </Screen>
  );
}

/** The salon's state in plain words, only when customers cannot see it or a trial is about to end. */
function Notice({ shop }: { shop: BusinessShop }) {
  const owner = shop.role === 'owner';
  const open = () => owner && router.push('/isletme/abonelik');
  if (shop.suspended_at) return <NoticeCard tone="danger" title="Salonunuz yayından kaldırıldı" text={shop.suspended_reason ?? undefined} onPress={open} />;
  if (!shop.visible) {
    return (
      <NoticeCard
        tone="danger"
        title="Salonunuz müşterilere görünmüyor."
        text={shop.subscription_status === 'trial' ? 'Ücretsiz deneme süreniz bitti. Mevcut randevularınız geçerli.' : 'Mevcut randevularınız geçerli.'}
        onPress={open}
      />
    );
  }
  const days = daysLeft(shop.current_period_end);
  if (shop.subscription_status === 'trial' && days > 0 && days <= 3) return <NoticeCard tone="warning" title={`Ücretsiz denemenizin bitmesine ${days} gün kaldı.`} onPress={open} />;
  if (shop.subscription_status === 'past_due')
    return (
      <NoticeCard
        tone="warning"
        title="Aboneliğinizin süresi doldu."
        text={shop.grace_until ? `Salonunuz ${formatFullDate(shop.grace_until)} tarihine kadar görünür kalacak.` : undefined}
        onPress={open}
      />
    );
  return null;
}

function NoticeCard(props: { tone: 'danger' | 'warning'; title: string; text?: string; onPress: () => void }) {
  const soft = props.tone === 'danger' ? colors.dangerSoft : colors.warningSoft;
  const fg = props.tone === 'danger' ? colors.danger : colors.warning;
  return (
    <Appear>
      <Pressable onPress={props.onPress} style={[styles.notice, { backgroundColor: soft }]}>
        <Text weight="bold" color={fg}>
          {props.title}
        </Text>
        {props.text ? (
          <Text size={14} color={colors.ink2}>
            {props.text}
          </Text>
        ) : null}
      </Pressable>
    </Appear>
  );
}

/** "Paylaş": the salon's link through the phone's share menu (WhatsApp, Instagram, ...). */
function ShareButton({ shop }: { shop: BusinessShop }) {
  const link = `${WEB_URL}/${shop.slug}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Paylaş"
      onPress={() => Share.share({ message: `${shop.name}: randevu almak için ${link}`, url: link, title: shop.name }).catch(() => undefined)}
      style={({ pressed }) => [styles.share, pressed && { opacity: 0.8 }]}
    >
      <Icon name="share" size={18} color={colors.ink} strokeWidth={2.2} />
      <Text weight="bold">Paylaş</Text>
    </Pressable>
  );
}

type ShortcutItem = { icon: IconName; label: string; hint: string; path: Href };

/**
 * The salon's tools (founder, 8 November 2026; as on the website). Owners and co-owners see four
 * groups as separate cards: promote the salon, see how it is doing, set it up, the subscription.
 * Staff see the same four cards; their subscription page is read-only (founder, 14 November 2026).
 */
function ShortcutGroups({ owner }: { owner: boolean }) {
  const groups: (ShortcutItem | false)[][] = [
    [
      { icon: 'map', label: 'Haritada gör', hint: 'Salonunuz ve çevredeki salonlar', path: '/isletme/harita' },
      { icon: 'qr', label: 'QR kod', hint: 'Salonunuza asın, müşteriler okutup randevu alsın', path: '/isletme/qr' },
      { icon: 'camera', label: 'Kesim fotoğrafı paylaş', hint: 'Popüler kesimler’de görünür', path: '/isletme/kesimler' },
    ],
    [
      owner
        ? { icon: 'chart', label: 'İstatistikler', hint: 'Sayfa ziyaretleri ve randevular, ay ay', path: '/isletme/istatistikler' }
        : { icon: 'chart', label: 'İstatistiklerim', hint: 'Sayfa ziyaretleri ve randevularınız, ay ay', path: '/isletme/istatistikler' },
      { icon: 'star', label: 'Değerlendirmeler', hint: owner ? 'Müşteri puanları ve yanıtlarınız' : 'Müşterilerin salona verdiği puanlar', path: '/isletme/degerlendirmeler' },
    ],
    [
      { icon: 'clock', label: 'Çalışma saatleri', hint: owner ? 'Ekibin haftalık saatleri ve molaları' : 'Haftalık saatleriniz ve molalarınız', path: '/isletme/calisma-saatleri' },
      { icon: 'settings', label: 'Salon bilgileri', hint: owner ? 'Adres, fotoğraflar, hizmetler, personel' : 'Salon, verdiğiniz hizmetler, ekip', path: '/isletme/ayarlar' },
    ],
    [{ icon: 'card', label: owner ? 'Aboneliğim' : 'Abonelik', hint: owner ? 'Paketiniz ve abonelik durumunuz' : 'Salonun paketi ve abonelik durumu', path: '/isletme/abonelik' }],
  ];
  const shown = groups.map((g) => g.filter((item): item is ShortcutItem => Boolean(item))).filter((g) => g.length);
  // Staff get the same separate cards as owners now that they have Salon bilgileri too (founder, 14 November 2026).
  const cards = shown;
  return (
    <View style={{ gap: 12 }}>
      {cards.map((items, i) => (
        <Card key={i} style={{ padding: 4 }}>
          {items.map((item, j) => (
            <Shortcut key={item.label} icon={item.icon} label={item.label} hint={item.hint} onPress={() => router.push(item.path)} last={j === items.length - 1} />
          ))}
        </Card>
      ))}
    </View>
  );
}

function Shortcut(props: { icon: IconName; label: string; hint: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={props.onPress} style={({ pressed }) => [styles.shortcut, !props.last && styles.shortcutLine, pressed && { backgroundColor: colors.surface2 }]}>
      <View style={styles.shortcutIcon}>
        <Icon name={props.icon} size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text weight="bold">{props.label}</Text>
        <Text size={13} color={colors.muted}>
          {props.hint}
        </Text>
      </View>
      <Icon name="chevron" size={18} color={colors.muted} />
    </Pressable>
  );
}

function Tile(props: { value: number | null; label: string; icon: IconName; tone: 'info' | 'warning'; onPress: () => void }) {
  const fg = props.tone === 'info' ? colors.primary : colors.warning;
  const bg = props.tone === 'info' ? colors.primarySoft : colors.warningSoft;
  return (
    <Pressable onPress={props.onPress} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={`${props.value ?? ''} ${props.label}`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Text size={34} weight="heavy">
          {props.value ?? '–'}
        </Text>
        <View style={[styles.tileIcon, { backgroundColor: bg }]}>
          <Icon name={props.icon} size={20} color={fg} strokeWidth={2} />
        </View>
      </View>
      <Text size={14} weight="semibold" color={colors.ink2}>
        {props.label}
      </Text>
    </Pressable>
  );
}

const STATUS: Partial<Record<ShopAppointment['status'], { label: string; tone: 'success' | 'warning' | 'info' }>> = {
  confirmed: { label: 'Onaylandı', tone: 'success' },
  pending: { label: 'Onay bekliyor', tone: 'warning' },
  offered: { label: 'Yeni saat önerildi', tone: 'info' },
};

/** The next appointment, large: time, customer, services and length, status, who and the price. */
function NextCard({ a }: { a: ShopAppointment }) {
  const minutes = Math.round((new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60_000);
  const status = STATUS[a.status];
  const tone = status?.tone === 'success' ? [colors.successSoft, colors.success] : status?.tone === 'warning' ? [colors.warningSoft, colors.warning] : [colors.primarySoft, colors.primary];
  return (
    <Pressable onPress={() => router.push('/randevular?tab=takvim')} style={({ pressed }) => [styles.nextCard, pressed && { opacity: 0.9 }]} accessibilityRole="button">
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text size={18} weight="heavy">
            {formatTime(a.starts_at)} – {formatTime(a.ends_at)}
          </Text>
          <Text size={17} weight="bold" numberOfLines={1}>
            {a.guest_name ?? a.customer_name}
          </Text>
          <Text size={14} color={colors.muted} numberOfLines={2}>
            {(a.services ?? []).map((x) => x.name).join(' + ')} · {formatDuration(minutes)}
          </Text>
        </View>
        {status ? (
          <View style={[styles.status, { backgroundColor: tone[0] }]}>
            <View style={[styles.dot, { backgroundColor: tone[1] }]} />
            <Text size={13} weight="bold" color={tone[1]}>
              {status.label}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.nextFoot}>
        <Icon name="profil" size={18} color={colors.muted} />
        <Text weight="semibold" color={colors.ink2} style={{ flex: 1 }} numberOfLines={1}>
          {a.staff_name}
        </Text>
        {a.total_price_kurus > 0 ? (
          <Text size={17} weight="heavy">
            {formatPrice(a.total_price_kurus, a.price_is_starting_from)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function SignInFirst() {
  return (
    <Screen title="Giriş yapın">
      <Empty title="Devam etmek için giriş yapın" text="Telefon numaranızla Profil’den giriş yapabilirsiniz.">
        <Button title="Giriş yap" onPress={() => router.push('/profil')} style={{ alignSelf: 'stretch', marginTop: 8 }} />
      </Empty>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    tile: { flex: 1, gap: 2, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
    tileIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    requests: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: radius.sm, backgroundColor: colors.warningSoft },
    nextHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
    nextCard: {
      gap: 12,
      padding: 14,
      paddingLeft: 16,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.line,
      borderLeftWidth: 5,
      borderLeftColor: colors.primary,
      backgroundColor: colors.surface,
    },
    nextFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
    status: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
    dot: { width: 8, height: 8, borderRadius: 4 },
    notice: { padding: 14, borderRadius: radius.md, gap: 4 },
    share: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 50,
      paddingHorizontal: 18,
      borderRadius: radius.sm,
      borderWidth: 1.5,
      borderColor: colors.line,
      backgroundColor: colors.surface,
    },
    shortcut: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12, borderRadius: radius.sm },
    shortcutLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
    shortcutIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  }),
);
