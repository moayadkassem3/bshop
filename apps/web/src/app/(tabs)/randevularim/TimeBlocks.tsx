'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { formatTime } from '@/lib/format';
import biz from './business.module.css';
import styles from './appointments.module.css';

export type TimeOff = { id: string; staff_id: string; staff_name: string; kind: 'block' | 'absence'; starts_at: string; ends_at: string; note: string | null };
type Member = { id: string; display_name: string };

/** A closed time in the day's list: "16:00–17:00 · Kapalı · Doktor", with Kaldır (v1.7). */
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
    <article className={`card ${biz.card} ${biz.closed}`}>
      <div className={biz.closedRow}>
        <span className={biz.closedTime}>{allDay ? 'Tüm gün' : `${formatTime(t.starts_at)}–${formatTime(t.ends_at)}`}</span>
        <span className={biz.closedText}>
          <strong>{t.kind === 'absence' ? 'İzinli' : 'Kapalı'}</strong>
          {(props.showStaff || t.note) && (
            <span>
              {props.showStaff ? t.staff_name : ''}
              {props.showStaff && t.note ? ' · ' : ''}
              {t.note}
            </span>
          )}
        </span>
        {t.kind === 'block' && (
          <button type="button" className={styles.cancel} disabled={busy} onClick={remove}>
            Kaldır
          </button>
        )}
      </div>
      {error && <p className="alert alert-danger">{error}</p>}
    </article>
  );
}

/**
 * "Saat kapat" (v1.7): close a time once for one person (a doctor's visit, a
 * meeting) or the whole day. Customers cannot book it; it fails if appointments
 * are already there.
 */
export function BlockForm(props: { shopId: string; date: string; members: Member[]; myMemberId: string; isOwner: boolean; onDone: () => void; onClose: () => void }) {
  const [staffId, setStaffId] = useState(props.isOwner && props.members.length ? (props.members.find((m) => m.id === props.myMemberId)?.id ?? props.members[0]!.id) : props.myMemberId);
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState('13:00');
  const [end, setEnd] = useState('14:00');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = allDay || (start && end && end > start);

  async function save() {
    setBusy(true);
    setError(null);
    const startsAt = new Date(`${props.date}T${allDay ? '00:00' : start}:00+03:00`);
    const endsAt = allDay ? new Date(startsAt.getTime() + 86_400_000) : new Date(`${props.date}T${end}:00+03:00`);
    try {
      await api(`/staff/shops/${props.shopId}/blocks`, {
        method: 'POST',
        body: { staffId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), note: note.trim() || null },
      });
      props.onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className={`card ${biz.blockForm}`}>
      <p className={biz.offerTitle}>Saat kapat</p>
      {props.isOwner && props.members.length > 1 && (
        <div className="field">
          <label htmlFor="b-staff">Kim için</label>
          <select id="b-staff" className="input" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            {props.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </div>
      )}
      <label className={biz.check}>
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        Tüm gün kapalı
      </label>
      {!allDay && (
        <div className={biz.timeRow}>
          <div className="field">
            <label htmlFor="b-start">Başlangıç</label>
            <input id="b-start" className="input" type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="b-end">Bitiş</label>
            <input id="b-end" className="input" type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
      )}
      <div className="field">
        <label htmlFor="b-note">Not (isteğe bağlı)</label>
        <input id="b-note" className="input" maxLength={200} placeholder="Örn. Doktor randevusu" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <p className={biz.deadline}>Müşteriler bu saatte randevu alamaz. Bu saatte randevu varsa önce onları iptal edin.</p>
      {error && <p className="alert alert-danger">{error}</p>}
      <div className={biz.actions}>
        <button type="button" className="btn" disabled={busy} onClick={props.onClose}>
          Vazgeç
        </button>
        <button type="button" className="btn btn-primary" disabled={busy || !valid} onClick={save}>
          {allDay ? 'Günü kapat' : `${start}–${end} kapat`}
        </button>
      </div>
    </div>
  );
}

