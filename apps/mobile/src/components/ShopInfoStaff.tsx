import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api, errorMessage } from '@/lib/api';
import { formatDuration, formatPrice } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { colors, themed } from '@/lib/theme';
import { AUDIENCE } from '@/lib/types';
import { SkeletonList } from './motion';
import { StaffAvatar } from './StaffAvatar';
import { Alert, Badge, Card, Text } from './ui';

type Settings = {
  name: string;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  about: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  audience: string;
};
type Service = { id: string; name: string; duration_minutes: number; price_kurus: number; price_is_starting_from: boolean; active: boolean };
type Member = { id: string; role: 'owner' | 'staff'; owner_label: 'owner' | 'co_owner' | null; display_name: string; active: boolean; photo_id: string | null };
type Mine = { service_id: string; duration_minutes: number | null };

const roleOf = (m: Member) => (m.owner_label === 'owner' ? 'Sahibi' : m.role === 'owner' ? 'Ortak' : 'Personel');
const TYPE: Record<string, string> = { ...AUDIENCE, unisex: 'Kadın ve erkek kuaförü' };

/**
 * Salon bilgileri for staff (founder, 14 November 2026; as on the website): the same three
 * tabs as the owners', to read. The one thing staff change here is which of the salon's
 * services they give.
 */
export function ShopInfoStaff({ shopId, memberId, tab }: { shopId: string; memberId: string; tab: 'salon' | 'hizmetler' | 'personel' }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [services, setServices] = useState<Service[] | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [mine, setMine] = useState<Mine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const base = `/staff/shops/${shopId}`;
      const [s, sv, m, my] = await Promise.all([
        api<Settings>(`${base}/settings`),
        api<Service[]>(`${base}/services`),
        api<Member[]>(`${base}/members`),
        api<Mine[]>(`${base}/members/${memberId}/services`),
      ]);
      setSettings(s);
      setServices(sv.filter((x) => x.active));
      setMembers(m.filter((x) => x.active));
      setMine(my);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [shopId, memberId]);
  useEffect(() => {
    void load();
  }, [load]);

  // Saved at once; a duration the owner set for this person stays as it is.
  async function toggle(service: Service) {
    if (!mine || saving) return;
    const on = mine.some((x) => x.service_id === service.id);
    const next = on ? mine.filter((x) => x.service_id !== service.id) : [...mine, { service_id: service.id, duration_minutes: null }];
    setSaving(true);
    setMine(next);
    try {
      await api(`/staff/shops/${shopId}/members/${memberId}/services`, { method: 'PUT', body: next.map((x) => ({ serviceId: x.service_id, durationMinutes: x.duration_minutes })) });
      setError(null);
    } catch (err) {
      setMine(mine);
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (error && !settings) return <Alert text={error} />;
  if (!settings || !services || !members || !mine) return <SkeletonList rows={3} />;

  const place = [settings.address, [settings.district, settings.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  const facts = (
    [
      ['Salon adı', settings.name],
      ['Salon türü', TYPE[settings.audience] ?? null],
      ['Telefon', settings.phone ? formatPhone(settings.phone) : null],
      ['WhatsApp', settings.whatsapp ? formatPhone(settings.whatsapp) : null],
      ['Instagram', settings.instagram ? `@${settings.instagram}` : null],
      ['Adres', place || null],
      ['Hakkında', settings.about],
    ] as [string, string | null][]
  ).filter(([, value]) => value);

  return (
    <View style={{ gap: 12 }}>
      {error ? <Alert text={error} /> : null}
      {tab === 'salon' ? (
        <>
          <Note text="Bu bilgileri salon sahibi ve ortaklar değiştirebilir." />
          <Card style={{ paddingVertical: 4 }}>
            {facts.map(([label, value], i) => (
              <View key={label} style={[styles.fact, i > 0 && styles.line]}>
                <Text size={13} color={colors.muted}>
                  {label}
                </Text>
                <Text weight="semibold">{value}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
      {tab === 'hizmetler' ? (
        <>
          <Note text="Verdiğiniz hizmetleri işaretleyin: müşteriler sizden yalnızca bunlar için randevu alabilir. Hizmetleri ve fiyatları salon sahibi belirler." />
          {services.length === 0 ? (
            <Note text="Salonun henüz hizmeti yok." />
          ) : (
            <Card style={{ padding: 0 }}>
              {services.map((s, i) => {
                const own = mine.find((x) => x.service_id === s.id);
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => void toggle(s)}
                    disabled={saving}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: Boolean(own) }}
                    accessibilityLabel={`${s.name}: bu hizmeti veriyorum`}
                    style={({ pressed }) => [styles.row, i > 0 && styles.line, pressed && { backgroundColor: colors.surface2 }]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text weight="bold">{s.name}</Text>
                      <Text size={13} color={colors.muted}>
                        {formatDuration(own?.duration_minutes ?? s.duration_minutes)} · {formatPrice(s.price_kurus, s.price_is_starting_from)}
                      </Text>
                    </View>
                    <View style={[styles.box, own && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                      {own ? (
                        <Text size={14} weight="bold" color={colors.white}>
                          ✓
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </Card>
          )}
        </>
      ) : null}
      {tab === 'personel' ? (
        <Card style={{ padding: 0 }}>
          {members.map((m, i) => (
            <View key={m.id} style={[styles.row, i > 0 && styles.line]}>
              <StaffAvatar name={m.display_name} photoId={m.photo_id} size={40} />
              <Text weight="bold" style={{ flex: 1 }}>
                {m.display_name}
                {m.id === memberId ? <Text color={colors.muted}> (siz)</Text> : null}
              </Text>
              <Badge label={roleOf(m)} tone={m.role === 'owner' ? 'info' : 'muted'} />
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

function Note({ text }: { text: string }) {
  return (
    <Text size={14} color={colors.muted} style={{ lineHeight: 20 }}>
      {text}
    </Text>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    fact: { gap: 2, paddingVertical: 12 },
    line: { borderTopWidth: 1, borderTopColor: colors.line },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 14, paddingVertical: 10 },
    box: { width: 26, height: 26, borderRadius: 8, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  }),
);
