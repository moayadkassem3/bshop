'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import reg from '@/components/register/register.module.css';
import { PhoneInput } from '@/components/PhoneInput';
import { DistrictSelect, focusFor } from '@/components/register/places';
import { PROVINCES } from '@/components/register/provinces';
import { SALON_TYPES, type SalonType } from '@/components/register/salonTypes';
import { api, ApiError, errorMessage } from '@/lib/api';
import { uploadImage } from '@/lib/image';
import { getToken } from '@/lib/session';
import { phoneComplete } from '@/lib/phone';
import { formatPhone, photoUrl } from '@/lib/shop';
import own from './settings.module.css';

const LocationPicker = dynamic(() => import('@/components/register/LocationPicker').then((m) => m.LocationPicker), {
  ssr: false,
  loading: () => <div className={reg.picker} />,
});

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
  audience: SalonType;
};

type Form = {
  audience: SalonType;
  name: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  about: string;
  city: string;
  district: string;
  address: string;
  point: { lat: number; lng: number } | null;
};

type Photo = { id: string };

const toForm = (s: Settings): Form => ({
  audience: s.audience,
  name: s.name,
  phone: s.phone ? formatPhone(s.phone) : '',
  whatsapp: s.whatsapp ? formatPhone(s.whatsapp) : '',
  instagram: s.instagram ? `@${s.instagram}` : '',
  about: s.about ?? '',
  city: s.city ?? '',
  district: s.district ?? '',
  address: s.address ?? '',
  point: s.latitude !== null && s.longitude !== null ? { lat: s.latitude, lng: s.longitude } : null,
});



function problem(f: Form): string | null {
  if (f.name.trim().length < 2) return 'İşletme adını yazın.';
  if (!phoneComplete(f.phone, 'any')) return 'Salon telefonunu 11 haneli yazın (0 ile başlayarak).';
  if (f.whatsapp && !phoneComplete(f.whatsapp)) return 'WhatsApp için 05 ile başlayan 11 haneli cep numarası yazın.';
  if (!f.city) return 'İli seçin.';
  if (f.district.trim().length < 2) return 'İlçeyi seçin.';
  if (f.address.trim().length < 5) return 'Açık adresi yazın.';
  return f.point ? null : 'Haritada salonunuzun yerini işaretleyin.';
}

/**
 * Salon tab of Salon bilgileri (v1.7): who the salon serves, contact details,
 * address and map pin, and photos. The salon's link and QR code stay the same
 * when the name changes.
 */
