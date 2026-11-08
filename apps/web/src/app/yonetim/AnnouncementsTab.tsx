'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { BRAND } from '@/lib/config';
import { LogoMark } from '@/components/Logo';
import { SkeletonList } from '@/components/Skeleton';
import styles from './admin.module.css';

type Audience = 'businesses' | 'customers' | 'all';
type Repeat = 'now' | 'later' | 'daily' | 'weekly';
type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  customer_gender: 'male' | 'female' | null;
  shop_audience: 'men' | 'women' | 'unisex' | null;
  repeat: 'once' | 'daily' | 'weekly';
  time_of_day: number | null;
  weekdays: number[];
  next_run_at: string | null;
  active: boolean;
  last_sent_at: string | null;
  last_sent_count: number | null;
  total_sent: number;
};

const TZ = 'Europe/Istanbul';
const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const DAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const SHOP_TYPES = [
  [null, 'Tümü'],
  ['men', 'Erkek kuaförü'],
  ['women', 'Kadın kuaförü'],
  ['unisex', 'Kadın & erkek'],
] as const;
const GENDERS = [
  [null, 'Tümü'],
  ['female', 'Kadın'],
  ['male', 'Erkek'],
] as const;

const dateTime = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const minutes = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return h! * 60 + m!;
};

function audienceLabel(a: Pick<Announcement, 'audience' | 'customer_gender' | 'shop_audience'>) {
  if (a.audience === 'all') return 'Herkes';
  if (a.audience === 'businesses') return a.shop_audience ? `Salonlar · ${SHOP_TYPES.find(([v]) => v === a.shop_audience)![1]}` : 'Salonlar';
  return a.customer_gender ? `Müşteriler · ${a.customer_gender === 'female' ? 'Kadın' : 'Erkek'}` : 'Müşteriler';
}

function scheduleLabel(a: Announcement) {
  if (a.repeat === 'daily') return `Her gün ${hhmm(a.time_of_day!)}`;
  if (a.repeat === 'weekly') {
    const days = a.weekdays.length === 7 ? 'Her gün' : a.weekdays.map((d) => (a.weekdays.length > 2 ? DAYS[d - 1] : DAY_NAMES[d - 1])).join(', ');
    return `${days} ${hhmm(a.time_of_day!)}`;
  }
  return a.last_sent_at ? `Bir kez · ${dateTime(a.last_sent_at)}` : a.next_run_at ? `Bir kez · ${dateTime(a.next_run_at)}` : 'Bir kez';
}

function status(a: Announcement): { label: string; tone: string } {
  if (a.repeat === 'once') {
    if (a.last_sent_at) return { label: 'Gönderildi', tone: 'badge-success' };
    if (!a.active) return { label: a.next_run_at ? 'Durduruldu' : 'Gönderilmedi', tone: 'badge-muted' };
    return { label: 'Zamanlandı', tone: 'badge-info' };
  }
  return a.active ? { label: 'Tekrarlanıyor', tone: 'badge-info' } : { label: 'Duraklatıldı', tone: 'badge-muted' };
}

/**
 * Bildirimler (founder, 8 November 2026): push notifications from our team to salons,
 * customers or everyone, now, at a set time, every day or on chosen weekdays. They reach
 * people with the app who have not turned announcements off (Profil → Duyurular).
 */
