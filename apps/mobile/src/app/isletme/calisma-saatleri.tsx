import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { confirm } from '@/components/Dialogs';
import { BackLink } from '@/components/BackLink';
import { Icon } from '@/components/Icon';
import { Appear, SkeletonList } from '@/components/motion';
import { SelectField } from '@/components/SelectField';
import { ShopPicker } from '@/components/ShopPicker';
import { Alert, Button, Card, Chip, Screen, Text } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import { colors, radius, themed } from '@/lib/theme';
import type { Member } from '@/lib/types';

type Window = { weekday: number; startMinute: number; endMinute: number };
/** One weekday as people think of it: open–close, with breaks in between. */
type Day = { open: boolean; start: number; end: number; breaks: { start: number; end: number }[] };

const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const DEFAULT_DAY: Day = { open: true, start: 9 * 60, end: 19 * 60, breaks: [] };
const TIMES = Array.from({ length: 24 * 4 + 1 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const minutes = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

function toDays(windows: Window[]): Day[] {
  return DAYS.map((_, i) => {
    const w = windows.filter((x) => x.weekday === i + 1).sort((a, b) => a.startMinute - b.startMinute);
    if (w.length === 0) return { ...DEFAULT_DAY, open: false };
    return { open: true, start: w[0]!.startMinute, end: w[w.length - 1]!.endMinute, breaks: w.slice(1).map((x, j) => ({ start: w[j]!.endMinute, end: x.startMinute })) };
  });
}

function toWindows(days: Day[]): Window[] {
  return days.flatMap((d, i) => {
    if (!d.open) return [];
    const out: Window[] = [];
    let from = d.start;
    for (const b of [...d.breaks].sort((a, c) => a.start - c.start)) {
      out.push({ weekday: i + 1, startMinute: from, endMinute: b.start });
      from = b.end;
    }
    out.push({ weekday: i + 1, startMinute: from, endMinute: d.end });
    return out;
  });
}

/** What is wrong with a day, in words, or null (the website's wording). */
function problem(d: Day): string | null {
  if (!d.open) return null;
  if (d.end <= d.start) return 'Kapanış, açılıştan sonra olmalı.';
  let last = d.start;
  for (const b of [...d.breaks].sort((a, c) => a.start - c.start)) {
    if (b.end <= b.start) return 'Molanın bitişi, başlangıcından sonra olmalı.';
    if (b.start <= last || b.end >= d.end) return 'Molalar açılış ile kapanış arasında olmalı ve çakışmamalı.';
    last = b.end;
  }
  return null;
}

/** A break that fits: 13:00–14:00 when possible, else an hour in the middle of the free part. */
function nextBreak(d: Day): { start: number; end: number } | null {
  const free: [number, number][] = [];
  let from = d.start;
  for (const b of [...d.breaks].sort((a, c) => a.start - c.start)) {
    free.push([from, b.start]);
    from = b.end;
  }
  free.push([from, d.end]);
  if (free.find(([s, e]) => s < 13 * 60 && e > 14 * 60)) return { start: 13 * 60, end: 14 * 60 };
  const longest = free.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
  const room = longest[1] - longest[0];
  if (room < 90) return null;
  const length = room >= 150 ? 60 : 30;
  const start = Math.round((longest[0] + (room - length) / 2) / 15) * 15;
  return { start, end: start + length };
}

/**
 * Çalışma saatleri (as on the website): when each person takes appointments,
 * per weekday, with breaks. Staff edit their own; owners anyone's, and can copy
 * one person's week to the whole team. Existing appointments never move.
 */
export default function WorkingHoursScreen() {
  // Whose week: ?kisi=<member> from Salon bilgileri → Personel, else your own.
  const { kisi } = useLocalSearchParams<{ kisi?: string }>();
  const { shops, shop, selectShop, error: shopsError } = useBusinessShops();
  const owner = shop?.role === 'owner';
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [saved, setSaved] = useState<Day[] | null>(null);
  const [days, setDays] = useState<Day[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [everyone, setEveryone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!shop) return;
    setMemberId(kisi && shop.role === 'owner' ? kisi : shop.member_id);
    setEveryone(false);
    if (shop.role !== 'owner') return setMembers([]);
    api<Member[]>(`/staff/shops/${shop.id}/members`)
      .then((all) => setMembers(all.filter((m) => m.active && m.bookable)))
      .catch((err) => setError(errorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop]);

  useEffect(() => {
    if (!shop || !memberId) return;
    let cancelled = false;
    setDays(null);
    setError(null);
    setDone(null);
    setOpen(null);
    api<Window[]>(`/staff/shops/${shop.id}/members/${memberId}/hours`)
      .then((w) => {
        if (cancelled) return;
        const d = toDays(w);
        setSaved(d);
        setDays(d);
      })
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [shop, memberId]);

  const changed = useMemo(() => JSON.stringify(days) !== JSON.stringify(saved), [days, saved]);
  const invalid = days?.some((d) => problem(d) !== null) ?? false;
  const person = members.find((m) => m.id === memberId);
  const others = members.filter((m) => m.id !== memberId);

  function update(i: number, next: Partial<Day>) {
    setDone(null);
    setDays((ds) => ds && ds.map((d, j) => (j === i ? { ...d, ...next } : d)));
  }

  function copyToOthers(i: number) {
    setDone(null);
    setDays((ds) => ds && ds.map((d, j) => (j === i || !d.open ? d : { ...ds[i]!, breaks: ds[i]!.breaks.map((b) => ({ ...b })) })));
  }

  function choosePerson(id: string) {
    if (id === memberId) return;
    if (!changed) return setMemberId(id);
    confirm({ title: 'Kaydedilmemiş değişiklikler', message: 'Kaydedilmemiş değişiklikler silinsin mi?', confirmLabel: 'Sil', danger: true, icon: 'edit', onConfirm: () => setMemberId(id) });
  }

  async function save() {
    if (!shop || !memberId || !days) return;
    setBusy(true);
    setError(null);
    try {
      const body = toWindows(days);
      const targets = owner && everyone ? [memberId, ...others.map((m) => m.id)] : [memberId];
      for (const id of targets) await api(`/staff/shops/${shop.id}/members/${id}/hours`, { method: 'PUT', body });
      setSaved(days);
      setEveryone(false);
      setDone(targets.length > 1 ? `Kaydedildi. ${targets.length} kişinin saatleri güncellendi.` : 'Kaydedildi.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Çalışma saatleri"
      back={<BackLink label="Salonum" />}
      header={
        <>
          <ShopPicker shops={shops} shop={shop} onSelect={selectShop} />
          {owner && members.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 8 }}>
              {members.map((m) => (
                <Chip dark key={m.id} label={`${m.display_name}${m.id === shop?.member_id ? ' (siz)' : ''}`} on={m.id === memberId} onPress={() => choosePerson(m.id)} />
              ))}
            </ScrollView>
          ) : null}
        </>
      }
      footer={
        days ? (
          <>
            {done && !changed && !everyone ? (
              <Text size={14} weight="bold" color={colors.success} center>
                {done}
              </Text>
            ) : null}
            <Button
              title={busy ? 'Kaydediliyor…' : everyone ? 'Herkes için kaydet' : changed ? 'Değişiklikleri kaydet' : 'Kaydedildi'}
              onPress={save}
              disabled={busy || invalid || !(changed || everyone)}
            />
          </>
        ) : undefined
      }
    >
      {shopsError || error ? <Alert text={(shopsError || error)!} /> : null}
      {!days && !error && !shopsError ? <SkeletonList rows={3} /> : null}
      {days ? (
        <>
          <Text color={colors.ink2}>
            {owner && person && memberId !== shop?.member_id ? `${person.display_name} bu saatlerde randevu alır.` : 'Bu saatlerde randevu alırsınız.'} Tek seferlik kapatmak için Randevular → Takvim →
            Saat kapat.
          </Text>
          <Appear>
            <Card style={{ padding: 4 }}>
              {days.map((d, i) => {
                const issue = problem(d);
                const expanded = open === i;
                const room = d.open ? nextBreak(d) : null;
                const breaks = [...d.breaks].sort((a, b) => a.start - b.start);
                return (
                  <View key={DAYS[i]} style={i < 6 && styles.line}>
                    <Pressable
                      onPress={() => setOpen(expanded ? null : i)}
                      style={({ pressed }) => [styles.dayHead, pressed && { backgroundColor: colors.surface2 }]}
                      accessibilityState={{ expanded }}
                    >
                      <Text weight="bold" style={{ width: 96 }}>
                        {DAYS[i]}
                      </Text>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text weight={d.open ? 'semibold' : 'regular'} color={issue ? colors.danger : d.open ? colors.ink : colors.muted}>
                          {issue ?? (d.open ? `${hhmm(d.start)}–${hhmm(d.end)}` : 'Kapalı')}
                        </Text>
                        {d.open && !issue && breaks.length ? (
                          <Text size={12} color={colors.muted}>
                            Mola {breaks.map((b) => `${hhmm(b.start)}–${hhmm(b.end)}`).join(', ')}
                          </Text>
                        ) : null}
                      </View>
                      <View style={{ transform: [{ rotate: expanded ? '-90deg' : '90deg' }] }}>
                        <Icon name="chevron" size={16} color={colors.muted} />
                      </View>
                    </Pressable>
                    {expanded ? (
                      <Appear style={styles.editor}>
                        <View style={styles.row}>
                          <Text weight="semibold">{d.open ? 'Açık' : 'Kapalı'}</Text>
                          <Switch value={d.open} onValueChange={(v) => update(i, { open: v })} trackColor={{ true: colors.primary, false: colors.line }} thumbColor={colors.white} />
                        </View>
                        {d.open ? (
                          <>
                            <View style={styles.row}>
                              <Text color={colors.ink2} style={{ width: 70 }}>
                                Açılış
                              </Text>
                              <SelectField compact title={`${DAYS[i]} açılış`} value={hhmm(d.start)} options={TIMES} onChange={(v) => update(i, { start: minutes(v) })} />
                              <Text color={colors.ink2} style={{ width: 70, textAlign: 'right' }}>
                                Kapanış
                              </Text>
                              <SelectField compact title={`${DAYS[i]} kapanış`} value={hhmm(d.end)} options={TIMES} onChange={(v) => update(i, { end: minutes(v) })} />
                            </View>
                            {d.breaks.map((b, k) => (
                              <View key={k} style={[styles.row, styles.breakRow]}>
                                <Text color={colors.ink2} style={{ width: 70 }}>
                                  Mola
                                </Text>
                                <SelectField
                                  compact
                                  title="Mola başlangıcı"
                                  value={hhmm(b.start)}
                                  options={TIMES}
                                  onChange={(v) => update(i, { breaks: d.breaks.map((x, n) => (n === k ? { ...x, start: minutes(v) } : x)) })}
                                />
                                <Text color={colors.muted}>–</Text>
                                <SelectField
                                  compact
                                  title="Mola bitişi"
                                  value={hhmm(b.end)}
                                  options={TIMES}
                                  onChange={(v) => update(i, { breaks: d.breaks.map((x, n) => (n === k ? { ...x, end: minutes(v) } : x)) })}
                                />
                                <Pressable onPress={() => update(i, { breaks: d.breaks.filter((_, n) => n !== k) })} hitSlop={8} accessibilityLabel="Molayı kaldır" style={styles.remove}>
                                  <Text size={20} color={colors.danger}>
                                    ×
                                  </Text>
                                </Pressable>
                              </View>
                            ))}
                            {issue ? <Alert text={issue} /> : null}
                            <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
                              <Pressable disabled={!room || Boolean(issue)} onPress={() => room && update(i, { breaks: [...d.breaks, room].sort((a, b) => a.start - b.start) })} hitSlop={6}>
                                <Text weight="bold" color={!room || issue ? colors.muted : colors.primary}>
                                  + Mola ekle
                                </Text>
                              </Pressable>
                              <Pressable disabled={Boolean(issue)} onPress={() => copyToOthers(i)} hitSlop={6}>
                                <Text weight="bold" color={issue ? colors.muted : colors.primary}>
                                  Diğer açık günlere uygula
                                </Text>
                              </Pressable>
                            </View>
                          </>
                        ) : null}
                      </Appear>
                    ) : null}
                  </View>
                );
              })}
            </Card>
          </Appear>
          {owner && others.length > 0 ? (
            <Pressable onPress={() => setEveryone(!everyone)} style={[styles.everyone, everyone && { borderColor: colors.primary, backgroundColor: colors.surface2 }]}>
              <Switch value={everyone} onValueChange={setEveryone} trackColor={{ true: colors.primary, false: colors.line }} thumbColor={colors.white} />
              <View style={{ flex: 1 }}>
                <Text weight="bold">Tüm personele uygula</Text>
                <Text size={13} color={colors.muted}>
                  Bu hafta düzeni {others.map((m) => m.display_name).join(', ')} için de kaydedilir; onların saatlerinin yerine geçer.
                </Text>
              </View>
            </Pressable>
          ) : null}
          <Text size={13} color={colors.muted}>
            Mevcut randevular değişmez. Yeni saatler, bundan sonra alınacak randevular için geçerlidir.
          </Text>
          <Pressable onPress={() => router.push('/randevular?tab=takvim')} hitSlop={6}>
            <Text weight="bold" color={colors.primary}>
              Takvim’de saat kapat ›
            </Text>
          </Pressable>
        </>
      ) : null}
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    line: { borderBottomWidth: 1, borderBottomColor: colors.line },
    dayHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 58, paddingHorizontal: 12, borderRadius: radius.sm },
    editor: { gap: 12, paddingHorizontal: 12, paddingBottom: 16 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    breakRow: { padding: 8, borderRadius: radius.sm, backgroundColor: colors.surface2 },
    remove: { width: 30, alignItems: 'center' },
    everyone: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  }),
);
