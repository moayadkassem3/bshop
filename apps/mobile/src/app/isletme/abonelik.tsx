import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BackLink } from '@/components/BackLink';
import { Appear, SkeletonList } from '@/components/motion';
import { ShopPicker } from '@/components/ShopPicker';
import { Alert, Card, Screen, Text } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import { daysLeft, formatFullDate } from '@/lib/format';
import { colors, themed } from '@/lib/theme';
import type { Subscription } from '@/lib/types';

/**
 * Aboneliğim in the app: read-only (store rules, CLAUDE.md). Plan name, staff
 * count, days left and history without amounts; no prices, no buy buttons and
 * no "pay on the website" wording. Staff see the state and the package's name.
 */
export default function MySubscriptionScreen() {
  const { shops, shop, selectShop, error: shopsError } = useBusinessShops();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const owner = shop?.role === 'owner';

  const load = useCallback(async () => {
    if (!shop) return;
    try {
      setSub(await api<Subscription>(`/staff/shops/${shop.id}/subscription`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [shop]);

  useEffect(() => {
    setSub(null);
    load();
  }, [load]);

  return (
    <Screen title="Aboneliğim" back={<BackLink label="Salonum" />} header={<ShopPicker shops={shops} shop={shop} onSelect={selectShop} />}>
      {shopsError || error ? <Alert text={(shopsError || error)!} /> : null}
      {shop && !sub && !error ? <SkeletonList rows={2} /> : null}
      {shop && sub ? (
        <>
          <Appear>
            <Status sub={sub} />
          </Appear>
          <Appear index={1}>
            <Card style={{ gap: 6 }}>
              <Text size={13} weight="bold" color={colors.muted} style={styles.label}>
                PAKETİNİZ
              </Text>
              <Text size={20} weight="heavy">
                {sub.plan ? sub.plan.name : `${sub.terms.customQuoteAboveStaff}’dan fazla personel`}
              </Text>
              <Text color={colors.muted}>{sub.seats} kişi randevu alıyor. Paket, randevu alan personel sayısına göre belirlenir.</Text>
            </Card>
          </Appear>
          {/* Staff: the state and the package's name only (founder, 14 November 2026). */}
          {!owner ? (
            <Appear index={2}>
              <Alert tone="info" text="Aboneliği salon sahibi ve ortaklar takip eder." />
            </Appear>
          ) : null}
          {sub.payments.length > 0 ? (
            <Appear index={2}>
              <Card style={{ gap: 10 }}>
                <Text size={13} weight="bold" color={colors.muted} style={styles.label}>
                  GEÇMİŞ
                </Text>
                {sub.payments.map((p, i) => (
                  <View key={i} style={[styles.row, i > 0 && styles.rowLine]}>
                    <Text weight="semibold">
                      {formatFullDate(p.created_at)} · {p.months} ay
                    </Text>
                    <Text size={14} color={colors.muted}>
                      {p.method === 'yok' ? 'Ödemesiz' : 'Ödendi'} · {formatFullDate(p.period_end)} tarihine kadar
                    </Text>
                  </View>
                ))}
              </Card>
            </Appear>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

/** The state in plain words, the same facts as the website's Aboneliğim. */
function Status({ sub }: { sub: Subscription }) {
  const end = sub.current_period_end;
  let tone: 'ok' | 'warn' | 'bad' = 'ok';
  let title: string;
  let text: string | null;
  if (sub.suspended_at) {
    tone = 'bad';
    title = 'Salonunuz yayından kaldırıldı';
    text = sub.suspended_reason;
  } else if (sub.status === 'active' && end) {
    title = 'Aboneliğiniz aktif';
    text = `${formatFullDate(end)} tarihine kadar · ${daysLeft(end)} gün kaldı`;
  } else if (sub.status === 'trial' && sub.visible && end) {
    tone = daysLeft(end) <= 3 ? 'warn' : 'ok';
    title = `Ücretsiz deneme · ${daysLeft(end)} gün kaldı`;
    text = `${formatFullDate(end)} tarihinde bitiyor. Bittiğinde salonunuz müşterilere gizlenir.`;
  } else if (sub.status === 'past_due' && sub.visible && sub.grace_until) {
    tone = 'warn';
    title = 'Aboneliğinizin süresi doldu';
    text = `Salonunuz ${formatFullDate(sub.grace_until)} tarihine kadar görünür kalacak.`;
  } else {
    tone = 'bad';
    title = 'Salonunuz müşterilere görünmüyor';
    text = `${sub.status === 'trial' ? 'Ücretsiz deneme süreniz bitti.' : 'Aboneliğiniz aktif değil.'} Mevcut randevularınız geçerli.`;
  }
  const palette = { ok: [colors.successSoft, colors.success], warn: [colors.warningSoft, colors.warning], bad: [colors.dangerSoft, colors.danger] }[tone];
  return (
    <Card style={{ gap: 6, backgroundColor: palette[0], borderColor: palette[0] }}>
      <Text size={18} weight="heavy" color={palette[1]}>
        {title}
      </Text>
      {text ? <Text color={colors.ink2}>{text}</Text> : null}
    </Card>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    label: { letterSpacing: 1 },
    row: { gap: 2, paddingTop: 2 },
    rowLine: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 },
  }),
);
