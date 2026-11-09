import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BackLink } from '@/components/BackLink';
import { Icon } from '@/components/Icon';
import { Appear, SkeletonList } from '@/components/motion';
import { ShopPicker } from '@/components/ShopPicker';
import { Alert, Card, Screen, Text } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import { colors, radius, themed } from '@/lib/theme';

type Source = 'kesfet' | 'kesimler' | 'qr' | 'diger';
type ShopStats = {
  month: string;
  today: string;
  /** 'mine': a staff member's own appointments, without the salon's page visits (founder, 9 November 2026). */
  scope: 'shop' | 'mine';
  views: { total: number; bySource: Record<Source, number>; daily: { date: string; views: number }[] } | null;
  appointments: { total: number; completed: number; upcoming: number; noShow: number; cancelled: number };
};

const SOURCES: { key: Source; label: string }[] = [
  { key: 'kesfet', label: 'Keşfet (harita ve liste)' },
  { key: 'kesimler', label: 'Popüler kesimler' },
  { key: 'qr', label: 'QR kod' },
  { key: 'diger', label: 'Bağlantı ve diğer' },
];
const MONTHS_BACK = 24;
const monthName = (month: string) => new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
const dayName = (date: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const n = (v: number) => v.toLocaleString('tr-TR');

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** A round axis top at or above the largest value (5, 10, 20, 30, 50, 100 ...). */
function niceMax(max: number): number {
  if (max <= 5) return 5;
  const step = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 3, 5, 10]) if (m * step >= max) return m * step;
  return 10 * step;
}

/**
 * İstatistikler (as on the website). Staff see their own appointments only (İstatistiklerim). For owners: a month of visits to the
 * salon's page (by day and by where visitors came from) and its appointments.
 */
