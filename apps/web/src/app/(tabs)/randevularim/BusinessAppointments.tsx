'use client';

import { addMonths, MonthCalendar, monthTitle } from './MonthCalendar';
import { startTransition, useCallback, useEffect, useRef, useState, ViewTransition, type TouchEvent } from 'react';
import { api, errorMessage } from '@/lib/api';
import { formatLongDate, formatPrice, formatTime, turkeyDate } from '@/lib/format';
import { useBusinessShops, type ShopAppointment } from '@/lib/business';
import { formatPhone } from '@/lib/shop';
import styles from './appointments.module.css';
import { Icon } from '@/components/Icon';
import biz from './business.module.css';
import { BlockForm, TimeOffCard, type TimeOff } from './TimeBlocks';
import { VerifiedTick } from '@/components/VerifiedTick';
import { SkeletonList } from '@/components/Skeleton';

type Member = { id: string; display_name: string; bookable: boolean; active: boolean };
type Appointment = ShopAppointment;

const DAY = 86_400_000;
// Requests can be made up to the booking horizon; a year covers every shop setting.
const REQUEST_WINDOW_DAYS = 365;

/** Start of a Türkiye calendar day (UTC+3 all year). */
const dayStart = (date: string) => new Date(`${date}T00:00:00+03:00`);

function addDays(date: string, days: number) {
  return turkeyDate(new Date(dayStart(date).getTime() + days * DAY + 12 * 3_600_000));
}

/**
 * Randevular in business mode: incoming requests to confirm or decline, and the
 * day's schedule. Owners see the whole shop; staff see their own appointments.
 */
export function BusinessAppointments() {
  const { shops, shop, shopId, selectShop, error: shopsError } = useBusinessShops();
  const [tab, setTab] = useState<'requests' | 'calendar'>('requests');
  // Salonum's "Randevu" tile and "Tümünü gör" open Takvim (?sekme=takvim).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('sekme') === 'takvim') setTab('calendar');
  }, []);
  const [requests, setRequests] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    if (!shopId) return;
    const from = new Date();
    const to = new Date(from.getTime() + REQUEST_WINDOW_DAYS * DAY);
    try {
      const list = await api<Appointment[]>(`/staff/shops/${shopId}/appointments?from=${from.toISOString()}&to=${to.toISOString()}`);
      // Times offered instead stay here until the customer answers.
      // In a transition, so an answered request slides out and the rest move up (v1.7).
      startTransition(() => setRequests(list.filter((a) => a.status === 'pending' || a.status === 'offered')));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [shopId]);

  // New requests arrive without a reload; the staff app will ring for them.
  useEffect(() => {
    loadRequests();
    const timer = setInterval(loadRequests, 15_000);
    return () => clearInterval(timer);
  }, [loadRequests]);

  const pending = requests?.filter((a) => a.status === 'pending').length ?? 0;

  // Swiping sideways switches between Talepler and Takvim, as in the app (founder request,
  // 7 November 2026); the content slides in from the side it comes from.
  const [from, setFrom] = useState<'right' | 'left'>('right');
  const switchTo = (next: 'requests' | 'calendar') => {
    if (next === tab) return;
    setFrom(next === 'calendar' ? 'right' : 'left');
    setTab(next);
  };
  const touch = useRef<{ x: number; y: number; at: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    // Not from the screen edge (the phone's own back gesture), a form field, or a row that scrolls sideways.
    touch.current = e.touches.length === 1 && t && t.clientX > 24 && !swipeBlocked(e.target as Element, e.currentTarget) ? { x: t.clientX, y: t.clientY, at: Date.now() } : null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    const t = e.changedTouches[0];
    touch.current = null;
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy) && Date.now() - start.at < 800) switchTo(dx < 0 ? 'calendar' : 'requests');
  };

  return (
    <div className={styles.swipeArea} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className={`page-header ${styles.header}`}>
        <div className="container narrow">
          <h1>Randevular</h1>
          {shops && shops.length > 1 ? (
            <select
              className={biz.shopSelect}
              value={shopId ?? ''}
              aria-label="İşletme"
              onChange={(e) => {
                selectShop(e.target.value);
                setRequests(null);
              }}
            >
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            shop && <p>{shop.name}</p>
          )}
          <div className={styles.segmented} role="tablist" aria-label="Talepler veya takvim">
            <button type="button" role="tab" aria-selected={tab === 'requests'} className={tab === 'requests' ? styles.segOn : ''} onClick={() => switchTo('requests')}>
              Talepler
              {!!pending && (
                <span key={pending} className={`${styles.count} motion-pop`}>
                  {pending}
                </span>
              )}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'calendar'} className={tab === 'calendar' ? styles.segOn : ''} onClick={() => switchTo('calendar')}>
              Takvim
            </button>
          </div>
        </div>
      </header>

      <div className={`container narrow ${styles.body}`}>
        {(error ?? shopsError) && <p className="alert alert-danger">{error ?? shopsError}</p>}
        {shops && shops.length === 0 && <p className="muted">Bu hesap henüz bir işletmeye bağlı değil.</p>}
        {shop && !shop.reviewed_at && <p className="alert alert-info">İşletmeniz henüz yayında değil.</p>}
        {shopId && (
          <div key={tab} className={from === 'right' ? 'motion-slide-from-right' : 'motion-slide-from-left'}>
            {tab === 'requests' && <Requests shopId={shopId} items={requests} onChanged={loadRequests} />}
            {shop && tab === 'calendar' && <Calendar shopId={shopId} isOwner={shop.role === 'owner'} myMemberId={shop.member_id} onChanged={loadRequests} />}
          </div>
        )}
      </div>
    </div>
  );
}

