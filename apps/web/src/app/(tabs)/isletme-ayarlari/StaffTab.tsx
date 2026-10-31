'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { PhoneInput } from '@/components/PhoneInput';
import { formatPrice } from '@/lib/format';
import { phoneComplete } from '@/lib/phone';
import { formatPhone } from '@/lib/shop';
import own from './settings.module.css';

type Member = {
  id: string;
  role: 'owner' | 'staff';
  owner_label: 'owner' | 'co_owner' | null;
  display_name: string;
  bookable: boolean;
  active: boolean;
  phone: string;
};
type Plans = { plans: { id: string; name: string; maxStaff: number; monthlyPriceKurus: number }[]; terms: { customQuoteAboveStaff: number } };
type Role = 'staff' | 'co_owner';

const roleOf = (m: Member) => (m.owner_label === 'owner' ? 'Sahibi' : m.role === 'owner' ? 'Ortak' : 'Personel');

/**
 * Personel tab (v1.7): owners and co-owners add people, rename them, make them
 * co-owners, choose whether they take appointments, and remove them. The
 * founding owner cannot be removed; nobody can remove themselves.
 */
export function StaffTab({ shopId, myMemberId, visible }: { shopId: string; myMemberId: string; visible: boolean }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [plans, setPlans] = useState<Plans | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
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
      .catch(() => undefined);
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
    <div hidden={!visible}>
      {error && <p className="alert alert-danger">{error}</p>}
      {plans && (
        <div className={own.planBox}>
          <div>
            <span>{bookable} kişi randevu alıyor</span>
            <strong>{plan ? plan.name : `${plans.terms.customQuoteAboveStaff}’dan fazla personel`}</strong>
          </div>
          {plan ? (
            <span className={own.planPrice}>
              {formatPrice(plan.monthlyPriceKurus)}
              <small>/ay</small>
            </span>
          ) : (
            <Link href={`/teklif-al?kaynak=ayarlar&personel=${bookable}`}>Teklif alın ›</Link>
          )}
        </div>
      )}

      <ul className={`card ${own.list}`} role="list">
        {active.map((m) =>
          editing === m.id ? (
            <li key={m.id} className={own.editRow}>
              <MemberEditor
                member={m}
                isMe={m.id === myMemberId}
                busy={busy}
                onCancel={() => setEditing(null)}
                onSave={async (patch) => {
                  if (await run(() => api(`/staff/shops/${shopId}/members/${m.id}`, { method: 'PATCH', body: patch }))) setEditing(null);
                }}
                onRemove={async () => {
                  if (await run(() => api(`/staff/shops/${shopId}/members/${m.id}`, { method: 'PATCH', body: { active: false } }))) setEditing(null);
                }}
              />
            </li>
          ) : (
            <li key={m.id}>
              <button type="button" className={own.row} onClick={() => { setEditing(m.id); setAdding(false); }}>
                <span className={own.avatar} aria-hidden>
                  {m.display_name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join('')
                    .toLocaleUpperCase('tr')}
                </span>
                <span className={own.rowMain}>
                  <strong>
                    {m.display_name}
                    {m.id === myMemberId && <em> (siz)</em>}
                  </strong>
                  <span>
                    {formatPhone(m.phone)} · {m.bookable ? 'Randevu alıyor' : 'Randevu almıyor'}
                  </span>
                </span>
                <span className={`badge ${m.role === 'owner' ? 'badge-info' : 'badge-muted'}`}>{roleOf(m)}</span>
                <span className={own.chevron} aria-hidden>
                  ›
                </span>
              </button>
            </li>
          ),
        )}
      </ul>

      {adding ? (
        <NewMember
          busy={busy}
          onCancel={() => setAdding(false)}
          onAdd={async (body) => {
            if (await run(() => api(`/staff/shops/${shopId}/members`, { method: 'POST', body }))) setAdding(false);
          }}
        />
      ) : (
        <button type="button" className={`btn btn-block ${own.addOne}`} onClick={() => { setAdding(true); setEditing(null); }}>
          + Personel veya ortak ekle
        </button>
      )}
      <p className={own.intro}>Eklediğiniz kişiler kendi telefon numaralarıyla “İşletmeyim” girişinden girer. Yeni kişiler salonun saatleri ve tüm hizmetlerle başlar.</p>

      {removed.length > 0 && (
        <details className={own.removed}>
          <summary>Ayrılanlar ({removed.length})</summary>
          <ul className={`card ${own.list}`} role="list">
            {removed.map((m) => (
              <li key={m.id} className={own.removedRow}>
                <span className={own.rowMain}>
                  <strong>{m.display_name}</strong>
                  <span>{formatPhone(m.phone)}</span>
                </span>
                <button
                  type="button"
                  className={own.link}
                  disabled={busy}
                  onClick={() => run(() => api(`/staff/shops/${shopId}/members`, { method: 'POST', body: { phone: m.phone, displayName: m.display_name, role: 'staff', bookable: true } }))}
                >
                  Geri ekle
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
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
  const [confirmRemove, setConfirmRemove] = useState(false);
  const canChangeRole = !founder && !props.isMe;

  return (
    <div className={own.fields}>
      <div className="field">
        <label htmlFor={`m-${m.id}`}>Müşterilerin göreceği ad</label>
        <input id={`m-${m.id}`} className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {canChangeRole && (
        <div className={own.segmented} role="radiogroup" aria-label="Rol">
          {(['staff', 'co_owner'] as const).map((r) => (
            <button key={r} type="button" role="radio" aria-checked={role === r} className={role === r ? own.segOn : ''} onClick={() => setRole(r)}>
              {r === 'staff' ? 'Personel' : 'Ortak'}
            </button>
          ))}
        </div>
      )}
      {role === 'co_owner' && <p className={own.intro}>Ortak, sizinle aynı yetkilere sahiptir: hizmetler, fiyatlar, personel ve salon bilgileri.</p>}
      <label className={own.check}>
        <input type="checkbox" checked={bookable} onChange={(e) => setBookable(e.target.checked)} />
        Randevu alıyor
      </label>
      {m.bookable && (
        <Link href={`/calisma-saatleri?kisi=${m.id}`} className={own.hoursLink}>
          Çalışma saatleri ve molalar ›
        </Link>
      )}
      {confirmRemove ? (
        <div className={own.confirm}>
          <p>{m.display_name} ekipten çıkarılacak ve uygulamaya giremeyecek. Yaklaşan randevusu varsa önce onları iptal edin.</p>
          <div className={own.panelActions}>
            <button type="button" className="btn" onClick={() => setConfirmRemove(false)}>
              Vazgeç
            </button>
            <button type="button" className={`btn ${own.dangerBtn}`} disabled={props.busy} onClick={props.onRemove}>
              Evet, çıkar
            </button>
          </div>
        </div>
      ) : (
        <div className={own.rowActions}>
          {!founder && !props.isMe ? (
            <button type="button" className={own.danger} onClick={() => setConfirmRemove(true)}>
              Ekipten çıkar
            </button>
          ) : (
            <span />
          )}
          <span />
          <button type="button" className="btn" onClick={props.onCancel} disabled={props.busy}>
            Vazgeç
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={props.busy || !name.trim()}
            onClick={() => props.onSave({ displayName: name.trim(), bookable, ...(canChangeRole ? { role } : {}) })}
          >
            Kaydet
          </button>
        </div>
      )}
    </div>
  );
}

function NewMember(props: { busy: boolean; onCancel: () => void; onAdd: (body: { displayName: string; phone: string; role: Role; bookable: boolean }) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const [bookable, setBookable] = useState(true);
  const ok = name.trim().length > 0 && phoneComplete(phone);
  return (
    <div className={`card ${own.panel}`}>
      <h3>Yeni kişi</h3>
      <div className={own.segmented} role="radiogroup" aria-label="Rol">
        {(['staff', 'co_owner'] as const).map((r) => (
          <button key={r} type="button" role="radio" aria-checked={role === r} className={role === r ? own.segOn : ''} onClick={() => setRole(r)}>
            {r === 'staff' ? 'Personel' : 'Ortak'}
          </button>
        ))}
      </div>
      <div className={own.pair}>
        <div className="field">
          <label htmlFor="n-name">Ad</label>
          <input id="n-name" className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="n-phone">Cep telefonu</label>
          <PhoneInput id="n-phone" value={phone} autoComplete="off" onChange={setPhone} />
        </div>
      </div>
      {role === 'co_owner' && <p className={own.intro}>Ortak, sizinle aynı yetkilere sahiptir: hizmetler, fiyatlar, personel ve salon bilgileri.</p>}
      <label className={own.check}>
        <input type="checkbox" checked={bookable} onChange={(e) => setBookable(e.target.checked)} />
        Randevu alıyor
      </label>
      <div className={own.panelActions}>
        <button type="button" className="btn" onClick={props.onCancel}>
          Vazgeç
        </button>
        <button type="button" className="btn btn-primary" disabled={props.busy || !ok} onClick={() => props.onAdd({ displayName: name.trim(), phone, role, bookable })}>
          Ekle
        </button>
      </div>
    </div>
  );
}
