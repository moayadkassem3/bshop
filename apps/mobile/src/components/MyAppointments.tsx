import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert as NativeAlert, Pressable, View } from 'react-native';
import { api, errorMessage } from '@/lib/api';
import { formatLongDate, formatPrice, formatTime } from '@/lib/format';
import { colors } from '@/lib/theme';
import type { CustomerAppointment } from '@/lib/types';
import { usePolling } from '@/lib/usePolling';
import { Alert, Badge, Button, Card, Chip, Empty, Loading, Screen, Text, type Tone } from './ui';

type When = 'upcoming' | 'past';

function status(a: CustomerAppointment): { label: string; tone: Tone } {
  switch (a.status) {
    case 'pending':
      return { label: 'Salon onayı bekleniyor', tone: 'warning' };
    case 'offered':
      return { label: 'Salon yeni saat önerdi', tone: 'warning' };
    case 'confirmed':
      return { label: 'Onaylandı', tone: 'success' };
    case 'declined':
      return { label: a.offered_from ? 'Önerilen saat kullanılmadı' : 'Salon kabul edemedi', tone: 'muted' };
    case 'cancelled':
      return { label: a.cancel_reason === 'customer_late' ? 'Geç iptal edildi' : a.cancel_reason?.startsWith('customer') ? 'İptal ettiniz' : 'Salon iptal etti', tone: 'muted' };
    case 'completed':
      return { label: 'Tamamlandı', tone: 'muted' };
    case 'no_show':
      return { label: 'Gelmediniz', tone: 'danger' };
  }
}

/** Randevularım (as on the website): upcoming and past visits; cancel, answer an offer, rate. */
export function MyAppointments() {
  const [items, setItems] = useState<CustomerAppointment[] | null>(null);
  const [when, setWhen] = useState<When>('upcoming');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api<CustomerAppointment[]>('/me/appointments'));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);
  const { refreshing, refresh } = usePolling(load, 30_000);

  const now = Date.now();
  const isUpcoming = (a: CustomerAppointment) => ['pending', 'offered', 'confirmed'].includes(a.status) && new Date(a.ends_at).getTime() > now;
  const shown = (items ?? []).filter((a) => (when === 'upcoming' ? isUpcoming(a) : !isUpcoming(a)));
  if (when === 'upcoming') shown.sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return (
    <Screen title="Randevularım" onRefresh={refresh} refreshing={refreshing}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Yaklaşan" on={when === 'upcoming'} onPress={() => setWhen('upcoming')} />
        <Chip label="Geçmiş" on={when === 'past'} onPress={() => setWhen('past')} />
      </View>
      {error ? <Alert text={error} /> : null}
      {!items && !error ? <Loading /> : null}
      {items && shown.length === 0 ? (
        <Empty title={when === 'upcoming' ? 'Yaklaşan randevunuz yok' : 'Geçmiş randevunuz yok'} text={when === 'upcoming' ? 'Keşfet’ten size yakın bir kuaför bulun.' : undefined}>
          {when === 'upcoming' ? <Button title="Kuaför keşfet" onPress={() => router.push('/')} style={{ alignSelf: 'stretch', marginTop: 8 }} /> : null}
        </Empty>
      ) : null}
      {shown.map((a) => (
        <AppointmentCard key={a.id} appointment={a} onChanged={load} />
      ))}
    </Screen>
  );
}

