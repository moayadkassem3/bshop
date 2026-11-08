import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert as NativeAlert, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { BackLink } from '@/components/BackLink';
import { Icon } from '@/components/Icon';
import { MapPickerModal, MapPreview, type MapFocus, type Point } from '@/components/MapPicker';
import { Appear, SkeletonList } from '@/components/motion';
import { PhotoManager } from '@/components/PhotoManager';
import { SAVE_BAR_SPACE, SaveBar, type SaveBarState } from '@/components/SaveBar';
import { SelectField } from '@/components/SelectField';
import { ShopPicker } from '@/components/ShopPicker';
import { Alert, Badge, Button, Card, Field, Screen, Segmented, Text } from '@/components/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import { formatDuration, formatPrice } from '@/lib/format';
import { formatPhone, formatPhoneInput, phoneComplete, phoneDigits } from '@/lib/phone';
import { districtsOf, provinceCentre, PROVINCES } from '@/lib/provinces';
import { colors, fonts, radius, themed } from '@/lib/theme';

type Tab = 'salon' | 'hizmetler' | 'personel';
type Audience = 'men' | 'women' | 'unisex';

/**
 * Salon bilgileri (as on the website), for owners and co-owners, in three tabs:
 * Salon (details, address, photos), Hizmetler (services and prices), Personel
 * (team). The plan is named, never priced (store rules, CLAUDE.md).
 */
export default function ShopSettingsScreen() {
  const { shops, shop, selectShop, error } = useBusinessShops();
  const [tab, setTab] = useState<Tab>('salon');
  const [bar, setBar] = useState<SaveBarState | null>(null);
  return (
    <View style={{ flex: 1 }}>
      <Screen
        title="Salon bilgileri"
        back={<BackLink label="Salonum" />}
        header={
          <>
            <ShopPicker shops={shops} shop={shop} onSelect={selectShop} />
            <Segmented
              dark
              value={tab}
              onChange={setTab}
              options={[
                { value: 'salon', label: 'Salon' },
                { value: 'hizmetler', label: 'Hizmetler' },
                { value: 'personel', label: 'Personel' },
              ]}
            />
          </>
        }
      >
        {error ? <Alert text={error} /> : null}
        {shop && shop.role !== 'owner' ? <Alert tone="info" text="Salon bilgilerini yalnızca salon sahibi ve ortaklar değiştirebilir." /> : null}
        {shop && shop.role === 'owner' ? (
          // Remounted per salon; tabs stay mounted so unsaved changes survive switching.
          <View key={shop.id}>
            <View style={{ display: tab === 'salon' ? 'flex' : 'none', gap: 14 }}>
              <SalonTab shopId={shop.id} onBar={setBar} />
            </View>
            <View style={{ display: tab === 'hizmetler' ? 'flex' : 'none', gap: 12 }}>
              <ServicesTab shopId={shop.id} />
            </View>
            <View style={{ display: tab === 'personel' ? 'flex' : 'none', gap: 12 }}>
              <StaffTab shopId={shop.id} myMemberId={shop.member_id} />
            </View>
          </View>
        ) : null}
      </Screen>
      {/* Salon tab: Kaydet stays at the bottom while scrolling, only when something changed. */}
      <SaveBar state={bar} active={tab === 'salon'} />
    </View>
  );
}

// ---------------------------------------------------------------- Salon

type Settings = {
  slug: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  about: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  audience: Audience;
};
type Form = { audience: Audience; name: string; phone: string; whatsapp: string; instagram: string; about: string; city: string; district: string; address: string; point: Point | null };

const TYPES: { value: Audience; icon: string; label: string }[] = [
  { value: 'men', icon: '💈', label: 'Erkek' },
  { value: 'women', icon: '💇‍♀️', label: 'Kadın' },
  { value: 'unisex', icon: '✂️', label: 'Kadın ve erkek' },
];

const toForm = (s: Settings): Form => ({
  audience: s.audience,
  name: s.name,
  phone: s.phone ? phoneDigits(formatPhone(s.phone)) : '',
  whatsapp: s.whatsapp ? phoneDigits(formatPhone(s.whatsapp)) : '',
  instagram: s.instagram ? `@${s.instagram}` : '',
  about: s.about ?? '',
  city: s.city ?? '',
  district: s.district ?? '',
  address: s.address ?? '',
  point: s.latitude !== null && s.longitude !== null ? { lat: Number(s.latitude), lng: Number(s.longitude) } : null,
});