/** A touch on a form field or on something that scrolls sideways (the staff chips) is not a tab swipe. */
function swipeBlocked(target: Element | null, area: Element): boolean {
  for (let el = target; el && el !== area; el = el.parentElement) {
    if (el.matches('input, textarea, select, [contenteditable="true"]')) return true;
    const overflow = getComputedStyle(el).overflowX;
    if ((overflow === 'auto' || overflow === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
  }
  return false;
}

function Requests({ shopId, items, onChanged }: { shopId: string; items: Appointment[] | null; onChanged: () => void }) {
  if (!items) return <SkeletonList rows={2} label="Talepler yükleniyor" />;
  if (!items.length) {
    return (
      <div className={`card ${styles.empty}`}>
        <span className={styles.emptyIcon} aria-hidden>
          ✓
        </span>
        <h2>Bekleyen talep yok</h2>
        <p>Yeni randevu talepleri burada görünür. Sayfa kendiliğinden yenilenir.</p>
      </div>
    );
  }
  return (
    <div className={styles.wrap}>
      {items.map((a) => (
        <ViewTransition key={a.id} name={`talep-${a.id}`} enter="arrive" exit="leave" update="move" default="none">
          <div>
            <AppointmentCard shopId={shopId} appointment={a} showDate onChanged={onChanged} />
          </div>
        </ViewTransition>
      ))}
    </div>
  );
}

function Calendar(props: { shopId: string; isOwner: boolean; myMemberId: string; onChanged: () => void }) {
  const today = turkeyDate(new Date());
  const [date, setDate] = useState(today);
  const [items, setItems] = useState<Appointment[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<TimeOff[]>([]);
  const [blocking, setBlocking] = useState(false);
  // The month view, opened by tapping the date (founder, 14 November 2026). It and "Saat kapat"
  // close on leaving Takvim: this component is removed when another tab or page is opened.
  const [calendar, setCalendar] = useState(false);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  // How many appointments each day has (declined and cancelled ones aside): dots under the days
  // in the row, numbers in the month view. Covers the row's days and the month shown.
  const monthEnd = addDays(`${addMonths(month, 1)}-01`, -1);
  const rangeFrom = [addDays(today, -STRIP_BEFORE), addDays(date, -STRIP_BEFORE), `${month}-01`].sort()[0]!;
  const rangeTo = [addDays(today, STRIP_AFTER), addDays(date, 30), monthEnd].sort()[2]!;
  useEffect(() => {
    let stale = false;
    const range = `from=${dayStart(rangeFrom).toISOString()}&to=${dayStart(addDays(rangeTo, 1)).toISOString()}`;
    api<Appointment[]>(`/staff/shops/${props.shopId}/appointments?${range}${staffId ? `&staffId=${staffId}` : ''}`)
      .then((list) => {
        if (stale) return;
        const next: Record<string, number> = {};
        for (const a of list) {
          if (a.status === 'declined' || a.status === 'cancelled') continue;
          const d = turkeyDate(new Date(a.starts_at));
          next[d] = (next[d] ?? 0) + 1;
        }
        setCounts(next);
      })
      .catch(() => undefined);
    return () => {
      stale = true;
    };
    // `items` too: the counts follow the day's list when it is refreshed or answered.
  }, [props.shopId, rangeFrom, rangeTo, staffId, items]);

  const toggleCalendar = () => {
    setMonth(date.slice(0, 7));
    setCalendar((v) => !v);
  };
  // Dragging the handle down opens the month view, up closes it.
  const drag = useRef<number | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    if (!props.isOwner) return;
    api<Member[]>(`/staff/shops/${props.shopId}/members`)
      .then((list) => setMembers(list.filter((m) => m.active && m.bookable)))
      .catch(() => setMembers([]));
  }, [props.shopId, props.isOwner]);

  const load = useCallback(async () => {
    const from = dayStart(date);
    const to = new Date(from.getTime() + DAY);
    try {
      const range = `from=${from.toISOString()}&to=${to.toISOString()}`;
      const [list, off] = await Promise.all([
        api<Appointment[]>(`/staff/shops/${props.shopId}/appointments?${range}${staffId ? `&staffId=${staffId}` : ''}`),
        api<TimeOff[]>(`/staff/shops/${props.shopId}/time-off?${range}`),
      ]);
      setItems(list);
      setClosed(off.filter((t) => !staffId || t.staff_id === staffId));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [props.shopId, date, staffId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const active = (items ?? []).filter((a) => a.status !== 'declined' && a.status !== 'cancelled');
  const dropped = (items ?? []).filter((a) => a.status === 'declined' || a.status === 'cancelled');

  return (
    <>
      {/* Takvim (founder's design, 14 November 2026): the month with arrows (a week at a time), a
          row of days starting just before today so the coming days show, and the month calendar
          sliding down from the handle (tap or drag down). */}
      <div className={biz.dayNav}>
        <button type="button" className={biz.dayArrow} onClick={() => setDate(addDays(date, -7))} aria-label="Önceki hafta">
          ‹
        </button>
        <button
          type="button"
          className={`${biz.dayLabel} ${biz.dayLabelButton}`}
          aria-expanded={calendar}
          aria-label={`${monthTitle(date.slice(0, 7))}, takvimi ${calendar ? 'kapat' : 'aç'}`}
          onClick={toggleCalendar}
        >
          <strong>{monthTitle(date.slice(0, 7))}</strong>
          <span className={biz.dayCaret} aria-hidden>
            <Icon name="chevron" size={14} strokeWidth={2.4} />
          </span>
        </button>
        <button type="button" className={biz.dayArrow} onClick={() => setDate(addDays(date, 7))} aria-label="Sonraki hafta">
          ›
        </button>
      </div>
      <DayStrip date={date} today={today} counts={counts} onPick={setDate} />
      <button
        type="button"
        className={biz.handle}
        aria-label={calendar ? 'Takvimi kapat' : 'Takvimi aç'}
        aria-expanded={calendar}
        onClick={() => {
          // A drag already opened or closed it.
          if (dragged.current) dragged.current = false;
          else toggleCalendar();
        }}
        onPointerDown={(e) => {
          // Keep following the finger when it leaves the handle while dragging.
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = e.clientY;
          dragged.current = false;
        }}
        onPointerUp={(e) => {
          if (drag.current == null) return;
          const dy = e.clientY - drag.current;
          drag.current = null;
          if (dy > 24) {
            dragged.current = true;
            setMonth(date.slice(0, 7));
            setCalendar(true);
          } else if (dy < -24) {
            dragged.current = true;
            setCalendar(false);
          }
        }}
      >
        <span aria-hidden />
      </button>
      <MonthCalendar
        open={calendar}
        month={month}
        selected={date}
        today={today}
        counts={counts}
        onMonth={(m) => {
          setCounts(null);
          setMonth(m);
        }}
        onPick={(d) => {
          setDate(d);
          setCalendar(false);
        }}
      />
      {date !== today && (
        <button type="button" className={biz.todayLink} onClick={() => setDate(today)}>
          Bugüne dön
        </button>
      )}

      {members.length > 1 && (
        <div className={`${styles.chips} ${biz.staffChips}`} role="radiogroup" aria-label="Personel">
          {[{ id: null, display_name: 'Tüm ekip' }, ...members].map((m) => (
            <button
              key={m.id ?? 'all'}
              type="button"
              role="radio"
              aria-checked={staffId === m.id}
              className={`${styles.chip} ${staffId === m.id ? styles.chipOn : ''}`}
              onClick={() => setStaffId(m.id)}
            >
              {m.display_name}
            </button>
          ))}
        </div>
      )}

      {error && <p className="alert alert-danger">{error}</p>}
      <div className={styles.wrap}>
        {!items && !error && <SkeletonList rows={2} label="Takvim yükleniyor" />}
        {closed.map((t) => (
          <TimeOffCard key={t.id} shopId={props.shopId} item={t} date={date} showStaff={props.isOwner} onChanged={load} />
        ))}
        {items && active.length === 0 && closed.length === 0 && (
          <div className={`card ${styles.empty}`}>
            <h2>Randevu yok</h2>
            <p>Bu gün için randevu bulunmuyor.</p>
          </div>
        )}
        {active.map((a) => (
          <AppointmentCard
            key={a.id}
            shopId={props.shopId}
            appointment={a}
            showStaff={props.isOwner}
            onChanged={() => {
              load();
              props.onChanged();
            }}
          />
        ))}
        {/* Saat kapat at the bottom, large (founder, 14 November 2026). */}
        {!blocking && (
          <button type="button" className={biz.blockBig} onClick={() => setBlocking(true)}>
            <Icon name="clock" size={20} />
            Saat kapat
          </button>
        )}
        {blocking && (
          <BlockForm
            shopId={props.shopId}
            date={date}
            members={members}
            myMemberId={props.myMemberId}
            isOwner={props.isOwner}
            onClose={() => setBlocking(false)}
            onDone={() => {
              setBlocking(false);
              load();
            }}
          />
        )}

        {dropped.length > 0 && (
          <details className={biz.dropped}>
            <summary>İptal edilen ve reddedilenler ({dropped.length})</summary>
            <div className={styles.wrap}>
              {dropped.map((a) => (
                <AppointmentCard key={a.id} shopId={props.shopId} appointment={a} showStaff={props.isOwner} onChanged={load} />
              ))}
            </div>
          </details>
        )}
      </div>
    </>
  );
}

/** The row of days: this many before today, and this many after (the row scrolls sideways). */
const STRIP_BEFORE = 7;
const STRIP_AFTER = 60;
const WEEKDAY = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

/**
 * The days in a row (founder's design, 14 November 2026): weekday and date, the chosen one in
 * blue, today outlined, a dot on days with appointments. The chosen day sits second from the
 * left, so today and the days after it show.
 */
function DayStrip(props: { date: string; today: string; counts: Record<string, number> | null; onPick: (d: string) => void }) {
  const row = useRef<HTMLDivElement>(null);
  const first = [addDays(props.today, -STRIP_BEFORE), addDays(props.date, -STRIP_BEFORE)].sort()[0]!;
  const last = [addDays(props.today, STRIP_AFTER), addDays(props.date, 30)].sort()[1]!;
  const days: string[] = [];
  for (let d = first; d <= last && days.length < 400; d = addDays(d, 1)) days.push(d);
  const placed = useRef(false);
  // The row stays still while the chosen day is in view (founder, 14 November 2026). It moves only
  // when the chosen day is the last one showing on the right, the first on the left, or out of
  // view (arrows, month calendar): then the day goes second from the left.
  useEffect(() => {
    const box = row.current;
    const chosen = box?.querySelector<HTMLElement>(`[data-day="${props.date}"]`);
    if (!box || !chosen) return;
    if (placed.current) {
      const x = chosen.offsetLeft - box.offsetLeft;
      const step = chosen.offsetWidth + 8;
      const left = box.scrollLeft;
      const right = left + box.clientWidth;
      const inView = x >= left && x + chosen.offsetWidth <= right;
      const lastOnRight = x + step + chosen.offsetWidth > right;
      const firstOnLeft = x - step < left && chosen.previousElementSibling !== null;
      if (inView && !lastOnRight && !firstOnLeft) return;
    }
    const before = (chosen.previousElementSibling as HTMLElement | null) ?? chosen;
    box.scrollTo({ left: before.offsetLeft - box.offsetLeft, behavior: placed.current ? 'smooth' : 'auto' });
    placed.current = true;
  }, [props.date]);
  return (
    <div ref={row} className={biz.strip} role="radiogroup" aria-label="Günler">
      {days.map((d) => {
        const on = d === props.date;
        const count = props.counts?.[d] ?? 0;
        return (
          <button
            key={d}
            type="button"
            data-day={d}
            role="radio"
            aria-checked={on}
            aria-label={`${formatLongDate(dayStart(d))}${count ? `, ${count} randevu` : ''}`}
            className={`${biz.stripDay} ${d === props.today ? biz.stripToday : ''} ${on ? biz.stripOn : ''}`}
            onClick={() => props.onPick(d)}
          >
            <span>{WEEKDAY[new Date(`${d}T12:00:00Z`).getUTCDay()]}</span>
            <strong>{Number(d.slice(8))}</strong>
            <i className={count ? biz.stripDot : undefined} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

const CANCELLED_BY: Record<string, string> = {
  customer: 'Müşteri iptal etti',
  customer_late: 'Müşteri geç iptal etti',
  shop: 'Salon iptal etti',
  staff_absence: 'Personel izni nedeniyle iptal',
};

const STATUS: Record<Appointment['status'], { label: string; tone: string }> = {
  pending: { label: 'Onay bekliyor', tone: 'badge-warning' },
  offered: { label: 'Yeni saat önerildi', tone: 'badge-info' },
  confirmed: { label: 'Onaylandı', tone: 'badge-success' },
  declined: { label: 'Reddedildi', tone: 'badge-muted' },
  cancelled: { label: 'İptal edildi', tone: 'badge-muted' },
  completed: { label: 'Geldi', tone: 'badge-info' },
  no_show: { label: 'Gelmedi', tone: 'badge-danger' },
};

export function AppointmentCard(props: {
  shopId: string;
  appointment: Appointment;
  showDate?: boolean;
  showStaff?: boolean;
  /** Marks a cancellation the salon has not seen yet (Geçmiş). */
  isNew?: boolean;
  onChanged: () => void;
}) {
  const a = props.appointment;
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [offering, setOffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = new Date(a.starts_at).getTime() <= Date.now();
  const status = STATUS[a.status];
  const services = (a.services ?? []).map((s) => s.name).join(' + ');
  const minutes = Math.round((new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60_000);

  async function act(action: 'confirm' | 'decline' | 'cancel' | 'complete' | 'no-show') {
    setBusy(true);
    setError(null);
    try {
      await api(`/staff/shops/${props.shopId}/appointments/${a.id}/${action}`, { method: 'POST' });
      props.onChanged();
    } catch (err) {
      setError(errorMessage(err));
      props.onChanged();
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  }

  return (
    <article className={`card ${biz.card} ${a.status === 'pending' ? biz.pending : ''} motion-fade`}>
      <div className={biz.cardTop}>
        <div className={biz.time}>
          <strong>{formatTime(a.starts_at)}</strong>
          <span>{minutes} dk</span>
        </div>
        <div className={biz.main}>
          {props.showDate && <p className={biz.date}>{formatLongDate(a.starts_at)}</p>}
          <p className={biz.customer}>
            {a.guest_name ?? a.customer_name}
            {/* The tick is the booking customer's; a guest booked on their behalf is someone else. */}
            {a.customer_verified && !a.guest_name && <VerifiedTick kind="customer" size={15} />}
            {a.guest_name && <span className="muted"> · {a.customer_name} adına</span>}
          </p>
          <p className={biz.services}>{services}</p>
          {(props.showStaff || props.showDate) && (
            <p className="muted">
              {a.staff_name}
              {!a.requested_staff && a.source === 'online' && ' · müşteri personel seçmedi'}
            </p>
          )}
        </div>
        <span className={biz.price}>{formatPrice(a.total_price_kurus, a.price_is_starting_from)}</span>
      </div>

      <div className={biz.meta}>
        {props.isNew && <span className="badge badge-danger">Yeni</span>}
        <span className={`badge ${a.status === 'cancelled' && a.cancel_reason ? 'badge-danger' : status.tone}`}>
          {a.status === 'cancelled' && a.cancel_reason ? CANCELLED_BY[a.cancel_reason] : status.label}
        </span>
        {!!a.no_show_count && <span className="badge badge-danger">{a.no_show_count} kez gelmedi</span>}
        {!!a.late_cancel_count && <span className="badge badge-warning">{a.late_cancel_count} geç iptal</span>}
        {a.customer_phone && (
          <a href={`tel:${a.customer_phone}`} className={biz.phone}>
            {formatPhone(a.customer_phone)}
          </a>
        )}
      </div>
      {a.status === 'cancelled' && a.cancelled_at && (
        <p className={biz.deadline}>
          İptal zamanı: {formatLongDate(a.cancelled_at)} {formatTime(a.cancelled_at)}
        </p>
      )}
      {a.status === 'pending' && a.deadline_at && <p className={biz.deadline}>Yanıt vermezseniz otomatik onaylanır. Otomatik onay saati: {formatTime(a.deadline_at)}</p>}

      {a.status === 'offered' && (
        <p className={biz.deadline}>
          {a.offered_from && (
            <>
              Müşterinin istediği: {formatLongDate(a.offered_from)} {formatTime(a.offered_from)}.{' '}
            </>
          )}
          Müşterinin yanıtı bekleniyor{a.deadline_at && <>; yanıt gelmezse {formatTime(a.deadline_at)} saatinde saat yeniden boşalır</>}.
        </p>
      )}

      {a.status === 'pending' && !offering && (
        <>
          <div className={biz.actions}>
            <button type="button" className="btn" disabled={busy} onClick={() => setOffering(true)}>
              Başka saat öner
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act('confirm')}>
              Onayla
            </button>
          </div>
          <button type="button" className={styles.cancel} disabled={busy} onClick={() => act('decline')}>
            Reddet
          </button>
        </>
      )}
      {a.status === 'pending' && offering && (
        <OfferPicker
          shopId={props.shopId}
          appointment={a}
          onDone={() => {
            setOffering(false);
            props.onChanged();
          }}
          onClose={() => setOffering(false)}
        />
      )}
      {a.status === 'offered' && !confirmCancel && (
        <button type="button" className={styles.cancel} onClick={() => setConfirmCancel(true)}>
          Öneriyi geri çek
        </button>
      )}
      {a.status === 'confirmed' && started && (
        // One compact line instead of two full-width buttons, so more appointments fit on a screen (review, 12 November 2026).
        <div className={biz.attend}>
          <span>Müşteri geldi mi?</span>
          <button type="button" className="btn" disabled={busy} onClick={() => act('no-show')}>
            Gelmedi
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act('complete')}>
            Geldi
          </button>
        </div>
      )}
      {a.status === 'confirmed' && !started && !confirmCancel && (
        <button type="button" className={styles.cancel} onClick={() => setConfirmCancel(true)}>
          Randevuyu iptal et
        </button>
      )}
      {confirmCancel && (
        <div className={styles.confirmBox}>
          <p>{a.status === 'offered' ? 'Öneri geri çekilecek ve müşteriye SMS gönderilecek.' : 'Randevu iptal edilecek ve müşteriye SMS gönderilecek.'}</p>
          <div className={styles.confirmActions}>
            <button type="button" className="btn" onClick={() => setConfirmCancel(false)} disabled={busy}>
              Vazgeç
            </button>
            <button type="button" className={`btn ${styles.danger}`} onClick={() => act('cancel')} disabled={busy}>
              Evet, iptal et
            </button>
          </div>
        </div>
      )}
      {error && <p className="alert alert-danger">{error}</p>}
    </article>
  );
}

/**
 * "Başka saat öner": pick a day and one of the staff member's free times. The
 * customer gets an SMS and answers in Randevularım; the time is held until then.
 */
function OfferPicker(props: { shopId: string; appointment: Appointment; onDone: () => void; onClose: () => void }) {
  const a = props.appointment;
  const today = turkeyDate(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const [date, setDate] = useState(turkeyDate(new Date(a.starts_at)) < today ? today : turkeyDate(new Date(a.starts_at)));
  const [times, setTimes] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTimes(null);
    setPicked(null);
    api<string[]>(`/staff/shops/${props.shopId}/appointments/${a.id}/offer-times?date=${date}`)
      .then((t) => !cancelled && setTimes(t))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [props.shopId, a.id, date]);

  async function send() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/staff/shops/${props.shopId}/appointments/${a.id}/offer`, { method: 'POST', body: { startsAt: picked } });
      props.onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const dayLabel = (d: string) =>
    d === today ? 'Bugün' : d === addDays(today, 1) ? 'Yarın' : new Intl.DateTimeFormat('tr-TR', { weekday: 'short', day: 'numeric', timeZone: 'Europe/Istanbul' }).format(dayStart(d));

  return (
    <div className={`${biz.offer} motion-reveal`}>
      <p className={biz.offerTitle}>Hangi saati önermek istersiniz?</p>
      <div className={biz.offerDays} role="radiogroup" aria-label="Gün">
        {days.map((d) => (
          <button key={d} type="button" role="radio" aria-checked={d === date} className={d === date ? biz.on : ''} onClick={() => setDate(d)}>
            {dayLabel(d)}
          </button>
        ))}
      </div>
      {times === null && !error && <p className="muted">Boş saatler yükleniyor…</p>}
      {times && times.length === 0 && <p className="muted">Bu gün {a.staff_name} için uygun saat yok. Başka bir gün seçin.</p>}
      {times && times.length > 0 && (
        <div className={biz.offerTimes} role="radiogroup" aria-label="Saat">
          {times.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={t === picked} className={t === picked ? biz.on : ''} onClick={() => setPicked(t)}>
              {formatTime(t)}
            </button>
          ))}
        </div>
      )}
      <p className={biz.deadline}>Müşteriye SMS gider ve Randevularım’dan yanıtlar. Yanıt gelmezse saat yeniden boşalır.</p>
      {error && <p className="alert alert-danger">{error}</p>}
      <div className={biz.actions}>
        <button type="button" className="btn" disabled={busy} onClick={props.onClose}>
          Vazgeç
        </button>
        <button type="button" className="btn btn-primary" disabled={busy || !picked} onClick={send}>
          {picked ? `${formatTime(picked)} öner` : 'Saat seçin'}
        </button>
      </div>
    </div>
  );
}