export function AnnouncementsTab() {
  const [list, setList] = useState<Announcement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('businesses');
  const [shopType, setShopType] = useState<'men' | 'women' | 'unisex' | null>(null);
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [repeat, setRepeat] = useState<Repeat>('now');
  const [sendAt, setSendAt] = useState('');
  const [time, setTime] = useState('10:00');
  const [days, setDays] = useState<number[]>([7]);
  const [reach, setReach] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await api<Announcement[]>('/admin/announcements'));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const q = new URLSearchParams({ audience });
    if (audience === 'businesses' && shopType) q.set('shopAudience', shopType);
    if (audience === 'customers' && gender) q.set('customerGender', gender);
    setReach(null);
    api<{ recipients: number }>(`/admin/announcements/recipients?${q}`)
      .then((r) => setReach(r.recipients))
      .catch(() => undefined);
  }, [audience, shopType, gender]);

  const ready = title.trim() && body.trim() && (repeat !== 'later' || sendAt) && (repeat !== 'weekly' || days.length) && (repeat === 'now' || repeat === 'later' || time);

  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await action();
      if (done) setNote(done);
      await load();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    const ok = await run(
      () =>
        api('/admin/announcements', {
          method: 'POST',
          body: {
            title: title.trim(),
            body: body.trim(),
            audience,
            shopAudience: audience === 'businesses' ? shopType : null,
            customerGender: audience === 'customers' ? gender : null,
            repeat: repeat === 'now' || repeat === 'later' ? 'once' : repeat,
            // The form's date and time are Istanbul time.
            sendAt: repeat === 'later' ? `${sendAt}:00+03:00` : null,
            timeOfDay: repeat === 'daily' || repeat === 'weekly' ? minutes(time) : null,
            weekdays: repeat === 'weekly' ? days : [],
          },
        }),
      repeat === 'now' ? 'Gönderiliyor: birkaç dakika içinde telefonlara ulaşır.' : 'Zamanlandı.',
    );
    if (ok) {
      setTitle('');
      setBody('');
    }
  }

  async function test() {
    let sent = false;
    const ok = await run(async () => {
      sent = (await api<{ sent: boolean }>('/admin/announcements/test', { method: 'POST', body: { title: title.trim(), body: body.trim() } })).sent;
    });
    if (!ok) return;
    if (sent) setNote('Test bildirimi telefonunuza gönderildi.');
    else setError('Bu hesapla uygulamaya giriş yapılmış bir telefon yok. Uygulamada bu numarayla giriş yapın, sonra tekrar deneyin.');
  }

  return (
    <div className={styles.announce}>
      <section className={`card ${styles.panel}`} aria-labelledby="new-announcement">
        <h2 id="new-announcement">Yeni bildirim</h2>
        <div className={styles.announceGrid}>
          <div className={styles.announceForm}>
            <label className={`field ${styles.announceField}`}>
              <span>
                Başlık <small className={styles.counter}>{title.length}/65</small>
              </span>
              <input className="input" maxLength={65} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bugün anlık çağrıları kaçırma" />
            </label>
            <label className={`field ${styles.announceField}`}>
              <span>
                Metin <small className={styles.counter}>{body.length}/240</small>
              </span>
              <textarea
                className={`input ${styles.textarea}`}
                rows={3}
                maxLength={240}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Pazar tıraşı için berber arayan müşteriler sana ulaşabilsin."
              />
            </label>

            <div className={styles.announceGroup}>
              <span>Kime</span>
              <div className={styles.chips} role="radiogroup" aria-label="Kime">
                {(
                  [
                    ['businesses', 'Salonlar'],
                    ['customers', 'Müşteriler'],
                    ['all', 'Herkes'],
                  ] as const
                ).map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={audience === v} className={audience === v ? styles.chipOn : ''} onClick={() => setAudience(v)}>
                    {l}
                  </button>
                ))}
              </div>
              {audience === 'businesses' && (
                <div className={styles.chips} role="radiogroup" aria-label="Salon türü">
                  {SHOP_TYPES.map(([v, l]) => (
                    <button key={l} type="button" role="radio" aria-checked={shopType === v} className={shopType === v ? styles.chipOn : ''} onClick={() => setShopType(v)}>
                      {l}
                    </button>
                  ))}
                </div>
              )}
              {audience === 'customers' && (
                <div className={styles.chips} role="radiogroup" aria-label="Cinsiyet">
                  {GENDERS.map(([v, l]) => (
                    <button key={l} type="button" role="radio" aria-checked={gender === v} className={gender === v ? styles.chipOn : ''} onClick={() => setGender(v)}>
                      {l}
                    </button>
                  ))}
                </div>
              )}
              <p className={styles.hint}>{reach === null ? 'Hesaplanıyor…' : `Şu anda ${reach.toLocaleString('tr-TR')} kişiye ulaşır`} (uygulaması olan ve duyuruları kapatmamış kişiler).</p>
            </div>

            <div className={styles.announceGroup}>
              <span>Ne zaman</span>
              <div className={styles.chips} role="radiogroup" aria-label="Ne zaman">
                {(
                  [
                    ['now', 'Şimdi'],
                    ['later', 'İleri bir zaman'],
                    ['daily', 'Her gün'],
                    ['weekly', 'Belirli günler'],
                  ] as const
                ).map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={repeat === v} className={repeat === v ? styles.chipOn : ''} onClick={() => setRepeat(v)}>
                    {l}
                  </button>
                ))}
              </div>
              {repeat === 'later' && <input className="input" type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} aria-label="Gönderim zamanı" />}
              {repeat === 'weekly' && (
                <div className={styles.chips} aria-label="Günler">
                  {DAYS.map((d, i) => {
                    const on = days.includes(i + 1);
                    return (
                      <button key={d} type="button" aria-pressed={on} className={on ? styles.chipOn : ''} onClick={() => setDays((list) => (on ? list.filter((x) => x !== i + 1) : [...list, i + 1]))}>
                        {d}
                      </button>
                    );
                  })}
                </div>
              )}
              {(repeat === 'daily' || repeat === 'weekly') && <input className={`input ${styles.time}`} type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Saat" />}
              <p className={styles.hint}>Saatler Türkiye saatidir. Bildirimler yalnızca 09:00–21:00 arasında gönderilir.</p>
            </div>

            <p className={styles.hint}>
              Uygulamada görünür: abonelik, paket fiyatı veya ödeme bağlantısı yazmayın (App Store ve Google Play kuralları). Müşterilere reklam niteliğinde mesajlar için onay gerekir.
            </p>
            {error && <p className="alert alert-danger">{error}</p>}
            {note && <p className="alert alert-info">{note}</p>}
            <div className={styles.panelActions}>
              <button type="button" className="btn" disabled={busy || !title.trim() || !body.trim()} onClick={test}>
                Kendime test gönder
              </button>
              <button type="button" className="btn btn-primary" disabled={busy || !ready} onClick={submit}>
                {repeat === 'now' ? 'Gönder' : 'Zamanla'}
              </button>
            </div>
          </div>

          <div className={styles.preview} aria-label="Önizleme">
            <span className={styles.previewLabel}>Telefonda böyle görünür</span>
            <div className={styles.phoneNote}>
              <span className={styles.phoneIcon}>
                <LogoMark size={22} />
              </span>
              <div>
                <div className={styles.phoneMeta}>{BRAND} · şimdi</div>
                <strong>{title.trim() || 'Bildirim başlığı'}</strong>
                <p>{body.trim() || 'Bildirim metni burada görünür.'}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <h2 className={styles.announceTitle}>Gönderilenler ve zamanlananlar</h2>
      {!list && <SkeletonList rows={2} />}
      {list && list.length === 0 && <p className={styles.empty}>Henüz bildirim yok.</p>}
      {list && list.length > 0 && (
        <ul className={styles.rows} role="list">
          {list.map((a) => {
            const st = status(a);
            const canResume = a.repeat !== 'once' || (!a.last_sent_at && a.next_run_at && new Date(a.next_run_at) > new Date());
            return (
              <li key={a.id} className={`card ${styles.announceRow}`}>
                <div className={styles.rowMain}>
                  <strong>{a.title}</strong>
                  <span>{a.body}</span>
                  <span>
                    {audienceLabel(a)} · {scheduleLabel(a)}
                    {a.repeat !== 'once' && a.active && a.next_run_at ? ` · sıradaki ${dateTime(a.next_run_at)}` : ''}
                  </span>
                  {a.last_sent_at && (
                    <span>
                      Son gönderim {dateTime(a.last_sent_at)} · {a.last_sent_count ?? 0} kişi
                      {a.repeat !== 'once' ? ` · toplam ${a.total_sent}` : ''}
                    </span>
                  )}
                </div>
                <div className={styles.announceActions}>
                  <span className={`badge ${st.tone}`}>{st.label}</span>
                  {a.active ? (
                    <button type="button" className={styles.linkBtn} disabled={busy} onClick={() => run(() => api(`/admin/announcements/${a.id}/active`, { method: 'PUT', body: { active: false } }))}>
                      Duraklat
                    </button>
                  ) : (
                    canResume && (
                      <button type="button" className={styles.linkBtn} disabled={busy} onClick={() => run(() => api(`/admin/announcements/${a.id}/active`, { method: 'PUT', body: { active: true } }))}>
                        Devam et
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    className={`${styles.linkBtn} ${styles.linkDanger}`}
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm('Bu bildirim silinsin mi? Gönderilmiş olanlar telefonlardan silinmez.')) run(() => api(`/admin/announcements/${a.id}`, { method: 'DELETE' }));
                    }}
                  >
                    Sil
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