function formProblem(f: Form): string | null {
  if (f.name.trim().length < 2) return 'İşletme adını yazın.';
  if (!phoneComplete(f.phone, 'any')) return 'Salon telefonunu 11 haneli yazın (0 ile başlayarak).';
  if (f.whatsapp && !phoneComplete(f.whatsapp)) return 'WhatsApp için 05 ile başlayan 11 haneli cep numarası yazın.';
  if (!f.city) return 'İli seçin.';
  if (f.district.trim().length < 2) return 'İlçeyi seçin.';
  if (f.address.trim().length < 5) return 'Açık adresi yazın.';
  return f.point ? null : 'Haritada salonunuzun yerini işaretleyin.';
}

function focusFor(city: string, district: string): MapFocus | null {
  const d = districtsOf(city).find((x) => x.name === district);
  if (d) return { lat: d.lat, lng: d.lng, zoom: 13 };
  const c = provinceCentre(city);
  return c ? { lat: c.lat, lng: c.lng, zoom: 10 } : null;
}

function SalonTab({ shopId, onBar }: { shopId: string; onBar: (bar: SaveBarState | null) => void }) {
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState<Form | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    api<Settings>(`/staff/shops/${shopId}/settings`)
      .then((s) => {
        setForm(toForm(s));
        setSaved(toForm(s));
      })
      .catch((err) => setMessage({ ok: false, text: errorMessage(err) }));
  }, [shopId]);

  const update = (patch: Partial<Form>) => {
    setMessage(null);
    setJustSaved(false);
    setForm((f) => (f ? { ...f, ...patch } : f));
  };

  async function save() {
    if (!form) return;
    setBusy(true);
    setMessage(null);
    try {
      const s = await api<Settings>(`/staff/shops/${shopId}/settings`, {
        method: 'PATCH',
        body: {
          audience: form.audience,
          name: form.name.trim(),
          phone: form.phone,
          whatsapp: form.whatsapp || null,
          instagram: form.instagram.trim() || null,
          about: form.about.trim() || null,
          city: form.city,
          district: form.district.trim(),
          address: form.address.trim(),
          latitude: form.point!.lat,
          longitude: form.point!.lng,
        },
      });
      setForm(toForm(s));
      setSaved(toForm(s));
      setJustSaved(true);
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError && err.code === 'VALIDATION' ? 'Bazı bilgiler eksik veya hatalı görünüyor.' : errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const blocker = form ? formProblem(form) : null;
  const changed = Boolean(form) && JSON.stringify(form) !== JSON.stringify(saved);

  // “Değişiklikler kaydedildi” shows for a moment, then the bar leaves.
  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 2200);
    return () => clearTimeout(timer);
  }, [justSaved]);

  // The screen's save bar follows this form (latest save/reset through refs, so the bar never goes stale).
  const actions = useRef({ save, reset: () => {} });
  actions.current = {
    save,
    reset: () => {
      setMessage(null);
      setForm(saved);
    },
  };
  const error = message && !message.ok && form ? message.text : null;
  useEffect(() => {
    onBar({
      changed,
      busy,
      problem: changed ? blocker : null,
      error,
      saved: justSaved,
      save: () => void actions.current.save(),
      reset: () => actions.current.reset(),
    });
  }, [changed, busy, blocker, error, justSaved, onBar]);
  useEffect(() => () => onBar(null), [onBar]);

  if (!form) return message ? <Alert text={message.text} /> : <SkeletonList rows={3} />;
  const focus = focusFor(form.city, form.district);

  return (
    <>
      <Section title="Müşterileriniz kimler?" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {TYPES.map((o) => {
          const on = form.audience === o.value;
          return (
            <Pressable key={o.value} onPress={() => update({ audience: o.value })} style={[styles.type, on && styles.typeOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
              <Text size={22}>{o.icon}</Text>
              <Text size={13} weight="bold" color={on ? colors.primary : colors.ink} center>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Section title="İletişim" />
      <Field label="İşletme adı" value={form.name} maxLength={80} onChangeText={(name) => update({ name })} />
      <Field label="Salon telefonu" value={formatPhoneInput(form.phone)} keyboardType="phone-pad" maxLength={14} onChangeText={(v) => update({ phone: phoneDigits(v) })} />
      <Field
        label="WhatsApp (isteğe bağlı)"
        value={formatPhoneInput(form.whatsapp)}
        keyboardType="phone-pad"
        maxLength={14}
        placeholder="05xx xxx xx xx"
        onChangeText={(v) => update({ whatsapp: phoneDigits(v) })}
      />
      <Field label="Instagram (isteğe bağlı)" value={form.instagram} autoCapitalize="none" autoCorrect={false} placeholder="@kullaniciadi" onChangeText={(instagram) => update({ instagram })} />
      <Area label="Hakkında (isteğe bağlı)" value={form.about} maxLength={600} placeholder="Salonunuzu birkaç cümleyle anlatın." onChange={(about) => update({ about })} />

      <Section title="Adres" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <SelectField label="İl" value={form.city} options={PROVINCES} searchable onChange={(city) => update({ city, district: '' })} />
        <SelectField label="İlçe" value={form.district} options={districtsOf(form.city).map((d) => d.name)} searchable disabled={!form.city} onChange={(district) => update({ district })} />
      </View>
      <Area label="Açık adres" value={form.address} maxLength={300} placeholder="Mahalle, cadde/sokak, bina no" onChange={(address) => update({ address })} />
      <MapPreview point={form.point} focus={focus} onPress={() => setPicking(true)} />
      {picking ? (
        <MapPickerModal
          visible
          point={form.point}
          focus={focus}
          onClose={() => setPicking(false)}
          onPick={(point) => {
            update({ point });
            setPicking(false);
          }}
        />
      ) : null}

      <Text size={13} color={colors.muted}>
        Salonunuzun bağlantısı ve QR kodu ad değişse de aynı kalır.
      </Text>

      <Section title={`Fotoğraflar (${photoCount}/12)`} />
      <PhotoManager shopId={shopId} onCountChange={setPhotoCount} />
      {/* Room for the save bar, so it never covers the last photos. */}
      {changed || justSaved ? <View style={{ height: SAVE_BAR_SPACE }} /> : null}
    </>
  );
}

// ---------------------------------------------------------------- Hizmetler

type Service = { id: string; catalog_service_id: number | null; name: string; duration_minutes: number; price_kurus: number; price_is_starting_from: boolean; active: boolean };
type CatalogItem = { id: number; name: string; duration_minutes: number };
type Draft = { name: string; duration: string; price: string; from: boolean };

/** "450" or "450,50" to kuruş; null when not a price. */
function parseLira(value: string): number | null {
  const n = Number(value.replace(/\s/g, '').replace(',', '.'));
  return value.trim() && Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? Math.round(n * 100) : null;
}
const liraInput = (kurus: number) => (kurus % 100 === 0 ? String(kurus / 100) : (kurus / 100).toFixed(2).replace('.', ','));
const toDraft = (s: Service): Draft => ({ name: s.name, duration: String(s.duration_minutes), price: liraInput(s.price_kurus), from: s.price_is_starting_from });
const draftOk = (d: Draft) => d.name.trim().length >= 2 && Number(d.duration) >= 5 && Number(d.duration) <= 600 && parseLira(d.price) !== null;

function ServicesTab({ shopId }: { shopId: string }) {
  const [services, setServices] = useState<Service[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [adding, setAdding] = useState<'catalog' | 'custom' | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setServices(await api<Service[]>(`/staff/shops/${shopId}/services`));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [shopId]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const active = services?.filter((s) => s.active) ?? [];
  const removed = services?.filter((s) => !s.active) ?? [];

  return (
    <>
      {error ? <Alert text={error} /> : null}
      <Text color={colors.ink2}>Fiyatları siz belirlersiniz. Süreler varsayılandır; her personel kendi süresini ayarlayabilir.</Text>
      {!services ? <SkeletonList rows={2} /> : null}
      {services ? (
        <Card style={{ padding: 4 }}>
          {active.map((s, i) => (
            <View key={s.id} style={i < active.length - 1 && styles.line}>
              {editing === s.id && draft ? (
                <Appear style={{ gap: 10, padding: 12 }}>
                  <ServiceFields draft={draft} onChange={setDraft} />
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <Pressable
                      disabled={busy}
                      hitSlop={8}
                      onPress={() =>
                        NativeAlert.alert('Hizmeti kaldır', `${s.name} müşterilere artık görünmez. Sonra geri ekleyebilirsiniz.`, [
                          { text: 'Vazgeç', style: 'cancel' },
                          {
                            text: 'Kaldır',
                            style: 'destructive',
                            onPress: () => void run(() => api(`/staff/shops/${shopId}/services/${s.id}`, { method: 'PATCH', body: { active: false } })).then((ok) => ok && setEditing(null)),
                          },
                        ])
                      }
                    >
                      <Text weight="bold" color={colors.danger}>
                        Kaldır
                      </Text>
                    </Pressable>
                    <View style={{ flex: 1 }} />
                    <Button small kind="secondary" title="Vazgeç" onPress={() => setEditing(null)} disabled={busy} />
                    <Button
                      small
                      title="Kaydet"
                      busy={busy}
                      disabled={!draftOk(draft)}
                      onPress={() =>
                        void run(() =>
                          api(`/staff/shops/${shopId}/services/${s.id}`, {
                            method: 'PATCH',
                            body: { name: draft.name.trim(), durationMinutes: Number(draft.duration), priceKurus: parseLira(draft.price), priceIsStartingFrom: draft.from },
                          }),
                        ).then((ok) => ok && setEditing(null))
                      }
                    />
                  </View>
                </Appear>
              ) : (
                <Pressable
                  onPress={() => {
                    setEditing(s.id);
                    setDraft(toDraft(s));
                    setAdding(null);
                  }}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text weight="semibold">{s.name}</Text>
                    <Text size={13} color={colors.muted}>
                      {formatDuration(s.duration_minutes)}
                    </Text>
                  </View>
                  <Text weight="bold">{formatPrice(s.price_kurus, s.price_is_starting_from)}</Text>
                  <Icon name="chevron" size={16} color={colors.muted} />
                </Pressable>
              )}
            </View>
          ))}
          {active.length === 0 ? (
            <Text color={colors.muted} style={{ padding: 12 }}>
              Henüz hizmet yok. Aşağıdan ekleyin.
            </Text>
          ) : null}
        </Card>
      ) : null}

      {adding === null ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button kind="secondary" title="+ Listeden ekle" onPress={() => (setAdding('catalog'), setEditing(null))} style={{ flex: 1 }} />
          <Button kind="secondary" title="+ Kendi hizmetiniz" onPress={() => (setAdding('custom'), setEditing(null))} style={{ flex: 1 }} />
        </View>
      ) : null}
      {adding === 'catalog' ? (
        <CatalogPicker
          existing={new Set(active.filter((s) => s.catalog_service_id).map((s) => s.catalog_service_id!))}
          busy={busy}
          onCancel={() => setAdding(null)}
          onAdd={(catalogId, priceKurus, from) =>
            void run(() => api(`/staff/shops/${shopId}/services/import`, { method: 'POST', body: [{ catalogId, priceKurus, priceIsStartingFrom: from }] })).then((ok) => ok && setAdding(null))
          }
        />
      ) : null}
      {adding === 'custom' ? (
        <CustomService
          busy={busy}
          onCancel={() => setAdding(null)}
          onAdd={(d) =>
            void run(() =>
              api(`/staff/shops/${shopId}/services`, {
                method: 'POST',
                body: { name: d.name.trim(), durationMinutes: Number(d.duration), priceKurus: parseLira(d.price), priceIsStartingFrom: d.from },
              }),
            ).then((ok) => ok && setAdding(null))
          }
        />
      ) : null}

      {removed.length > 0 ? (
        <>
          <Pressable onPress={() => setShowRemoved(!showRemoved)} style={styles.fold}>
            <Text weight="semibold" color={colors.ink2} style={{ flex: 1 }}>
              Kaldırılan hizmetler ({removed.length})
            </Text>
            <View style={{ transform: [{ rotate: showRemoved ? '90deg' : '0deg' }] }}>
              <Icon name="chevron" size={16} color={colors.muted} />
            </View>
          </Pressable>
          {showRemoved
            ? removed.map((s) => (
                <Appear key={s.id}>
                  <Card style={styles.removedRow}>
                    <View style={{ flex: 1 }}>
                      <Text weight="semibold" color={colors.ink2}>
                        {s.name}
                      </Text>
                      <Text size={13} color={colors.muted}>
                        {formatPrice(s.price_kurus, s.price_is_starting_from)}
                      </Text>
                    </View>
                    <Button
                      small
                      kind="ghost"
                      title="Geri ekle"
                      disabled={busy}
                      onPress={() => void run(() => api(`/staff/shops/${shopId}/services/${s.id}`, { method: 'PATCH', body: { active: true } }))}
                    />
                  </Card>
                </Appear>
              ))
            : null}
        </>
      ) : null}
    </>
  );
}

function ServiceFields({ draft, onChange, nameLocked = false }: { draft: Draft; onChange: (d: Draft) => void; nameLocked?: boolean }) {
  return (
    <>
      {nameLocked ? null : <Field label="Hizmet adı" value={draft.name} maxLength={80} onChangeText={(name) => onChange({ ...draft, name })} />}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field label="Süre (dk)" value={draft.duration} keyboardType="number-pad" onChangeText={(v) => onChange({ ...draft, duration: v.replace(/\D/g, '') })} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Fiyat (₺)" value={draft.price} keyboardType="decimal-pad" onChangeText={(price) => onChange({ ...draft, price })} />
        </View>
      </View>
      <Pressable onPress={() => onChange({ ...draft, from: !draft.from })} style={styles.check}>
        <Box on={draft.from} />
        <Text size={14}>Fiyatı “ve üzeri” olarak göster</Text>
      </Pressable>
    </>
  );
}

function CustomService(props: { busy: boolean; onCancel: () => void; onAdd: (d: Draft) => void }) {
  const [draft, setDraft] = useState<Draft>({ name: '', duration: '30', price: '', from: false });
  return (
    <Appear>
      <Card style={{ gap: 10, borderColor: colors.primary, borderWidth: 1.5 }}>
        <Text size={17} weight="heavy">
          Kendi hizmetiniz
        </Text>
        <ServiceFields draft={draft} onChange={setDraft} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button kind="secondary" title="Vazgeç" onPress={props.onCancel} disabled={props.busy} style={{ flex: 1 }} />
          <Button title="Ekle" onPress={() => props.onAdd(draft)} busy={props.busy} disabled={!draftOk(draft)} style={{ flex: 1 }} />
        </View>
      </Card>
    </Appear>
  );
}

function CatalogPicker(props: { existing: Set<number>; busy: boolean; onCancel: () => void; onAdd: (catalogId: number, priceKurus: number, from: boolean) => void }) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<CatalogItem | null>(null);
  const [price, setPrice] = useState('');
  const [from, setFrom] = useState(false);

  useEffect(() => {
    api<CatalogItem[]>('/catalog')
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return catalog.filter((c) => !props.existing.has(c.id) && (!q || c.name.toLocaleLowerCase('tr-TR').includes(q)));
  }, [catalog, query, props.existing]);

  return (
    <Appear>
      <Card style={{ gap: 10, borderColor: colors.primary, borderWidth: 1.5 }}>
        <Text size={17} weight="heavy">
          Listeden ekle
        </Text>
        {picked ? (
          <>
            <Text weight="bold">
              {picked.name} · {formatDuration(picked.duration_minutes)}
            </Text>
            <Field label="Fiyat (₺)" value={price} keyboardType="decimal-pad" onChangeText={setPrice} autoFocus />
            <Pressable onPress={() => setFrom(!from)} style={styles.check}>
              <Box on={from} />
              <Text size={14}>Fiyatı “ve üzeri” olarak göster</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button kind="secondary" title="Geri" onPress={() => setPicked(null)} disabled={props.busy} style={{ flex: 1 }} />
              <Button title="Ekle" onPress={() => props.onAdd(picked.id, parseLira(price)!, from)} busy={props.busy} disabled={parseLira(price) === null} style={{ flex: 1 }} />
            </View>
          </>
        ) : (
          <>
            <View style={styles.search}>
              <Icon name="search" size={18} color={colors.muted} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Hizmet ara…" placeholderTextColor={colors.muted} style={styles.searchInput} />
            </View>
            <View style={{ maxHeight: 320 }}>
              {shown.slice(0, 40).map((c) => (
                <Pressable key={c.id} onPress={() => setPicked(c)} style={({ pressed }) => [styles.row, styles.line, pressed && { backgroundColor: colors.surface2 }]}>
                  <Text weight="semibold" style={{ flex: 1 }}>
                    {c.name}
                  </Text>
                  <Text size={13} color={colors.muted}>
                    {formatDuration(c.duration_minutes)}
                  </Text>
                </Pressable>
              ))}
              {catalog.length > 0 && shown.length === 0 ? (
                <Text color={colors.muted} style={{ padding: 8 }}>
                  Listede yok. “Kendi hizmetiniz” ile ekleyin.
                </Text>
              ) : null}
            </View>
            <Button kind="secondary" title="Vazgeç" onPress={props.onCancel} />
          </>
        )}
      </Card>
    </Appear>
  );
}

// ---------------------------------------------------------------- Personel

type Member = { id: string; role: 'owner' | 'staff'; owner_label: 'owner' | 'co_owner' | null; display_name: string; bookable: boolean; active: boolean; phone: string };
type Plans = { plans: { id: string; name: string; maxStaff: number }[]; terms: { customQuoteAboveStaff: number } };
type Role = 'staff' | 'co_owner';
const roleOf = (m: Member) => (m.owner_label === 'owner' ? 'Sahibi' : m.role === 'owner' ? 'Ortak' : 'Personel');

function StaffTab({ shopId, myMemberId }: { shopId: string; myMemberId: string }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [plans, setPlans] = useState<Plans | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers(await api<Member[]>(`/staff/shops/${shopId}/members`));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [shopId]);

  useEffect(() => {
    load();
    api<Plans>('/public/plans')
      .then(setPlans)
      .catch(() => setPlans(null));
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const active = members?.filter((m) => m.active) ?? [];
  const removed = members?.filter((m) => !m.active) ?? [];
  const bookable = active.filter((m) => m.bookable).length;
  const plan = plans?.plans.find((p) => bookable <= p.maxStaff);

  return (
    <>
      {error ? <Alert text={error} /> : null}
      {plans && members ? (
        <View style={styles.planBox}>
          <Text size={13} color={colors.muted}>
            {bookable} kişi randevu alıyor · Paketiniz
          </Text>
          <Text size={17} weight="heavy">
            {plan ? plan.name : `${plans.terms.customQuoteAboveStaff}’dan fazla personel`}
          </Text>
        </View>
      ) : null}
      {!members ? <SkeletonList rows={2} /> : null}
      {members ? (
        <Card style={{ padding: 4 }}>
          {active.map((m, i) => (
            <View key={m.id} style={i < active.length - 1 && styles.line}>
              {editing === m.id ? (
                <MemberEditor
                  member={m}
                  isMe={m.id === myMemberId}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSave={(patch) => void run(() => api(`/staff/shops/${shopId}/members/${m.id}`, { method: 'PATCH', body: patch })).then((ok) => ok && setEditing(null))}
                  onRemove={() => void run(() => api(`/staff/shops/${shopId}/members/${m.id}`, { method: 'PATCH', body: { active: false } })).then((ok) => ok && setEditing(null))}
                />
              ) : (
                <Pressable onPress={() => (setEditing(m.id), setAdding(false))} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}>
                  <View style={styles.avatar}>
                    <Text weight="bold" color={colors.primary}>
                      {m.display_name.slice(0, 1).toLocaleUpperCase('tr-TR')}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text weight="semibold">
                      {m.display_name}
                      {m.id === myMemberId ? ' (siz)' : ''}
                    </Text>
                    <Text size={13} color={colors.muted}>
                      {formatPhone(m.phone)} · {m.bookable ? 'Randevu alıyor' : 'Randevu almıyor'}
                    </Text>
                  </View>
                  <Badge label={roleOf(m)} tone={m.role === 'owner' ? 'info' : 'muted'} />
                </Pressable>
              )}
            </View>
          ))}
        </Card>
      ) : null}
      {adding ? (
        <NewMember
          busy={busy}
          onCancel={() => setAdding(false)}
          onAdd={(body) => void run(() => api(`/staff/shops/${shopId}/members`, { method: 'POST', body })).then((ok) => ok && setAdding(false))}
        />
      ) : (
        <Button kind="secondary" title="+ Personel veya ortak ekle" onPress={() => (setAdding(true), setEditing(null))} />
      )}
      <Text size={13} color={colors.muted}>
        Eklediğiniz kişiler kendi telefon numaralarıyla giriş yapar. Yeni kişiler salonun saatleri ve tüm hizmetlerle başlar.
      </Text>
      {removed.length > 0 ? (
        <>
          <Pressable onPress={() => setShowRemoved(!showRemoved)} style={styles.fold}>
            <Text weight="semibold" color={colors.ink2} style={{ flex: 1 }}>
              Ayrılanlar ({removed.length})
            </Text>
            <View style={{ transform: [{ rotate: showRemoved ? '90deg' : '0deg' }] }}>
              <Icon name="chevron" size={16} color={colors.muted} />
            </View>
          </Pressable>
          {showRemoved
            ? removed.map((m) => (
                <Appear key={m.id}>
                  <Card style={styles.removedRow}>
                    <View style={{ flex: 1 }}>
                      <Text weight="semibold" color={colors.ink2}>
                        {m.display_name}
                      </Text>
                      <Text size={13} color={colors.muted}>
                        {formatPhone(m.phone)}
                      </Text>
                    </View>
                    <Button
                      small
                      kind="ghost"
                      title="Geri ekle"
                      disabled={busy}
                      onPress={() => void run(() => api(`/staff/shops/${shopId}/members`, { method: 'POST', body: { phone: m.phone, displayName: m.display_name, role: 'staff', bookable: true } }))}
                    />
                  </Card>
                </Appear>
              ))
            : null}
        </>
      ) : null}
    </>
  );
}

function MemberEditor(props: {
  member: Member;
  isMe: boolean;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: { displayName: string; bookable: boolean; role?: Role }) => void;
  onRemove: () => void;
}) {
  const m = props.member;
  const founder = m.owner_label === 'owner';
  const [name, setName] = useState(m.display_name);
  const [role, setRole] = useState<Role>(m.role === 'owner' ? 'co_owner' : 'staff');
  const [bookable, setBookable] = useState(m.bookable);
  const canChangeRole = !founder && !props.isMe;

  return (
    <Appear style={{ gap: 10, padding: 12 }}>
      <Field label="Müşterilerin göreceği ad" value={name} maxLength={60} onChangeText={setName} />
      {canChangeRole ? <RolePicker value={role} onChange={setRole} /> : null}
      {role === 'co_owner' ? (
        <Text size={13} color={colors.muted}>
          Ortak, sizinle aynı yetkilere sahiptir: hizmetler, fiyatlar, personel ve salon bilgileri.
        </Text>
      ) : null}
      <View style={styles.switchRow}>
        <Text weight="semibold">Randevu alıyor</Text>
        <Switch value={bookable} onValueChange={setBookable} trackColor={{ true: colors.primary, false: colors.line }} thumbColor={colors.white} />
      </View>
      {m.bookable ? (
        <Pressable onPress={() => router.push(`/isletme/calisma-saatleri?kisi=${m.id}`)} hitSlop={6}>
          <Text weight="bold" color={colors.primary}>
            Çalışma saatleri ve molalar ›
          </Text>
        </Pressable>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        {!founder && !props.isMe ? (
          <Pressable
            hitSlop={8}
            onPress={() =>
              NativeAlert.alert('Ekipten çıkar', `${m.display_name} ekipten çıkarılacak ve uygulamaya giremeyecek. Yaklaşan randevusu varsa önce onları iptal edin.`, [
                { text: 'Vazgeç', style: 'cancel' },
                { text: 'Evet, çıkar', style: 'destructive', onPress: props.onRemove },
              ])
            }
          >
            <Text weight="bold" color={colors.danger}>
              Ekipten çıkar
            </Text>
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }} />
        <Button small kind="secondary" title="Vazgeç" onPress={props.onCancel} disabled={props.busy} />
        <Button small title="Kaydet" busy={props.busy} disabled={!name.trim()} onPress={() => props.onSave({ displayName: name.trim(), bookable, ...(canChangeRole ? { role } : {}) })} />
      </View>
    </Appear>
  );
}

function NewMember(props: { busy: boolean; onCancel: () => void; onAdd: (body: { displayName: string; phone: string; role: Role; bookable: boolean }) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const [bookable, setBookable] = useState(true);
  const ok = name.trim().length > 0 && phoneComplete(phone);
  return (
    <Appear>
      <Card style={{ gap: 10, borderColor: colors.primary, borderWidth: 1.5 }}>
        <Text size={17} weight="heavy">
          Yeni kişi
        </Text>
        <RolePicker value={role} onChange={setRole} />
        <Field label="Ad" value={name} maxLength={60} onChangeText={setName} />
        <Field label="Cep telefonu" value={formatPhoneInput(phone)} keyboardType="phone-pad" maxLength={14} placeholder="05xx xxx xx xx" onChangeText={(v) => setPhone(phoneDigits(v))} />
        {role === 'co_owner' ? (
          <Text size={13} color={colors.muted}>
            Ortak, sizinle aynı yetkilere sahiptir: hizmetler, fiyatlar, personel ve salon bilgileri.
          </Text>
        ) : null}
        <View style={styles.switchRow}>
          <Text weight="semibold">Randevu alıyor</Text>
          <Switch value={bookable} onValueChange={setBookable} trackColor={{ true: colors.primary, false: colors.line }} thumbColor={colors.white} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button kind="secondary" title="Vazgeç" onPress={props.onCancel} disabled={props.busy} style={{ flex: 1 }} />
          <Button title="Ekle" onPress={() => props.onAdd({ displayName: name.trim(), phone, role, bookable })} busy={props.busy} disabled={!ok} style={{ flex: 1 }} />
        </View>
      </Card>
    </Appear>
  );
}

function RolePicker({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <View style={styles.segmented}>
      {(['staff', 'co_owner'] as const).map((r) => (
        <Pressable
          key={r}
          onPress={() => onChange(r)}
          style={[styles.segment, value === r && { backgroundColor: colors.primary }]}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === r }}
        >
          <Text weight="bold" color={value === r ? colors.white : colors.ink2}>
            {r === 'staff' ? 'Personel' : 'Ortak'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- shared

function Section({ title }: { title: string }) {
  return (
    <Text size={13} weight="bold" color={colors.muted} style={{ letterSpacing: 1, marginTop: 6 }}>
      {title.toLocaleUpperCase('tr-TR')}
    </Text>
  );
}

function Area(props: { label: string; value: string; maxLength: number; placeholder: string; onChange: (v: string) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text size={14} weight="semibold" color={colors.ink2}>
        {props.label}
      </Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChange}
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        placeholderTextColor={colors.muted}
        multiline
        style={[styles.input, { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' }]}
      />
    </View>
  );
}

function Box({ on }: { on: boolean }) {
  return (
    <View style={[styles.box, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
      {on ? (
        <Text size={12} weight="bold" color={colors.white}>
          ✓
        </Text>
      ) : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    type: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
    typeOn: { borderColor: colors.primary, backgroundColor: colors.surface2 },
    input: {
      minHeight: 50,
      paddingHorizontal: 14,
      borderWidth: 1.5,
      borderColor: colors.line,
      borderRadius: radius.sm,
      backgroundColor: colors.surface,
      fontFamily: fonts.regular,
      fontSize: 16,
      color: colors.ink,
    },
    photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    photo: { width: '31.5%', aspectRatio: 1, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface2 },
    cover: { position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: 'rgba(11,17,32,0.75)' },
    line: { borderBottomWidth: 1, borderBottomColor: colors.line },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 58, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm },
    fold: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 16, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line },
    removedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface2 },
    check: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
    search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 46, borderRadius: radius.sm, backgroundColor: colors.surface2 },
    searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, paddingVertical: 8 },
    planBox: { gap: 2, padding: 14, borderRadius: radius.md, backgroundColor: colors.primarySoft },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    segmented: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.sm, backgroundColor: colors.surface2 },
    segment: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  }),
);
