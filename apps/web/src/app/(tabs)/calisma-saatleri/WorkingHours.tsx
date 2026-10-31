'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import { BackArrow } from '@/components/BackArrow';
import page from '../randevularim/appointments.module.css';
import biz from '../randevularim/business.module.css';
import styles from './hours.module.css';

type Window = { weekday: number; startMinute: number; endMinute: number };
type Member = { id: string; display_name: string; bookable: boolean; active: boolean };
/** One weekday as people think of it: open–close, with breaks in between. */
type Day = { open: boolean; start: number; end: number; breaks: { start: number; end: number }[] };

const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const DEFAULT_DAY: Day = { open: true, start: 9 * 60, end: 19 * 60, breaks: [] };

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const minutes = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

function toDays(windows: Window[]): Day[] {
  return DAYS.map((_, i) => {
    const w = windows.filter((x) => x.weekday === i + 1).sort((a, b) => a.startMinute - b.startMinute);
    if (w.length === 0) return { ...DEFAULT_DAY, open: false };
    return {
      open: true,
      start: w[0]!.startMinute,
      end: w[w.length - 1]!.endMinute,
      breaks: w.slice(1).map((x, j) => ({ start: w[j]!.endMinute, end: x.startMinute })),
    };
  });
}

function toWindows(days: Day[]): Window[] {
  return days.flatMap((d, i) => {
    if (!d.open) return [];
    const cuts = [...d.breaks].sort((a, b) => a.start - b.start);
    const out: Window[] = [];
    let from = d.start;
    for (const b of cuts) {
      out.push({ weekday: i + 1, startMinute: from, endMinute: b.start });
      from = b.end;
    }
    out.push({ weekday: i + 1, startMinute: from, endMinute: d.end });
    return out;
  });
}

/** What is wrong with a day, in words, or null. */
function problem(d: Day): string | null {
  if (!d.open) return null;
  if (d.end <= d.start) return 'Kapanış, açılıştan sonra olmalı.';
  const cuts = [...d.breaks].sort((a, b) => a.start - b.start);
  let last = d.start;
  for (const b of cuts) {
    if (b.end <= b.start) return 'Molanın bitişi, başlangıcından sonra olmalı.';
    if (b.start <= last || b.end >= d.end) return 'Molalar açılış ile kapanış arasında olmalı ve çakışmamalı.';
    last = b.end;
  }
  return null;
}

function summary(d: Day) {
  if (!d.open) return 'Kapalı';
  const breaks = [...d.breaks].sort((a, b) => a.start - b.start);
  return (
    <>
      <span>{`${hhmm(d.start)}–${hhmm(d.end)}`}</span>
      {breaks.length > 0 && (
        <small>
          Mola{' '}
          {breaks.map((b, i) => (
            <span key={b.start}>
              {`${hhmm(b.start)}–${hhmm(b.end)}`}
              {i < breaks.length - 1 ? ', ' : ''}
            </span>
          ))}
        </small>
      )}
    </>
  );
}

/** A break that fits: 13:00–14:00 when possible, else an hour in the middle of the free part. */
function nextBreak(d: Day): { start: number; end: number } | null {
  const taken = [...d.breaks].sort((a, b) => a.start - b.start);
  const free: [number, number][] = [];
  let from = d.start;
  for (const b of taken) {
    free.push([from, b.start]);
    from = b.end;
  }
  free.push([from, d.end]);
  const lunch = free.find(([s, e]) => s < 13 * 60 && e > 14 * 60);
  if (lunch) return { start: 13 * 60, end: 14 * 60 };
  const longest = free.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
  const room = longest[1] - longest[0];
  if (room < 90) return null;
  const length = room >= 150 ? 60 : 30;
  const start = Math.round((longest[0] + (room - length) / 2) / 15) * 15;
  return { start, end: start + length };
}

/**
 * Çalışma saatleri (v1.7): when each person takes appointments, per weekday,
 * with breaks. Staff edit their own; owners anyone's, and can copy one person's
 * week to the whole team. Existing appointments are never moved.
 */