export default function StatsScreen() {
  const { shops, shop, selectShop, error: shopsError } = useBusinessShops();
  const [month, setMonth] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [stats, setStats] = useState<ShopStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owner = shop?.role === 'owner';

  useEffect(() => {
    setMonth(null);
    setCurrent(null);
    setStats(null);
  }, [shop?.id]);

  useEffect(() => {
    if (!shop) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<ShopStats>(`/staff/shops/${shop.id}/stats${month ? `?month=${month}` : ''}`)
      .then((s) => {
        if (cancelled) return;
        setStats(s);
        setCurrent((c) => c ?? s.month);
      })
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [shop, month]);

  const shown = stats?.month ?? month;
  const oldest = current ? shiftMonth(current, -MONTHS_BACK) : null;

  return (
    <Screen
      title={shop && !owner ? 'İstatistiklerim' : 'İstatistikler'}
      back={<BackLink label="Salonum" />}
      header={
        <>
          <ShopPicker shops={shops} shop={shop} onSelect={selectShop} />
          {shop && shown ? (
            <View style={styles.monthBar}>
              <Pressable accessibilityLabel="Önceki ay" disabled={loading || shown === oldest} onPress={() => setMonth(shiftMonth(shown, -1))} style={styles.monthButton} hitSlop={6}>
                <Icon name="back" size={20} color={shown === oldest ? colors.darkMuted : colors.white} strokeWidth={2.2} />
              </Pressable>
              <Text weight="bold" color={colors.white} style={{ flex: 1, textAlign: 'center' }}>
                {monthName(shown)}
              </Text>
              <Pressable accessibilityLabel="Sonraki ay" disabled={loading || shown === current} onPress={() => setMonth(shiftMonth(shown, 1))} style={styles.monthButton} hitSlop={6}>
                <Icon name="chevron" size={20} color={shown === current ? colors.darkMuted : colors.white} strokeWidth={2.2} />
              </Pressable>
            </View>
          ) : null}
        </>
      }
    >
      {shopsError || error ? <Alert text={(shopsError || error)!} /> : null}
      {shop && !stats && !error ? <SkeletonList rows={3} /> : null}
      {shop && stats ? (
        // The previous month stays on screen, dimmed, while the next one loads.
        <View style={{ gap: 12, opacity: loading ? 0.5 : 1 }}>
          <Overview stats={stats} />
          {stats.views ? (
            <>
              <Appear index={2}>
                <Sources stats={stats} />
              </Appear>
              <Appear index={3}>
                <Daily key={stats.month} stats={stats} />
              </Appear>
            </>
          ) : null}
          <Text size={12} color={colors.muted}>
            {stats.scope === 'mine' ? 'Randevular yalnızca size atananlardır; ziyaretler salonun tamamı içindir. ' : ''}
            Ziyaretler oturum başına bir kez sayılır; salon ekibinin kendi ziyaretleri sayılmaz.
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

function Overview({ stats }: { stats: ShopStats }) {
  const a = stats.appointments;
  const thisMonth = stats.month === stats.today.slice(0, 7);
  return (
    <>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Appear style={{ flex: 1 }}>
          <Card style={styles.tile}>
            <Text size={13} weight="semibold" color={colors.ink2}>
              {stats.views ? 'Salon sayfası ziyareti' : 'Tamamlanan'}
            </Text>
            <Text size={34} weight="heavy">
              {n(stats.views ? stats.views.total : a.completed)}
            </Text>
            <Text size={12} color={colors.muted}>
              {stats.views ? (thisMonth ? 'Ay başından bugüne' : 'Ay boyunca') : a.total ? `Randevularınızın %${Math.round((a.completed / a.total) * 100)}’i` : 'Bu ay henüz yok'}
            </Text>
          </Card>
        </Appear>
        <Appear index={1} style={{ flex: 1 }}>
          <Card style={styles.tile}>
            <Text size={13} weight="semibold" color={colors.ink2}>
              {stats.scope === 'mine' ? 'Randevularınız' : 'Randevu'}
            </Text>
            <Text size={34} weight="heavy">
              {n(a.total)}
            </Text>
            <Text size={12} color={colors.muted}>
              {a.completed} tamamlandı{a.upcoming ? ` · ${a.upcoming} ${thisMonth ? 'yaklaşan' : 'kapanmadı'}` : ''}
            </Text>
          </Card>
        </Appear>
      </View>
      {a.cancelled > 0 || a.noShow > 0 ? (
        <Text size={13} color={colors.muted}>
          {[a.cancelled > 0 ? `${a.cancelled} iptal (toplama dahil değil)` : null, a.noShow > 0 ? `${a.noShow} müşteri gelmedi` : null].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </>
  );
}

/** Visits by where they came from: one bar per source, in a fixed order, one colour. */
function Sources({ stats }: { stats: ShopStats }) {
  const total = stats.views!.total;
  const max = Math.max(1, ...SOURCES.map((s) => stats.views!.bySource[s.key] ?? 0));
  return (
    <Card style={{ gap: 12 }}>
      <Text size={17} weight="heavy">
        Ziyaretler nereden geldi
      </Text>
      {SOURCES.map((s) => {
        const v = stats.views!.bySource[s.key] ?? 0;
        return (
          <View key={s.key} style={{ gap: 4 }}>
            <Text size={14} color={colors.ink2}>
              {s.label}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={styles.track}>{v > 0 ? <View style={[styles.bar, { width: `${(v / max) * 100}%` }]} /> : null}</View>
              <Text size={13} weight="semibold" style={{ minWidth: 64, textAlign: 'right' }}>
                {n(v)}
                {v > 0 ? <Text size={13} color={colors.muted}>{` · %${Math.round((v / total) * 100)}`}</Text> : null}
              </Text>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

/** Visits per day: one column per day; tap a day for its number. */
function Daily({ stats }: { stats: ShopStats }) {
  const days = stats.views!.daily;
  const [picked, setPicked] = useState<number | null>(null);
  const top = niceMax(Math.max(...days.map((d) => d.views), 0));
  const best = days.reduce<{ date: string; views: number } | null>((b, d) => (d.views > (b?.views ?? 0) ? d : b), null);
  const active = picked !== null ? days[picked] : null;
  return (
    <Card style={{ gap: 10 }}>
      <Text size={17} weight="heavy">
        Günlük ziyaret
      </Text>
      <Text size={13} color={colors.muted}>
        {active ? `${dayName(active.date)}: ${active.views} ziyaret` : best ? `En yoğun gün: ${dayName(best.date)} (${best.views})` : 'Bu ay henüz ziyaret yok.'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <View style={{ justifyContent: 'space-between', height: 140 }}>
          <Text size={11} color={colors.muted}>
            {top}
          </Text>
          <Text size={11} color={colors.muted}>
            0
          </Text>
        </View>
        <View style={styles.plot}>
          {days.map((d, i) => (
            <Pressable
              key={d.date}
              onPress={() => setPicked(picked === i ? null : i)}
              style={[styles.slot, picked === i && { backgroundColor: colors.primarySoft }]}
              accessibilityLabel={`${dayName(d.date)}: ${d.views} ziyaret`}
            >
              {d.views > 0 ? <View style={[styles.col, { height: `${(d.views / top) * 100}%` }, picked === i && { backgroundColor: colors.night }]} /> : null}
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 22 }}>
        <Text size={11} color={colors.muted}>
          {Number(days[0]?.date.slice(8))}
        </Text>
        {days.length > 2 ? (
          <Text size={11} color={colors.muted}>
            {Number(days[days.length - 1]!.date.slice(8))}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    monthBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, padding: 4, borderRadius: radius.sm, backgroundColor: colors.dark2 },
    monthButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
    tile: { gap: 2, minHeight: 120 },
    track: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.surface2, overflow: 'hidden' },
    bar: { height: 10, borderRadius: 5, backgroundColor: colors.primary },
    plot: { flex: 1, height: 140, flexDirection: 'row', alignItems: 'flex-end', gap: 1, borderBottomWidth: 1, borderTopWidth: 1, borderColor: colors.line, borderStyle: 'dashed' },
    slot: { flex: 1, height: '100%', justifyContent: 'flex-end', borderRadius: 2 },
    col: { width: '100%', borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: colors.primary },
  }),
);
