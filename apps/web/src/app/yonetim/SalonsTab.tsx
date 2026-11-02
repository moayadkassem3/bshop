'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { formatPhone } from '@/lib/shop';
import { SkeletonList } from '@/components/Skeleton';
import { RatingBadge } from '@/components/Stars';
import { BackArrow } from '@/components/BackArrow';
import { METHOD_LABELS, METHODS, salonStatus, shortDate } from './format';
import type { AdminSalon, SalonDetail } from './types';
import styles from './admin.module.css';

const FILTERS = [
  { key: 'tumu', label: 'Tümü' },
  { key: 'yeni', label: 'Kontrol bekleyen' },
  { key: 'deneme', label: 'Denemede' },
  { key: 'aktif', label: 'Abone' },
  { key: 'odeme', label: 'Ödeme bekleyen' },
  { key: 'kapali', label: 'Kaldırılan' },
];

/** Salonlar: search and filter every salon; open one to act on it. */
export function SalonsTab(props: { filter: string; onFilter: (f: string) => void; salonId: string | null; onSalon: (id: string | null) => void }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<AdminSalon[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api<AdminSalon[]>(`/admin/salons?${new URLSearchParams({ filter: props.filter, ...(q.trim() ? { q: q.trim() } : {}) })}`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [props.filter, q]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  if (props.salonId) {
    return (
      <SalonView
        id={props.salonId}
        onBack={() => {
          props.onSalon(null);
          load();
        }}
      />
    );
  }

  return (
    <div>
      <div className={styles.toolbar}>
        <input className={`input ${styles.search}`} type="search" placeholder="Salon, ilçe, şehir veya sahibin telefonu" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ara" />
        <div className={styles.chips} role="radiogroup" aria-label="Filtre">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" role="radio" aria-checked={props.filter === f.key} className={props.filter === f.key ? styles.chipOn : ''} onClick={() => props.onFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="alert alert-danger">{error}</p>}
      {!rows && !error && <SkeletonList rows={4} />}
      {rows && rows.length === 0 && <p className={styles.empty}>Bu filtrede salon yok.</p>}
      {rows && rows.length > 0 && (
        <ul className={styles.rows} role="list">
          {rows.map((s) => {
            const st = salonStatus(s);
            return (
              <li key={s.id}>
                <button type="button" className={`card ${styles.row} motion-fade`} onClick={() => props.onSalon(s.id)}>
                  <span className={styles.rowMain}>
                    <strong>{s.name}</strong>
                    <span>
                      {[s.district, s.city].filter(Boolean).join(', ') || 'Konum yok'} · {shortDate(s.created_at)}
                    </span>
                    <span className={styles.rowBadges}>
                      <span className={`badge badge-${st.tone}`}>{st.label}</span>
                      {!s.checked_at && !s.suspended_at && <span className="badge badge-info">Kontrol bekliyor</span>}
                      {s.open_request_at && <span className="badge badge-warning">Abonelik talebi</span>}
                    </span>
                  </span>
                  <span className={styles.rowStats}>
                    <span>{s.plan ? `${s.plan.name} · ${formatPrice(s.plan.monthlyPriceKurus)}` : `${s.seats} personel · teklif`}</span>
                    <span>
                      {s.bookings_30d} randevu · {s.views_30d} ziyaret <small>(30 gün)</small>
                    </span>
                    <RatingBadge rating={s.rating} count={s.rating_count} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** One salon: details, team, payments, and the actions our team takes. */
function SalonView({ id, onBack }: { id: string; onBack: () => void }) {
  const [s, setS] = useState<SalonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setS(await api<SalonDetail>(`/admin/salons/${id}`));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(path: string, method: 'POST' | 'PUT', body: unknown, message: string) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api(`/admin/salons/${id}/${path}`, { method, body });
      await load();
      setDone(message);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.detail}>
      <button type="button" className={styles.back} onClick={onBack}>
        <BackArrow />
        Salonlar
      </button>
      {error && <p className="alert alert-danger">{error}</p>}
      {!s && !error && <SkeletonList rows={3} />}
      {s && (
        <div className="motion-fade">
          <div className={styles.detailHead}>
            <div>
              <h1>{s.name}</h1>
              <p className="muted">
                {s.address || [s.district, s.city].filter(Boolean).join(', ') || 'Adres yok'} · Kayıt {shortDate(s.created_at)}
              </p>
            </div>
            <a href={`/${s.slug}`} target="_blank" rel="noreferrer" className="btn">
              Salon sayfası ↗
            </a>
          </div>
          {done && (
            <p className={`alert alert-info motion-pop`} role="status">
              {done}
            </p>
          )}

          <div className={styles.detailGrid}>
            <section className={`card ${styles.panel}`}>
              <h2>Abonelik</h2>
              <Status s={s} />
              <PaymentForm s={s} busy={busy} onSave={(body, paid) => act('payments', 'POST', body, paid ? 'Ödeme kaydedildi; abonelik etkin.' : 'Abonelik ödemesiz etkinleştirildi.')} />
              <div className={styles.panelActions}>
                {['trial', 'none'].includes(s.subscription_status) && (
                  <button type="button" className="btn" disabled={busy} onClick={() => act('extend-trial', 'POST', { days: 7 }, 'Deneme 7 gün uzatıldı.')}>
                    Denemeyi 7 gün uzat
                  </button>
                )}
                {['active', 'past_due', 'trial'].includes(s.subscription_status) && (
                  <button
                    type="button"
                    className={`btn ${styles.dangerOutline}`}
                    disabled={busy}
                    onClick={() => window.confirm(`${s.name} için abonelik sonlandırılsın mı? Salon müşterilere görünmez olur.`) && act('cancel-subscription', 'POST', undefined, 'Abonelik sonlandırıldı.')}
                  >
                    Aboneliği sonlandır
                  </button>
                )}
              </div>
              {s.payments.length > 0 && (
                <>
                  <h3>Etkinleştirmeler ve ödemeler</h3>
                  <ul className={styles.mini} role="list">
                    {s.payments.map((p) => (
                      <li key={p.id}>
                        <strong>{p.method === 'yok' ? 'Ödemesiz' : formatPrice(p.amount_kurus)}</strong> · {p.months} ay{p.method === 'yok' ? '' : ` · ${METHOD_LABELS[p.method] ?? p.method}`} · {shortDate(p.created_at)}
                        {p.note ? ` · ${p.note}` : ''}
                        <span className="muted"> → {shortDate(p.period_end)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {s.requests.length > 0 && (
                <>
                  <h3>Abonelik talepleri</h3>
                  <ul className={styles.mini} role="list">
                    {s.requests.map((r) => (
                      <li key={r.id}>
                        {shortDate(r.created_at)} · {r.phone ? formatPhone(r.phone) : '—'} · {r.handled_at ? `kapandı ${shortDate(r.handled_at)}` : <strong>açık</strong>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section className={`card ${styles.panel}`}>
              <h2>Kontrol</h2>
              <Moderation s={s} busy={busy} act={act} />
              <h3>Ekip</h3>
              <ul className={styles.mini} role="list">
                {s.members.map((m, i) => (
                  <li key={i} className={m.active ? '' : styles.inactive}>
                    <strong>{m.display_name}</strong> · {m.owner_label === 'owner' ? 'Sahibi' : m.role === 'owner' ? 'Ortak' : 'Personel'}
                    {m.bookable ? ' · randevu alıyor' : ''}
                    {!m.active ? ' · ayrıldı' : ''} ·{' '}
                    <a href={`tel:${m.phone}`}>{formatPhone(m.phone)}</a>
                  </li>
                ))}
              </ul>
              <h3>Son 30 gün</h3>
              <p className={styles.stat}>
                {s.bookings_30d} online randevu · {s.views_30d} sayfa ziyareti · <RatingBadge rating={s.rating} count={s.rating_count} />
                {s.rating == null && `${s.rating_count} değerlendirme`}
              </p>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function Status({ s }: { s: SalonDetail }) {
  const st = salonStatus(s);
  return (
    <p className={styles.status}>
      <span className={`badge badge-${st.tone}`}>{st.label}</span>{' '}
      {s.plan ? `${s.plan.name} · ${formatPrice(s.plan.monthlyPriceKurus)}/ay` : `${s.seats} personel · özel fiyat`}
      {s.current_period_end && <span className="muted"> · dönem sonu {shortDate(s.current_period_end)}</span>}
      {s.grace_until && <span className="muted"> · ek süre {shortDate(s.grace_until)}</span>}
    </p>
  );
}

/**
 * "Aboneliği etkinleştir" (v1.7): until there is a payment gate, our team starts
 * or extends a subscription by hand, with the payment it collected (cash, bank
 * transfer) or without one (a free month, pay later).
 */
function PaymentForm({ s, busy, onSave }: { s: SalonDetail; busy: boolean; onSave: (body: unknown, paid: boolean) => Promise<boolean> }) {
  const monthly = s.plan?.monthlyPriceKurus ?? 0;
  const [months, setMonths] = useState(1);
  const [paid, setPaid] = useState(true);
  const [amount, setAmount] = useState(String(monthly / 100));
  const [method, setMethod] = useState('havale');
  const [note, setNote] = useState('');

  useEffect(() => setAmount(String((monthly * months) / 100)), [monthly, months]);

  const kurus = Math.round(Number(amount.replace(',', '.')) * 100);
  const valid = !paid || (Number.isFinite(kurus) && kurus >= 0);
  const running = s.subscription_status === 'active';
  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault();
        const body = paid ? { amountKurus: kurus, months, method, note: note.trim() || null } : { amountKurus: 0, months, method: 'yok', note: note.trim() || null };
        if (await onSave(body, paid)) setNote('');
      }}
    >
      <h3>{running ? 'Aboneliği uzat' : 'Aboneliği etkinleştir'}</h3>
      <label>
        Süre
        <select className="input" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          {[1, 3, 6, 12].map((m) => (
            <option key={m} value={m}>
              {m} ay
            </option>
          ))}
        </select>
      </label>
      <label className={styles.check}>
        <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
        Ödeme alındı
      </label>
      {paid && (
        <div className={`${styles.formRow} ${styles.formRowTwo} motion-reveal`}>
          <label>
            Tutar (₺)
            <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>
            Yöntem
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {Object.entries(METHODS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <input
        className="input"
        placeholder={paid ? 'Not (isteğe bağlı), örn. dekont no' : 'Not (isteğe bağlı), örn. ilk ay hediye, ay sonunda ödeyecek'}
        maxLength={300}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button type="submit" className="btn btn-primary" disabled={busy || !valid}>
        {paid ? `${formatPrice(Number.isFinite(kurus) ? kurus : 0)} ödemeyle ${months} ay ${running ? 'uzat' : 'etkinleştir'}` : `Ödemesiz ${months} ay ${running ? 'uzat' : 'etkinleştir'}`}
      </button>
      <p className={styles.hint}>
        {running ? `Mevcut dönemin sonundan itibaren ${months} ay uzar.` : `Bugünden itibaren ${months} ay abone olur ve müşterilere görünür.`}
        {!paid && ' Gelire eklenmez; yalnızca kayıt için tutulur.'} Açık abonelik talepleri kapanır.
      </p>
    </form>
  );
}

function Moderation({ s, busy, act }: { s: SalonDetail; busy: boolean; act: (path: string, method: 'POST' | 'PUT', body: unknown, message: string) => Promise<boolean> }) {
  const [reason, setReason] = useState('');
  const [taking, setTaking] = useState(false);

  if (s.suspended_at) {
    return (
      <div className={styles.suspended}>
        <p>
          <strong>Yayından kaldırıldı</strong> ({shortDate(s.suspended_at)}): {s.suspended_reason}
        </p>
        <button type="button" className="btn" disabled={busy} onClick={() => act('suspension', 'PUT', { reason: null }, 'Salon yeniden yayında.')}>
          Yayına geri al
        </button>
      </div>
    );
  }
  return (
    <div className={styles.moderation}>
      <label className={styles.check}>
        <input type="checkbox" checked={Boolean(s.checked_at)} disabled={busy} onChange={(e) => act('checked', 'PUT', { checked: e.target.checked }, e.target.checked ? 'Kontrol edildi olarak işaretlendi.' : 'Kontrol işareti kaldırıldı.')} />
        Kontrol edildi: bilgiler ve fotoğraflar gerçek görünüyor
      </label>
      {taking ? (
        <div className={`${styles.form} motion-reveal`}>
          <label htmlFor="reason">Neden? (salon ekibi bu metni görür)</label>
          <textarea id="reason" className="input" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Örn. Adres ve fotoğraflar bu salona ait değil" />
          <div className={styles.panelActions}>
            <button type="button" className="btn" onClick={() => setTaking(false)}>
              Vazgeç
            </button>
            <button
              type="button"
              className={`btn ${styles.dangerBtn}`}
              disabled={busy || reason.trim().length < 3}
              onClick={async () => (await act('suspension', 'PUT', { reason: reason.trim() }, 'Salon yayından kaldırıldı.')) && setTaking(false)}
            >
              Yayından kaldır
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={`btn ${styles.dangerOutline}`} onClick={() => setTaking(true)}>
          Yayından kaldır…
        </button>
      )}
    </div>
  );
}
