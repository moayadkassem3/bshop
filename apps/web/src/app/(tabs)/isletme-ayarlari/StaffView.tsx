'use client';

import { useCallback, useEffect, useState } from 'react';
import { StaffAvatar } from '@/components/StaffAvatar';
import { SkeletonList } from '@/components/Skeleton';
import { api, errorMessage } from '@/lib/api';
import { formatDuration, formatPrice } from '@/lib/format';
import { AUDIENCE, formatPhone } from '@/lib/shop';
import own from './settings.module.css';

type Settings = {
  name: string;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  about: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  audience: keyof typeof AUDIENCE;
};
type Service = { id: string; name: string; duration_minutes: number; price_kurus: number; price_is_starting_from: boolean; active: boolean };
type Member = { id: string; role: 'owner' | 'staff'; owner_label: 'owner' | 'co_owner' | null; display_name: string; active: boolean; photo_id: string | null };
type Mine = { service_id: string; duration_minutes: number | null };

const roleOf = (m: Member) => (m.owner_label === 'owner' ? 'Sahibi' : m.role === 'owner' ? 'Ortak' : 'Personel');

/**
 * Salon bilgileri for staff (founder, 14 November 2026): the same three tabs as the owners',
 * to read. The one thing staff change here is which of the salon's services they give.
 */
export function StaffView({ shopId, memberId, tab }: { shopId: string; memberId: string; tab: 'salon' | 'hizmetler' | 'personel' }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [services, setServices] = useState<Service[] | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [mine, setMine] = useState<Mine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

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
    setSaving(service.id);
    setMine(next);
    try {
      await api(`/staff/shops/${shopId}/members/${memberId}/services`, { method: 'PUT', body: next.map((x) => ({ serviceId: x.service_id, durationMinutes: x.duration_minutes })) });
      setError(null);
    } catch (err) {
      setMine(mine);
      setError(errorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  if (error && !settings) return <p className="alert alert-danger">{error}</p>;
  if (!settings || !services || !members || !mine) return <SkeletonList rows={3} label="Salon bilgileri yükleniyor" />;

  const place = [settings.address, [settings.district, settings.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  const facts: [string, string | null][] = [
    ['Salon adı', settings.name],
    ['Salon türü', AUDIENCE[settings.audience] ?? null],
    ['Telefon', settings.phone ? formatPhone(settings.phone) : null],
    ['WhatsApp', settings.whatsapp ? formatPhone(settings.whatsapp) : null],
    ['Instagram', settings.instagram ? `@${settings.instagram}` : null],
    ['Adres', place || null],
    ['Hakkında', settings.about],
  ];

  return (
    <>
      {error && <p className="alert alert-danger">{error}</p>}
      {tab === 'salon' && (
        <>
          <p className={own.intro}>Bu bilgileri salon sahibi ve ortaklar değiştirebilir.</p>
          <dl className={`card ${own.facts}`}>
            {facts
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
        </>
      )}
      {tab === 'hizmetler' && (
        <>
          <p className={own.intro}>Verdiğiniz hizmetleri işaretleyin: müşteriler sizden yalnızca bunlar için randevu alabilir. Hizmetleri ve fiyatları salon sahibi belirler.</p>
          {services.length === 0 ? (
            <p className={own.intro}>Salonun henüz hizmeti yok.</p>
          ) : (
            <ul className={`card ${own.list}`} role="list">
              {services.map((s) => {
                const on = mine.some((x) => x.service_id === s.id);
                return (
                  <li key={s.id}>
                    <label className={own.row}>
                      <span className={own.rowMain}>
                        <strong>{s.name}</strong>
                        <span>
                          {formatDuration(mine.find((x) => x.service_id === s.id)?.duration_minutes ?? s.duration_minutes)} · {formatPrice(s.price_kurus, s.price_is_starting_from)}
                        </span>
                      </span>
                      <span className={own.check}>
                        <input type="checkbox" checked={on} disabled={saving !== null} onChange={() => void toggle(s)} aria-label={`${s.name}: bu hizmeti veriyorum`} />
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {tab === 'personel' && (
        <ul className={`card ${own.list}`} role="list">
          {members.map((m) => (
            <li key={m.id}>
              <div className={own.row} style={{ cursor: 'default' }}>
                <StaffAvatar name={m.display_name} photoId={m.photo_id} className={own.avatar} />
                <span className={own.rowMain}>
                  <strong>
                    {m.display_name}
                    {m.id === memberId && <em> (siz)</em>}
                  </strong>
                  <span>{roleOf(m)}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