function AppointmentCard({ appointment: a, onChanged }: { appointment: CustomerAppointment; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const st = status(a);
  const upcoming = ['pending', 'confirmed'].includes(a.status) && new Date(a.starts_at).getTime() > Date.now();
  const late = a.status === 'confirmed' && new Date(a.starts_at).getTime() - Date.now() < a.cancellation_cutoff_minutes * 60_000;

  async function post(path: string, body?: unknown, key = path) {
    setBusy(key);
    setError(null);
    try {
      await api(`/me/appointments/${a.id}/${path}`, { method: 'POST', body: body ?? {} });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text weight="bold" size={16}>
            {formatLongDate(a.starts_at)} · {formatTime(a.starts_at)}
          </Text>
          <Pressable onPress={() => router.push(`/salon/${a.shop_slug}`)} hitSlop={4}>
            <Text size={17} weight="bold" color={colors.primary}>
              {a.shop_name}
            </Text>
          </Pressable>
          <Text color={colors.muted}>
            {a.staff_name}
            {a.guest_name ? ` · ${a.guest_name} için` : ''}
          </Text>
        </View>
        <Text weight="bold">{formatPrice(a.total_price_kurus, a.price_is_starting_from)}</Text>
      </View>
      <Text size={14} color={colors.ink2}>
        {(a.services ?? []).map((s) => s.name).join(' + ')}
      </Text>
      <Badge label={st.label} tone={st.tone} />
      {a.status === 'pending' && a.deadline_at ? (
        <Text size={13} color={colors.muted}>
          Yanıt gelmezse otomatik onaylanır. Otomatik onay saati: {formatTime(a.deadline_at)}
        </Text>
      ) : null}

      {a.status === 'offered' ? (
        <View style={{ gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.warningSoft }}>
          <Text size={14}>
            {a.offered_from ? `İstediğiniz ${formatLongDate(a.offered_from)} ${formatTime(a.offered_from)} dolu olduğu için salon bu saati önerdi. ` : ''}
            Yanıtınızı bekliyor{a.deadline_at ? ` (son: ${formatTime(a.deadline_at)})` : ''}.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Kabul et" onPress={() => void post('accept-offer')} busy={busy === 'accept-offer'} disabled={Boolean(busy)} style={{ flex: 1 }} />
            <Button kind="secondary" title="Uymuyor" onPress={() => void post('decline-offer')} busy={busy === 'decline-offer'} disabled={Boolean(busy)} style={{ flex: 1 }} />
          </View>
        </View>
      ) : null}

      {upcoming ? (
        <Button
          kind="ghost"
          small
          title="Randevuyu iptal et"
          disabled={Boolean(busy)}
          onPress={() =>
            NativeAlert.alert(
              'Randevuyu iptal et',
              late ? 'Randevunuza salonun iptal süresinden az kaldı. Bu iptal “geç iptal” olarak kaydedilir.' : 'Randevuyu iptal etmek istediğinize emin misiniz?',
              [
                { text: 'Vazgeç', style: 'cancel' },
                { text: 'Evet, iptal et', style: 'destructive', onPress: () => void post('cancel') },
              ],
            )
          }
        />
      ) : null}

      {a.status === 'completed' && (a.rateable || a.my_rating) ? <Rate appointment={a} /> : null}
      {error ? <Alert text={error} /> : null}
    </Card>
  );
}

/** "Nasıldı?": one tap on a star rates the salon; changeable for 14 days. */
function Rate({ appointment: a }: { appointment: CustomerAppointment }) {
  const [stars, setStars] = useState<number | null>(a.my_rating ?? null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rate(value: number) {
    if (!a.rateable) return;
    const before = stars;
    setStars(value);
    try {
      await api(`/me/appointments/${a.id}/rating`, { method: 'POST', body: { stars: value } });
      setSaved(true);
    } catch (err) {
      setStars(before);
      setError(errorMessage(err));
    }
  }

  return (
    <View style={{ gap: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line }}>
      <Text size={14} weight="bold">
        {stars ? (saved ? 'Teşekkürler!' : 'Puanınız') : 'Nasıldı? Salonu puanlayın'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="radiogroup">
        {[1, 2, 3, 4, 5].map((i) => (
          <Pressable key={i} accessibilityRole="radio" accessibilityLabel={`${i} yıldız`} accessibilityState={{ checked: stars === i }} disabled={!a.rateable} onPress={() => void rate(i)} hitSlop={4}>
            <Text size={32} color={i <= (stars ?? 0) ? colors.star : colors.line}>
              ★
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? <Alert text={error} /> : null}
    </View>
  );
}