export function WorkingHours() {
  const { shops, shop, shopId, selectShop, error: shopsError } = useBusinessShops();
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

  // Whose week: ?kisi=<member> from Personel, else your own.
  useEffect(() => {
    if (!shop) return;
    const asked = new URLSearchParams(window.location.search).get('kisi');
    setMemberId(asked && shop.role === 'owner' ? asked : shop.member_id);
    setEveryone(false);
    if (shop.role !== 'owner') return setMembers([]);
    api<Member[]>(`/staff/shops/${shop.id}/members`)
      .then((all) => setMembers(all.filter((m) => m.active && m.bookable)))
      .catch((err) => setError(errorMessage(err)));
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
    <>
      <header className={`page-header ${page.header}`}>
        <div className="container narrow">
          <Link href="/salonum" className={styles.back}>
            <BackArrow />
            Salonum
          </Link>
          <h1>Çalışma saatleri</h1>
          {shops && shops.length > 1 ? (
            <select className={biz.shopSelect} value={shopId ?? ''} aria-label="İşletme" onChange={(e) => selectShop(e.target.value)}>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            shop && <p>{shop.name}</p>
          )}
          {owner && members.length > 1 && (
            <select
              className={biz.shopSelect}
              value={memberId ?? ''}
              aria-label="Kimin saatleri"
              disabled={busy}
              onChange={(e) => {
                if (changed && !window.confirm('Kaydedilmemiş değişiklikler silinsin mi?')) return;
                setMemberId(e.target.value);
                window.history.replaceState(null, '', `?kisi=${e.target.value}`);
              }}
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                  {m.id === shop?.member_id ? ' (siz)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      <div className={`container narrow ${page.body} ${styles.page}`}>
        {(shopsError || error) && <p className="alert alert-danger">{shopsError || error}</p>}
        {shops && shops.length === 0 && <p className="muted">Bu hesap henüz bir işletmeye bağlı değil.</p>}
        {days && (
          <>
            <p className={styles.intro}>
              {owner && person && memberId !== shop?.member_id ? `${person.display_name} bu saatlerde randevu alır.` : 'Bu saatlerde randevu alırsınız.'} Tek seferlik
              kapatmak için <Link href="/randevularim">Randevular → Takvim → Saat kapat</Link>.
            </p>
            <ul className={`card ${styles.days}`} role="list">
              {days.map((d, i) => {
                const issue = problem(d);
                const expanded = open === i;
                const room = d.open ? nextBreak(d) : null;
                return (
                  <li key={DAYS[i]} className={styles.day}>
                    <button type="button" className={styles.dayHead} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : i)}>
                      <strong>{DAYS[i]}</strong>
                      <span className={`${styles.daySummary} ${d.open ? '' : styles.closedDay} ${issue ? styles.bad : ''}`}>{issue ?? summary(d)}</span>
                      <span className={styles.chevron} aria-hidden>
                        {expanded ? '⌃' : '›'}
                      </span>
                    </button>
                    {expanded && (
                      <div className={styles.editor}>
                        <label className={styles.switch}>
                          <input type="checkbox" checked={d.open} onChange={(e) => update(i, { open: e.target.checked })} />
                          {d.open ? 'Açık' : 'Kapalı'}
                        </label>
                        {d.open && (
                          <>
                            <div className={styles.times}>
                              <label>
                                Açılış
                                <input className="input" type="time" step={900} value={hhmm(d.start)} onChange={(e) => e.target.value && update(i, { start: minutes(e.target.value) })} />
                              </label>
                              <label>
                                Kapanış
                                <input className="input" type="time" step={900} value={hhmm(d.end)} onChange={(e) => e.target.value && update(i, { end: minutes(e.target.value) })} />
                              </label>
                            </div>
                            {d.breaks.map((b, k) => (
                              <div key={k} className={`${styles.times} ${styles.break}`}>
                                <label>
                                  Mola
                                  <input
                                    className="input"
                                    type="time"
                                    step={900}
                                    value={hhmm(b.start)}
                                    onChange={(e) => e.target.value && update(i, { breaks: d.breaks.map((x, n) => (n === k ? { ...x, start: minutes(e.target.value) } : x)) })}
                                  />
                                </label>
                                <label>
                                  Bitiş
                                  <input
                                    className="input"
                                    type="time"
                                    step={900}
                                    value={hhmm(b.end)}
                                    onChange={(e) => e.target.value && update(i, { breaks: d.breaks.map((x, n) => (n === k ? { ...x, end: minutes(e.target.value) } : x)) })}
                                  />
                                </label>
                                <button type="button" className={styles.remove} aria-label="Molayı kaldır" onClick={() => update(i, { breaks: d.breaks.filter((_, n) => n !== k) })}>
                                  ×
                                </button>
                              </div>
                            ))}
                            {issue && <p className={styles.issue}>{issue}</p>}
                            <div className={styles.dayActions}>
                              <button type="button" className={styles.link} disabled={!room || Boolean(issue)} onClick={() => room && update(i, { breaks: [...d.breaks, room].sort((a, b) => a.start - b.start) })}>
                                + Mola ekle
                              </button>
                              <button type="button" className={styles.link} disabled={Boolean(issue)} onClick={() => copyToOthers(i)}>
                                Diğer açık günlere uygula
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {owner && others.length > 0 && (
              <label className={styles.everyone}>
                <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
                <span>
                  Tüm personele uygula
                  <small>Bu hafta düzeni {others.map((m) => m.display_name).join(', ')} için de kaydedilir; onların saatlerinin yerine geçer.</small>
                </span>
              </label>
            )}
            <p className={styles.note}>Mevcut randevular değişmez. Yeni saatler, bundan sonra alınacak randevular için geçerlidir.</p>
          </>
        )}
      </div>

      {days && (
        <div className={styles.saveBar}>
          <div className="container narrow">
            {done && !changed && !everyone && (
              <p className={styles.done} role="status">
                {done}
              </p>
            )}
            <button type="button" className="btn btn-primary btn-block" disabled={busy || invalid || !(changed || everyone)} onClick={save}>
              {busy ? 'Kaydediliyor…' : everyone ? 'Herkes için kaydet' : changed ? 'Değişiklikleri kaydet' : 'Kaydedildi'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
