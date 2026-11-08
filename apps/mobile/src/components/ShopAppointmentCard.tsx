import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { confirm } from './Dialogs';
import { api, errorMessage } from '@/lib/api';
import { formatLongDate, formatPrice, formatTime } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { colors, themed } from '@/lib/theme';
import type { ShopAppointment } from '@/lib/types';
import { Alert, Badge, Button, Card, Text, type Tone } from './ui';

const STATUS: Record<ShopAppointment['status'], { label: string; tone: Tone }> = {
  pending: { label: 'Onay bekliyor', tone: 'warning' },
  offered: { label: 'Yeni saat önerildi', tone: 'warning' },
  confirmed: { label: 'Onaylandı', tone: 'success' },
  declined: { label: 'Reddedildi', tone: 'muted' },
  cancelled: { label: 'İptal', tone: 'muted' },
  completed: { label: 'Geldi', tone: 'info' },
  no_show: { label: 'Gelmedi', tone: 'danger' },
};

const CANCELLED_BY: Record<string, string> = {
  customer: 'Müşteri iptal etti',
  customer_late: 'Müşteri geç iptal etti',
  shop: 'Salon iptal etti',
  staff_absence: 'Personel izni nedeniyle iptal',
};

/**
 * One appointment for the salon (as on the website): who, when, what; Onayla /
 * Reddet for a request, Geldi / Gelmedi once it has started, İptal before.
 */
export function ShopAppointmentCard(props: { shopId: string; appointment: ShopAppointment; showDate?: boolean; showStaff?: boolean; onChanged: () => void }) {
  const a = props.appointment;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = new Date(a.starts_at).getTime() <= Date.now();
  const st = a.status === 'cancelled' && a.cancel_reason && CANCELLED_BY[a.cancel_reason] ? { ...STATUS.cancelled, label: CANCELLED_BY[a.cancel_reason]! } : STATUS[a.status];
  // Calling helps only before the visit (Geçmiş shows finished ones without it).
  const live = ['pending', 'offered', 'confirmed'].includes(a.status) && new Date(a.ends_at).getTime() > Date.now();

  async function act(action: string) {
    setBusy(action);
    setError(null);
    try {
      await api(`/staff/shops/${props.shopId}/appointments/${a.id}/${action}`, { method: 'POST', body: {} });
      props.onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const confirmFirst = (title: string, message: string, action: string, label: string) =>
    confirm({ title, message, confirmLabel: label, danger: true, icon: action === 'cancel' ? 'calendarDots' : 'close', onConfirm: () => void act(action) });

  return (
    <Card style={[{ gap: 8 }, a.status === 'pending' && styles.pending, !live && !started && styles.dropped]}>
      <View style={styles.top}>
        <View style={{ flex: 1, gap: 2 }}>
          {props.showDate ? (
            <Text size={13} weight="semibold" color={colors.muted}>
              {formatLongDate(a.starts_at)}
            </Text>
          ) : null}
          <Text size={17} weight="bold">
            {formatTime(a.starts_at)}–{formatTime(a.ends_at)}
          </Text>
          <Text weight="semibold">
            {a.customer_name}
            {a.customer_verified ? ' ✓' : ''}
            {a.guest_name ? ` · ${a.guest_name} için` : ''}
          </Text>
        </View>
        <Text weight="bold">{formatPrice(a.total_price_kurus, a.price_is_starting_from)}</Text>
      </View>
      <Text size={14} color={colors.ink2}>
        {(a.services ?? []).map((s) => s.name).join(' + ')}
        {props.showStaff ? ` · ${a.staff_name}` : ''}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Badge label={st.label} tone={st.tone} />
        {a.status === 'pending' && a.deadline_at ? (
          <Text size={13} color={colors.muted}>
            Otomatik onay: {formatTime(a.deadline_at)}
          </Text>
        ) : null}
      </View>
      {a.customer_phone && live ? (
        <Pressable onPress={() => Linking.openURL(`tel:${a.customer_phone}`)} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
          <Text size={14} weight="semibold" color={colors.primary}>
            {formatPhone(a.customer_phone)} · Ara
          </Text>
        </Pressable>
      ) : null}

      {a.status === 'pending' ? (
        <View style={styles.actions}>
          <Button title="Onayla" onPress={() => void act('confirm')} busy={busy === 'confirm'} disabled={Boolean(busy)} style={{ flex: 1 }} />
          <Button
            kind="dangerOutline"
            title="Reddet"
            onPress={() => confirmFirst('Talebi reddet', 'Müşteriye SMS ile bildirilir.', 'decline', 'Reddet')}
            busy={busy === 'decline'}
            disabled={Boolean(busy)}
            style={{ flex: 1 }}
          />
        </View>
      ) : null}
      {a.status === 'confirmed' && started ? (
        <View style={styles.actions}>
          <Button title="Geldi" onPress={() => void act('complete')} busy={busy === 'complete'} disabled={Boolean(busy)} style={{ flex: 1 }} />
          <Button
            kind="secondary"
            title="Gelmedi"
            onPress={() => confirmFirst('Gelmedi olarak işaretle', 'Müşterinin kaydına işlenir.', 'no-show', 'Gelmedi')}
            busy={busy === 'no-show'}
            disabled={Boolean(busy)}
            style={{ flex: 1 }}
          />
        </View>
      ) : null}
      {(a.status === 'confirmed' || a.status === 'offered') && !started ? (
        <Button kind="ghost" small title="Randevuyu iptal et" onPress={() => confirmFirst('Randevuyu iptal et', 'Müşteriye SMS ile bildirilir.', 'cancel', 'İptal et')} disabled={Boolean(busy)} />
      ) : null}
      {error ? <Alert text={error} /> : null}
    </Card>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    top: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    pending: { borderColor: colors.warningLine, borderWidth: 1.5 },
    dropped: { opacity: 0.75 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  }),
);
