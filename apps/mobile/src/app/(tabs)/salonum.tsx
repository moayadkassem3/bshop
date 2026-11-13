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
import { daysLeft, formatFullDate, formatTime, turkeyDate } from '@/lib/format';
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
          <Text size={20} weight="heavy">
            Bugün
          </Text>
          <Appear>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Tile value={items ? waiting.length : null} label="Bekleyen talep" alert={waiting.length > 0} onPress={() => router.push('/randevular')} />
              <Tile value={items ? todays.length : null} label="Bugünkü randevu" onPress={() => router.push('/randevular?tab=takvim')} />
            </View>
          </Appear>
          {!items && !error ? <SkeletonList rows={1} /> : null}
          {items ? (
            <Appear index={1}>
              <Card style={{ gap: 12 }}>
                <Text weight="bold">Sıradaki randevular</Text>
                {next.length === 0 ? (
                  <Text color={colors.muted}>Bugün başka randevu yok.</Text>
                ) : (
                  next.map((a) => (
                    <View key={a.id} style={styles.nextRow}>
                      <Text weight="bold" style={{ width: 52 }}>
                        {formatTime(a.starts_at)}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text weight="semibold" numberOfLines={1}>
                          {a.guest_name ?? a.customer_name}
                        </Text>
                        <Text size={13} color={colors.muted} numberOfLines={1}>
                          {(a.services ?? []).map((s) => s.name).join(' + ')}
                          {owner ? ` · ${a.staff_name}` : ''}
                        </Text>
                      </View>
                      {a.status !== 'confirmed' ? <Badge label={a.status === 'pending' ? 'Onay bekliyor' : 'Öneri'} tone="warning" /> : null}
                    </View>
                  ))
                )}
                <Pressable onPress={() => router.push('/randevular')} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
                  <Text size={14} weight="bold" color={colors.primary}>
                    Talepler ve takvim ›
                  </Text>
                </Pressable>
              </Card>
            </Appear>
          ) : null}

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
 * Staff see the first three groups the same way, without the subscription (founder, 14 November 2026).
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
    [owner && { icon: 'card', label: 'Aboneliğim', hint: 'Paketiniz ve abonelik durumunuz', path: '/isletme/abonelik' }],
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

function Tile(props: { value: number | null; label: string; alert?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={({ pressed }) => [styles.tile, props.alert && styles.tileAlert, pressed && { opacity: 0.85 }]}>
      <Text size={36} weight="heavy" color={props.alert ? colors.warning : colors.ink}>
        {props.value ?? '–'}
      </Text>
      <Text size={14} weight="semibold" color={colors.ink2}>
        {props.label}
      </Text>
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
    tile: { flex: 1, padding: 16, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
    tileAlert: { borderColor: colors.warningLine, backgroundColor: colors.warningSoft },
    nextRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
