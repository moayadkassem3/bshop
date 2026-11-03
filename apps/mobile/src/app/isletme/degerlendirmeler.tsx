import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { BackLink } from '@/components/BackLink';
import { Appear, SkeletonList } from '@/components/motion';
import { ShopPicker } from '@/components/ShopPicker';
import { formatRating, StarRow } from '@/components/Stars';
import { Alert, Button, Card, Empty, Screen, Text } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import { formatFullDate } from '@/lib/format';
import { colors, fonts, radius } from '@/lib/theme';
import type { Rating, TeamRatings } from '@/lib/types';

/**
 * Değerlendirmeler (as on the website): the stars customers gave the salon after
 * completed visits. The whole team reads them; owners answer each once, publicly.
 */
export default function ShopRatingsScreen() {
  const { shops, shop, selectShop, error: shopsError } = useBusinessShops();
  const [data, setData] = useState<TeamRatings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!shop) return;
    try {
      setData(await api<TeamRatings>(`/staff/shops/${shop.id}/ratings`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [shop]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const max = Math.max(1, ...(data?.distribution ?? []));
  return (
    <Screen
      title="Değerlendirmeler"
      back={<BackLink label="Salonum" />}
      header={<ShopPicker shops={shops} shop={shop} onSelect={selectShop} />}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    >
      {shopsError || error ? <Alert text={(shopsError || error)!} /> : null}
      {!data && !error && !shopsError ? <SkeletonList rows={3} /> : null}
      {data && data.count === 0 ? (
        <Appear>
          <Empty title="Henüz değerlendirme yok" text="Müşteriler, randevuları “Geldi” olarak işaretlendikten sonra 14 gün içinde 1–5 yıldız verebilir." />
        </Appear>
      ) : null}
      {data && data.count > 0 && shop ? (
        <>
          <Appear>
            <Card style={styles.summary}>
              <View style={{ alignItems: 'center', gap: 4, minWidth: 92 }}>
                <Text size={40} weight="heavy">
                  {data.average != null ? formatRating(data.average) : '–'}
                </Text>
                <StarRow value={Math.round(data.average ?? 0)} size={15} />
                <Text size={13} color={colors.muted}>
                  {data.count} müşteri
                </Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                {data.distribution.map((n, i) => (
                  <View key={i} style={styles.bar}>
                    <Text size={13} color={colors.muted} style={{ width: 12 }}>
                      {5 - i}
                    </Text>
                    <View style={styles.track}>{n > 0 ? <View style={[styles.fill, { width: `${(n / max) * 100}%` }]} /> : null}</View>
                    <Text size={13} color={colors.muted} style={{ width: 24, textAlign: 'right' }}>
                      {n}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          </Appear>
          {data.count < data.minimum ? <Alert tone="info" text={`Ortalamanız, ${data.minimum} müşteri puan verdikten sonra müşterilere görünür. Şimdilik yalnızca puanlar listelenir.`} /> : null}
          {data.ratings.map((r, i) => (
            <Appear key={r.id} index={i + 1}>
              <RatingItem shopId={shop.id} rating={r} canReply={shop.role === 'owner'} onChanged={load} />
            </Appear>
          ))}
          <Text size={13} color={colors.muted}>
            Her müşterinin salonunuza verdiği son puan sayılır. Uygunsuz veya sahte olduğunu düşündüğünüz bir puan için bizimle iletişime geçin.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}

function RatingItem({ shopId, rating: r, canReply, onChanged }: { shopId: string; rating: Rating; canReply: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(r.reply ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(value: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/staff/shops/${shopId}/ratings/${r.id}/reply`, { method: 'PUT', body: { text: value.trim() } });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <StarRow value={r.stars} size={16} />
        <Text size={14} color={colors.muted}>
          {r.customer} · {formatFullDate(r.updated_at)}
        </Text>
      </View>
      {r.reply && !editing ? (
        <View style={styles.reply}>
          <Text size={13} weight="bold" color={colors.ink2}>
            Yanıtınız
          </Text>
          <Text size={14}>{r.reply}</Text>
        </View>
      ) : null}
      {canReply && !editing ? (
        <View style={{ flexDirection: 'row', gap: 18 }}>
          <Pressable
            hitSlop={8}
            onPress={() => {
              setText(r.reply ?? '');
              setEditing(true);
            }}
          >
            <Text size={14} weight="bold" color={colors.primary}>
              {r.reply ? 'Yanıtı düzenle' : 'Yanıtla'}
            </Text>
          </Pressable>
          {r.reply ? (
            <Pressable hitSlop={8} disabled={busy} onPress={() => void save('')}>
              <Text size={14} weight="bold" color={colors.danger}>
                Yanıtı sil
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {editing ? (
        <View style={{ gap: 8 }}>
          <Text size={14} weight="semibold" color={colors.ink2}>
            Herkese açık yanıt
          </Text>
          <TextInput
            value={text}
            onChangeText={setText}
            maxLength={300}
            multiline
            placeholder="Örn. Teşekkür ederiz, yine bekleriz!"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoFocus
          />
          <Text size={12} color={colors.muted} style={{ alignSelf: 'flex-end' }}>
            {text.length}/300
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button kind="secondary" title="Vazgeç" onPress={() => setEditing(false)} disabled={busy} style={{ flex: 1 }} />
            <Button title="Yanıtı yayınla" onPress={() => void save(text)} busy={busy} disabled={!text.trim()} style={{ flex: 1.4 }} />
          </View>
        </View>
      ) : null}
      {error ? <Alert text={error} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.star },
  reply: { padding: 12, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  input: { minHeight: 96, padding: 12, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.sm, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, textAlignVertical: 'top' },
});
