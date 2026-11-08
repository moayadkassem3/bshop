import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { api, errorMessage } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { colors, fonts, radius, themed } from '@/lib/theme';
import { SelectField } from './SelectField';
import { Alert, Button, Card, Chip, Text } from './ui';

export type TimeOff = { id: string; staff_id: string; staff_name: string; kind: 'block' | 'absence'; starts_at: string; ends_at: string; note: string | null };
type Person = { id: string; display_name: string };

const TIMES = Array.from({ length: 24 * 4 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`).concat('24:00');

/** A closed time in the day's list: "16:00–17:00 · Kapalı · Doktor", with Kaldır (as on the website). */
export function TimeOffCard(props: { shopId: string; item: TimeOff; date: string; showStaff: boolean; onChanged: () => void }) {
  const t = props.item;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dayStart = new Date(`${props.date}T00:00:00+03:00`).getTime();
  const allDay = new Date(t.starts_at).getTime() <= dayStart && new Date(t.ends_at).getTime() >= dayStart + 86_400_000 - 60_000;

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api(`/staff/shops/${props.shopId}/time-off/${t.id}`, { method: 'DELETE' });
      props.onChanged();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Card style={styles.closed}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text weight="bold" style={{ minWidth: 92 }}>
          {allDay ? 'Tüm gün' : `${formatTime(t.starts_at)}–${formatTime(t.ends_at)}`}
        </Text>
        <View style={{ flex: 1 }}>
          <Text weight="bold" color={colors.ink2}>
            {t.kind === 'absence' ? 'İzinli' : 'Kapalı'}
          </Text>
          {props.showStaff || t.note ? (
            <Text size={13} color={colors.muted}>
              {[props.showStaff ? t.staff_name : null, t.note].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
        {t.kind === 'block' ? <Button small kind="ghost" title="Kaldır" onPress={remove} busy={busy} /> : null}
      </View>
      {error ? <Alert text={error} /> : null}
    </Card>
  );
}

/**
 * "Saat kapat" (as on the website): close a time once for one person (a
 * doctor's visit, a meeting) or the whole day. Customers cannot book it; it
 * fails if appointments are already there.
 */
export function BlockForm(props: { shopId: string; date: string; members: Person[]; myMemberId: string; isOwner: boolean; onDone: () => void; onClose: () => void }) {
  const [staffId, setStaffId] = useState(props.isOwner && props.members.length ? (props.members.find((m) => m.id === props.myMemberId)?.id ?? props.members[0]!.id) : props.myMemberId);
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState('13:00');
  const [end, setEnd] = useState('14:00');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = allDay || end > start;

  async function save() {
    setBusy(true);
    setError(null);
    const midnight = new Date(`${props.date}T00:00:00+03:00`);
    const startsAt = allDay ? midnight : new Date(`${props.date}T${start}:00+03:00`);
    const endsAt = allDay || end === '24:00' ? new Date(midnight.getTime() + 86_400_000) : new Date(`${props.date}T${end}:00+03:00`);
    try {
      await api(`/staff/shops/${props.shopId}/blocks`, { method: 'POST', body: { staffId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), note: note.trim() || null } });
      props.onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 12, borderColor: colors.primary, borderWidth: 1.5 }}>
      <Text size={17} weight="heavy">
        Saat kapat
      </Text>
      {props.isOwner && props.members.length > 1 ? (
        <View style={{ gap: 6 }}>
          <Text size={14} weight="semibold" color={colors.ink2}>
            Kim için
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {props.members.map((m) => (
              <Chip key={m.id} label={m.display_name} on={staffId === m.id} onPress={() => setStaffId(m.id)} />
            ))}
          </ScrollView>
        </View>
      ) : null}
      <Pressable onPress={() => setAllDay(!allDay)} style={styles.row}>
        <Text weight="semibold">Tüm gün kapalı</Text>
        <Switch value={allDay} onValueChange={setAllDay} trackColor={{ true: colors.primary, false: colors.line }} thumbColor={colors.white} />
      </Pressable>
      {!allDay ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <SelectField label="Başlangıç" value={start} options={TIMES.slice(0, -1)} onChange={setStart} />
          <SelectField label="Bitiş" value={end} options={TIMES.slice(1)} onChange={setEnd} />
        </View>
      ) : null}
      <View style={{ gap: 6 }}>
        <Text size={14} weight="semibold" color={colors.ink2}>
          Not (isteğe bağlı)
        </Text>
        <TextInput value={note} onChangeText={setNote} maxLength={200} placeholder="Örn. Doktor randevusu" placeholderTextColor={colors.muted} style={styles.input} />
      </View>
      <Text size={13} color={colors.muted}>
        Müşteriler bu saatte randevu alamaz. Bu saatte randevu varsa önce onları iptal edin.
      </Text>
      {error ? <Alert text={error} /> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button kind="secondary" title="Vazgeç" onPress={props.onClose} disabled={busy} style={{ flex: 1 }} />
        <Button title={allDay ? 'Günü kapat' : `${start}–${end} kapat`} onPress={save} busy={busy} disabled={!valid} style={{ flex: 1.4 }} />
      </View>
    </Card>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    closed: { gap: 8, backgroundColor: colors.surface2, borderStyle: 'dashed' },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    input: {
      minHeight: 48,
      paddingHorizontal: 14,
      borderWidth: 1.5,
      borderColor: colors.line,
      borderRadius: radius.sm,
      backgroundColor: colors.surface,
      fontFamily: fonts.regular,
      fontSize: 16,
      color: colors.ink,
    },
  }),
);