export function SalonTab({ shopId, slug, visible }: { shopId: string; slug: string; visible: boolean }) {
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState<Form | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadPhotos = useCallback(async () => {
    if (!shopId) return;
    setPhotos(await api<Photo[]>(`/staff/shops/${shopId}/photos`).catch(() => []));
  }, [shopId]);

  useEffect(() => {
    setForm(null);
    api<Settings>(`/staff/shops/${shopId}/settings`)
      .then((s) => {
        setForm(toForm(s));
        setSaved(toForm(s));
      })
      .catch((err) => setMessage({ ok: false, text: errorMessage(err) }));
    loadPhotos();
  }, [shopId, loadPhotos]);

  const update = (patch: Partial<Form>) => {
    setMessage(null);
    setForm((f) => (f ? { ...f, ...patch } : f));
  };

  async function save() {
    if (!form || !shopId) return;
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
      setMessage({ ok: true, text: 'Değişiklikler kaydedildi.' });
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof ApiError && err.code === 'VALIDATION' ? 'Bazı bilgiler eksik veya hatalı görünüyor.' : errorMessage(err),
      });
    } finally {
      setBusy(false);
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length || !shopId) return;
    setBusy(true);
    setMessage(null);
    for (const file of Array.from(files).slice(0, 12 - photos.length)) {
      const res = await uploadImage(`/api/staff/shops/${shopId}/photos`, file, getToken());
      if (!res.ok) {
        setMessage({ ok: false, text: errorMessage(new ApiError(res.status, (await res.json().catch(() => ({}))).error ?? 'UNKNOWN')) });
        break;
      }
    }
    if (fileInput.current) fileInput.current.value = '';
    await loadPhotos();
    setBusy(false);
  }

  async function removePhoto(id: string) {
    if (!shopId) return;
    await api(`/staff/shops/${shopId}/photos/${id}`, { method: 'DELETE' }).catch((err) => setMessage({ ok: false, text: errorMessage(err) }));
    await loadPhotos();
  }

  async function makeCover(id: string) {
    if (!shopId) return;
    const order = [id, ...photos.map((p) => p.id).filter((p) => p !== id)];
    await api(`/staff/shops/${shopId}/photos/order`, { method: 'PUT', body: order }).catch((err) => setMessage({ ok: false, text: errorMessage(err) }));
    await loadPhotos();
  }

  const blocker = form ? problem(form) : null;
  const changed = JSON.stringify(form) !== JSON.stringify(saved);

  return (
    <div hidden={!visible}>
      {!form && message && <p className="alert alert-danger">{message.text}</p>}
        {form && (
          <>
            <section className={own.section} aria-labelledby="s-type">
              <h2 id="s-type">Müşterileriniz kimler?</h2>
              <div className={reg.types} role="radiogroup" aria-labelledby="s-type">
                {SALON_TYPES.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={form.audience === o.value}
                    className={`${reg.type} ${own.type} ${form.audience === o.value ? reg.selected : ''}`}
                    onClick={() => update({ audience: o.value })}
                  >
                    <span className={reg.typeIcon} aria-hidden>
                      {o.icon}
                    </span>
                    <span>
                      <strong>{o.label}</strong>
                      <span>{o.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className={`card ${own.section} ${own.card}`} aria-labelledby="s-info">
              <h2 id="s-info">Bilgiler</h2>
              <div className="field">
                <label htmlFor="s-name">İşletme adı</label>
                <input id="s-name" className="input" maxLength={80} value={form.name} onChange={(e) => update({ name: e.target.value })} />
                <p className={reg.help}>Ad değişse de salon bağlantınız (/{slug}) ve QR kodunuz aynı kalır.</p>
              </div>
              <div className="field">
                <label htmlFor="s-phone">Salon telefonu</label>
                <PhoneInput id="s-phone" value={form.phone} onChange={(phone) => update({ phone })} />
              </div>
              <div className="field">
                <label htmlFor="s-wa">WhatsApp (isteğe bağlı)</label>
                <PhoneInput id="s-wa" value={form.whatsapp} onChange={(whatsapp) => update({ whatsapp })} />
              </div>
              <div className="field">
                <label htmlFor="s-ig">Instagram (isteğe bağlı)</label>
                <input id="s-ig" className="input" autoCapitalize="none" placeholder="@kullaniciadi" value={form.instagram} onChange={(e) => update({ instagram: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="s-about">Hakkında (isteğe bağlı)</label>
                <textarea id="s-about" className={`input ${reg.textarea}`} maxLength={600} value={form.about} onChange={(e) => update({ about: e.target.value })} />
              </div>
            </section>

            <section className={`card ${own.section} ${own.card}`} aria-labelledby="s-address">
              <h2 id="s-address">Adres</h2>
              <div className={reg.row}>
                <div className="field">
                  <label htmlFor="s-city">İl</label>
                  <select id="s-city" className={`input ${reg.select}`} value={form.city} onChange={(e) => update({ city: e.target.value, district: '' })}>
                    <option value="">Seçin</option>
                    {PROVINCES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="s-district">İlçe</label>
                  <DistrictSelect id="s-district" city={form.city} value={form.district} onChange={(district) => update({ district })} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="s-addr">Açık adres</label>
                <textarea id="s-addr" className={`input ${reg.textarea}`} maxLength={300} value={form.address} onChange={(e) => update({ address: e.target.value })} />
              </div>
              <div className="field">
                <span className={reg.fieldLabel}>Haritadaki yeri</span>
                <LocationPicker key={shopId} value={form.point} onChange={(point) => update({ point })} focus={focusFor(form.city, form.district)} />
              </div>
            </section>

            <section className={`card ${own.section} ${own.card}`} aria-labelledby="s-photos">
              <h2 id="s-photos">Fotoğraflar ({photos.length}/12)</h2>
              <p className={reg.help}>İlk fotoğraf kapak olur.</p>
              <ul className={reg.photos} role="list">
                {photos.map((p, i) => (
                  <li key={p.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl(p.id)} alt={`Fotoğraf ${i + 1}`} />
                    {i === 0 ? (
                      <span className={reg.photoBadge}>Kapak</span>
                    ) : (
                      <button type="button" className={own.cover} onClick={() => makeCover(p.id)}>
                        Kapak yap
                      </button>
                    )}
                    <button type="button" className={own.removePhoto} onClick={() => removePhoto(p.id)} aria-label={`Fotoğraf ${i + 1} sil`}>
                      ×
                    </button>
                  </li>
                ))}
                {photos.length < 12 && (
                  <li>
                    <button type="button" className={reg.addPhoto} onClick={() => fileInput.current?.click()} disabled={busy}>
                      <span aria-hidden>+</span>
                      Ekle
                    </button>
                  </li>
                )}
              </ul>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
            </section>
          </>
        )}

      {form && visible && (
        <div className={own.saveBar}>
          <div className="container narrow">
            {message && <p className={message.ok ? own.ok : own.bad}>{message.text}</p>}
            {!message && changed && blocker && <p className={own.bad}>{blocker}</p>}
            <button type="button" className="btn btn-primary btn-block" disabled={busy || !changed || !!blocker} onClick={save}>
              {busy ? 'Kaydediliyor…' : changed ? 'Değişiklikleri kaydet' : 'Kaydedildi'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
