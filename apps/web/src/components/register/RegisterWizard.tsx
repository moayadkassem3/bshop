'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PhoneSignIn, useLegalVersions } from '@/components/PhoneSignIn';
import { api, ApiError, errorMessage } from '@/lib/api';
import { SALES_EMAIL } from '@/lib/config';
import { formatDuration, formatPrice } from '@/lib/format';
import { getToken, setToken } from '@/lib/session';
import { AUDIENCE, formatPhone, photoUrl, WEEKDAYS } from '@/lib/shop';
import type { Me } from '@/lib/types';
import { PROVINCES } from './provinces';
import styles from './register.module.css';

// MapLibre only runs in the browser.
const LocationPicker = dynamic(() => import('./LocationPicker').then((m) => m.LocationPicker), {
  ssr: false,
  loading: () => <div className={styles.picker} />,
});

type Audience = 'men' | 'women' | 'unisex';
type Day = { open: boolean; start: string; end: string };
type CatalogItem = { id: number; name: string; duration_minutes: number };
type Picked = { price: string; from: boolean };
type Custom = { name: string; duration: string; price: string; from: boolean };
type Member = { displayName: string; phone: string; role: 'staff' | 'co_owner'; bookable: boolean };
type Plan = { id: string; name: string; maxStaff: number; monthlyPriceKurus: number };
type Plans = { plans: Plan[]; features: string[]; terms: { vatIncluded: boolean; trialDays: number; customQuoteAboveStaff: number } };

type Draft = {
  audience: Audience | null;
  name: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  about: string;
  city: string;
  district: string;
  address: string;
  point: { lat: number; lng: number } | null;
  days: Day[];
  picked: Record<number, Picked>;
  custom: Custom[];
  ownerName: string;
  ownerBookable: boolean;
  members: Member[];
};

const EMPTY: Draft = {
  audience: null,
  name: '',
  phone: '',
  whatsapp: '',
  instagram: '',
  about: '',
  city: '',
  district: '',
  address: '',
  point: null,
  // Monday to Saturday 09:00–20:00, Sunday closed: the most common salon week.
  days: WEEKDAYS.map((_, i) => ({ open: i < 6, start: '09:00', end: '20:00' })),
  picked: {},
  custom: [],
  ownerName: '',
  ownerBookable: true,
  members: [],
};

const STEPS = ['Tür', 'Bilgiler', 'Adres', 'Saatler', 'Hizmetler', 'Personel', 'Paket'] as const;
const DRAFT_KEY = 'salon-randevu-kayit-taslagi';

function loadDraft(): { draft: Draft; step: number } {
  try {
    const saved = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? 'null');
    if (saved?.draft) return { draft: { ...EMPTY, ...saved.draft }, step: Math.min(saved.step ?? 1, STEPS.length) };
  } catch {
    // A broken or unavailable draft starts the form from the beginning.
  }
  return { draft: EMPTY, step: 1 };
}

function saveDraft(draft: Draft | null, step = 1) {
  try {
    if (draft) window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ draft, step }));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Without storage the draft lasts for this page only.
  }
}

// Opening and closing times in 15-minute steps, 24-hour clock (time inputs show AM/PM on some phones).
const TIMES = Array.from({ length: 24 * 4 + 1 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);

const toMinute = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};

/** "450" or "450,50" (Turkish decimal comma) to kuruş; null when not a price. */
function toKurus(value: string): number | null {
  const n = Number(value.replace(/\s/g, '').replace(',', '.'));
  return value.trim() && Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? Math.round(n * 100) : null;
}

const digits = (phone: string) => phone.replace(/\D/g, '');
const phoneOk = (phone: string) => digits(phone).length >= 10;

function staffCount(d: Draft) {
  return (d.ownerBookable ? 1 : 0) + d.members.filter((m) => m.role === 'staff' || m.bookable).length;
}

/** Why the current step can't continue yet; null when it can. */
function blocker(step: number, d: Draft): string | null {
  switch (step) {
    case 1:
      return d.audience ? null : 'Salon türünü seçin.';
    case 2:
      if (d.name.trim().length < 2) return 'İşletme adını yazın.';
      if (!phoneOk(d.phone)) return 'Salon telefonunu yazın.';
      if (d.whatsapp && !phoneOk(d.whatsapp)) return 'WhatsApp numarası eksik görünüyor.';
      return null;
    case 3:
      if (!d.city) return 'İli seçin.';
      if (d.district.trim().length < 2) return 'İlçeyi yazın.';
      if (d.address.trim().length < 5) return 'Açık adresi yazın.';
      return d.point ? null : 'Haritada salonunuzun yerini işaretleyin.';
    case 4: {
      const open = d.days.filter((x) => x.open);
      if (!open.length) return 'En az bir gün açık olmalı.';
      return open.every((x) => toMinute(x.end) > toMinute(x.start)) ? null : 'Kapanış saati açılıştan sonra olmalı.';
    }
    case 5: {
      const picked = Object.values(d.picked);
      if (!picked.length && !d.custom.length) return 'En az bir hizmet seçin.';
      if (picked.some((p) => toKurus(p.price) === null)) return 'Seçtiğiniz her hizmete fiyat yazın.';
      const customOk = d.custom.every((c) => c.name.trim().length >= 2 && Number(c.duration) >= 5 && toKurus(c.price) !== null);
      return customOk ? null : 'Eklediğiniz hizmetlerin adını, süresini ve fiyatını tamamlayın.';
    }
    case 6:
      if (!d.ownerName.trim()) return 'Adınızı yazın.';
      if (d.members.some((m) => !m.displayName.trim() || !phoneOk(m.phone))) return 'Her kişinin adını ve telefonunu yazın.';
      return staffCount(d) ? null : 'En az bir kişi randevu almalı.';
    default:
      return null;
  }
}

/**
 * Self-service shop registration (v1.6), one topic per page: salon type,
 * details, address and map pin, hours, services and prices, staff (which sets
 * the plan), then plan and agreements. Photos are added once the shop exists.
 */
export function RegisterWizard() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [step, setStep] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [result, setResult] = useState<{ shopId: string; slug: string } | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const saved = loadDraft();
    setDraft(saved.draft);
    setStep(saved.step);
    setLoaded(true);
    if (!getToken()) return setMe(null);
    api<Me>('/me')
      .then(async (user) => {
        // Someone coming back while their application is under review sees its status, not an empty form.
        if (user.portal === 'owner') {
          const shops = await api<{ id: string; slug: string; reviewed_at: string | null }[]>('/staff/shops').catch(() => []);
          const pending = shops.find((s) => !s.reviewed_at);
          if (pending) {
            setResult({ shopId: pending.id, slug: pending.slug });
            setFinished(true);
          }
        }
        setMe(user);
      })
      .catch(() => {
        setToken(null);
        setMe(null);
      });
  }, []);

  useEffect(() => {
    if (loaded && !result) saveDraft(draft, step);
  }, [draft, step, loaded, result]);

  // The owner's name starts as the account name.
  useEffect(() => {
    if (me && !draft.ownerName) {
      const name = [me.first_name, me.last_name].filter(Boolean).join(' ');
      if (name) setDraft((d) => ({ ...d, ownerName: name }));
    }
  }, [me, draft.ownerName]);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const go = (next: number) => {
    setStep(next);
    window.scrollTo({ top: 0 });
  };

  if (me === undefined || !loaded) return null;

  if (finished && result) return <Done slug={result.slug} />;
  if (result) return <PhotosStep shopId={result.shopId} onDone={() => setFinished(true)} />;

  if (me === null) {
    return (
      <Shell title="İşletmenizi kaydedin" back={{ href: '/isletmeler', label: '← Vazgeç' }}>
        <p className={styles.kicker}>Başlamadan önce</p>
        <h1 className={styles.title}>Telefon numaranızı doğrulayın</h1>
        <p className={styles.lead}>Bu numara işletme sahibi hesabınız olur. Kayda kaldığınız yerden devam edebilirsiniz.</p>
        <div className={`card ${styles.signIn}`}>
          <PhoneSignIn askNames as="customer" onSignedIn={setMe} />
        </div>
      </Shell>
    );
  }

  const problem = blocker(step, draft);
  const last = step === STEPS.length;

  return (
    <Shell
      title={STEPS[step - 1]!}
      progress={step / (STEPS.length + 1)}
      count={`${step}/${STEPS.length + 1}`}
      back={step > 1 ? { onClick: () => go(step - 1), label: '← Geri' } : { href: '/isletmeler', label: '← Vazgeç' }}
    >
      {step === 1 && <TypeStep draft={draft} update={update} />}
      {step === 2 && <DetailsStep draft={draft} update={update} />}
      {step === 3 && <AddressStep draft={draft} update={update} />}
      {step === 4 && <HoursStep draft={draft} update={update} />}
      {step === 5 && <ServicesStep draft={draft} update={update} />}
      {step === 6 && <StaffStep draft={draft} update={update} me={me} />}
      {step === 7 && (
        <PlanStep
          draft={draft}
          me={me}
          onRegistered={(r) => {
            saveDraft(null);
            setToken(r.token, 'owner');
            setResult(r);
            window.scrollTo({ top: 0 });
          }}
        />
      )}

      {!last && (
        <div className={styles.actions}>
          <div className="container narrow">
            {problem && <p className={styles.actionsHint}>{problem}</p>}
            <div className={styles.actionsRow}>
              <button type="button" className="btn btn-primary" disabled={!!problem} onClick={() => go(step + 1)}>
                Devam
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell(props: {
  title: string;
  progress?: number;
  count?: string;
  back: { href: string; label: string } | { onClick: () => void; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div className={`container narrow ${styles.topRow}`}>
          {'href' in props.back ? (
            <Link href={props.back.href} className={styles.topBack}>
              {props.back.label}
            </Link>
          ) : (
            <button type="button" className={styles.topBack} onClick={props.back.onClick}>
              {props.back.label}
            </button>
          )}
          {props.count && <span className={styles.stepCount}>Adım {props.count}</span>}
        </div>
        {props.progress !== undefined && (
          <div className={styles.progress} role="progressbar" aria-valuenow={Math.round(props.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={props.title}>
            <span style={{ width: `${props.progress * 100}%` }} />
          </div>
        )}
      </header>
      <main className={`container narrow ${styles.body}`}>{props.children}</main>
    </div>
  );
}

type StepProps = { draft: Draft; update: (patch: Partial<Draft>) => void };

function Heading(props: { kicker: string; title: string; lead: string }) {
  return (
    <>
      <p className={styles.kicker}>{props.kicker}</p>
      <h1 className={styles.title}>{props.title}</h1>
      <p className={styles.lead}>{props.lead}</p>
    </>
  );
}

const TYPE_OPTIONS: { value: Audience; icon: string; hint: string }[] = [
  { value: 'men', icon: '💈', hint: 'Saç, sakal ve erkek bakımı' },
  { value: 'women', icon: '💇‍♀️', hint: 'Saç, renk ve kadın bakımı' },
  { value: 'unisex', icon: '✂️', hint: 'Kadın ve erkek müşterilere hizmet' },
];

function TypeStep({ draft, update }: StepProps) {
  return (
    <>
      <Heading kicker="Hoş geldiniz" title="Ne tür bir salonsunuz?" lead="Müşteriler haritada salonları bu türe göre filtreler." />
      <div className={styles.types} role="radiogroup" aria-label="Salon türü">
        {TYPE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={draft.audience === o.value}
            className={`${styles.type} ${draft.audience === o.value ? styles.selected : ''}`}
            onClick={() => update({ audience: o.value })}
          >
            <span className={styles.typeIcon} aria-hidden>
              {o.icon}
            </span>
            <span>
              <strong>{AUDIENCE[o.value]}</strong>
              <span>{o.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function DetailsStep({ draft, update }: StepProps) {
  return (
    <>
      <Heading kicker="İşletme bilgileri" title="Salonunuzu tanıtın" lead="Bu bilgiler profil sayfanızda görünür; sonradan değiştirebilirsiniz." />
      <div className={styles.stack}>
        <div className="field">
          <label htmlFor="r-name">İşletme adı</label>
          <input id="r-name" className="input" value={draft.name} maxLength={80} placeholder="Örn. Nirvana Erkek Kuaförü" onChange={(e) => update({ name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="r-phone">Salon telefonu</label>
          <input id="r-phone" className="input" type="tel" inputMode="tel" value={draft.phone} placeholder="05xx xxx xx xx" onChange={(e) => update({ phone: e.target.value })} />
          <p className={styles.help}>Müşteriler “Ara” düğmesiyle bu numarayı arar. Sabit hat da olabilir.</p>
        </div>
        <div className="field">
          <label htmlFor="r-wa">WhatsApp (isteğe bağlı)</label>
          <input id="r-wa" className="input" type="tel" inputMode="tel" value={draft.whatsapp} placeholder="Salon telefonuyla aynıysa da yazın" onChange={(e) => update({ whatsapp: e.target.value })} />
          {phoneOk(draft.phone) && !draft.whatsapp && (
            <button type="button" className={styles.linkButton} onClick={() => update({ whatsapp: draft.phone })}>
              Salon telefonunu kullan
            </button>
          )}
        </div>
        <div className="field">
          <label htmlFor="r-ig">Instagram (isteğe bağlı)</label>
          <input id="r-ig" className="input" value={draft.instagram} placeholder="@kullaniciadi" autoCapitalize="none" onChange={(e) => update({ instagram: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="r-about">Hakkında (isteğe bağlı)</label>
          <textarea
            id="r-about"
            className={`input ${styles.textarea}`}
            value={draft.about}
            maxLength={600}
            placeholder="Salonunuzu birkaç cümleyle anlatın."
            onChange={(e) => update({ about: e.target.value })}
          />
        </div>
      </div>
    </>
  );
}

function AddressStep({ draft, update }: StepProps) {
  return (
    <>
      <Heading kicker="Adres" title="Salonunuz nerede?" lead="Müşteriler sizi haritada bu konumda görür ve yol tarifi alır." />
      <div className={styles.stack}>
        <div className={styles.row}>
          <div className="field">
            <label htmlFor="r-city">İl</label>
            <select id="r-city" className={`input ${styles.select}`} value={draft.city} onChange={(e) => update({ city: e.target.value })}>
              <option value="">Seçin</option>
              {PROVINCES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="r-district">İlçe</label>
            <input id="r-district" className="input" value={draft.district} maxLength={80} placeholder="Örn. Kadıköy" onChange={(e) => update({ district: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="r-address">Açık adres</label>
          <textarea
            id="r-address"
            className={`input ${styles.textarea}`}
            value={draft.address}
            maxLength={300}
            placeholder="Mahalle, cadde/sokak, bina no"
            onChange={(e) => update({ address: e.target.value })}
          />
        </div>
        <div className="field">
          <span className={styles.fieldLabel}>Haritadaki yeri</span>
          <LocationPicker value={draft.point} onChange={(point) => update({ point })} />
        </div>
      </div>
    </>
  );
}

function HoursStep({ draft, update }: StepProps) {
  const setDay = (i: number, patch: Partial<Day>) => update({ days: draft.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const firstOpen = draft.days.find((d) => d.open);
  return (
    <>
      <Heading kicker="Çalışma saatleri" title="Hangi saatlerde açıksınız?" lead="Müşteriler yalnızca bu saatlerde randevu alabilir. Her personel kendi saatlerini sonradan değiştirebilir." />
      <div className={`card ${styles.days}`}>
        {draft.days.map((d, i) => (
          <div key={WEEKDAYS[i]} className={styles.day}>
            <label className={styles.dayName}>
              <input type="checkbox" className={styles.toggle} checked={d.open} onChange={(e) => setDay(i, { open: e.target.checked })} />
              {WEEKDAYS[i]}
            </label>
            {d.open ? (
              <span className={styles.dayTimes}>
                <TimeSelect value={d.start} label={`${WEEKDAYS[i]} açılış`} onChange={(start) => setDay(i, { start })} />
                –
                <TimeSelect value={d.end} label={`${WEEKDAYS[i]} kapanış`} onChange={(end) => setDay(i, { end })} />
              </span>
            ) : (
              <span className={styles.closed}>Kapalı</span>
            )}
          </div>
        ))}
      </div>
      {firstOpen && (
        <p>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => update({ days: draft.days.map((d) => (d.open ? { ...d, start: firstOpen.start, end: firstOpen.end } : d)) })}
          >
            {firstOpen.start}–{firstOpen.end} saatini tüm açık günlere uygula
          </button>
        </p>
      )}
    </>
  );
}

function TimeSelect(props: { value: string; label: string; onChange: (value: string) => void }) {
  return (
    <select className={styles.time} value={props.value} aria-label={props.label} onChange={(e) => props.onChange(e.target.value)}>
      {TIMES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

function ServicesStep({ draft, update }: StepProps) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<CatalogItem[]>('/catalog')
      .then(setCatalog)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    return q ? catalog.filter((c) => c.name.toLocaleLowerCase('tr').includes(q)) : catalog;
  }, [catalog, query]);

  const toggle = (id: number) => {
    const picked = { ...draft.picked };
    if (picked[id]) delete picked[id];
    else picked[id] = { price: '', from: false };
    update({ picked });
  };
  const setPicked = (id: number, patch: Partial<Picked>) => update({ picked: { ...draft.picked, [id]: { ...draft.picked[id]!, ...patch } } });
  const setCustom = (i: number, patch: Partial<Custom>) => update({ custom: draft.custom.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const total = Object.keys(draft.picked).length + draft.custom.length;

  return (
    <>
      <Heading
        kicker="Hizmetler ve fiyatlar"
        title="Hangi hizmetleri veriyorsunuz?"
        lead="Listeden seçip fiyatını yazın. Listede olmayanları en alttan ekleyin. Süreleri her personel kendine göre ayarlayabilir."
      />
      <div className={styles.stack}>
        <div className={styles.search}>
          <input className="input" type="search" placeholder="Hizmet ara…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Hizmet ara" />
        </div>
        {total > 0 && <span className={styles.count}>{total} hizmet seçildi</span>}
        {error && <p className="alert alert-danger">{error}</p>}
        <ul className={`card ${styles.services}`} role="list">
          {shown.map((c) => {
            const p = draft.picked[c.id];
            return (
              <li key={c.id} className={styles.service}>
                <button type="button" className={styles.serviceHead} onClick={() => toggle(c.id)} aria-pressed={!!p}>
                  <input type="checkbox" checked={!!p} readOnly tabIndex={-1} aria-hidden />
                  <span className={styles.serviceName}>{c.name}</span>
                  <span className={styles.serviceMeta}>{formatDuration(c.duration_minutes)}</span>
                </button>
                {p && (
                  <div className={styles.servicePrice}>
                    <span className={styles.priceInput}>
                      <input
                        className="input"
                        inputMode="decimal"
                        placeholder="Fiyat"
                        aria-label={`${c.name} fiyatı`}
                        value={p.price}
                        onChange={(e) => setPicked(c.id, { price: e.target.value })}
                      />
                    </span>
                    <label className={styles.smallCheck}>
                      <input type="checkbox" checked={p.from} onChange={(e) => setPicked(c.id, { from: e.target.checked })} />
                      “ve üzeri”
                    </label>
                  </div>
                )}
              </li>
            );
          })}
          {catalog.length > 0 && shown.length === 0 && <li className={styles.custom}>“{query}” listede yok. Aşağıdan kendi hizmetinizi ekleyin.</li>}
        </ul>

        <h2 className={styles.subTitle}>Kendi hizmetleriniz</h2>
        {draft.custom.map((c, i) => (
          <div key={i} className={`card ${styles.custom}`}>
            <div className={styles.personHead}>
              <strong>Hizmet {i + 1}</strong>
              <button type="button" className={styles.remove} onClick={() => update({ custom: draft.custom.filter((_, j) => j !== i) })}>
                Kaldır
              </button>
            </div>
            <div className={styles.customRow}>
              <input className="input" placeholder="Hizmet adı" aria-label="Hizmet adı" value={c.name} maxLength={80} onChange={(e) => setCustom(i, { name: e.target.value })} />
              <span className={styles.durationInput}>
                <input className="input" inputMode="numeric" placeholder="Süre" aria-label="Süre (dakika)" value={c.duration} onChange={(e) => setCustom(i, { duration: e.target.value.replace(/\D/g, '') })} />
              </span>
              <span className={styles.priceInput}>
                <input className="input" inputMode="decimal" placeholder="Fiyat" aria-label="Fiyat" value={c.price} onChange={(e) => setCustom(i, { price: e.target.value })} />
              </span>
            </div>
            <label className={styles.smallCheck}>
              <input type="checkbox" checked={c.from} onChange={(e) => setCustom(i, { from: e.target.checked })} />
              Fiyatı “ve üzeri” olarak göster
            </label>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          onClick={() => update({ custom: [...draft.custom, { name: query.trim(), duration: '30', price: '', from: false }] })}
        >
          + Hizmet ekle
        </button>
      </div>
    </>
  );
}

function PlanBox({ count, plans }: { count: number; plans: Plans | null }) {
  if (!plans) return null;
  const plan = plans.plans.find((p) => count <= p.maxStaff);
  return (
    <div className={styles.planBox} aria-live="polite">
      <div>
        <span>{count} personel randevu alıyor</span>
        <strong>{plan ? plan.name : `${plans.terms.customQuoteAboveStaff}’dan fazla personel`}</strong>
      </div>
      {plan ? (
        <span className={styles.planPrice}>
          {formatPrice(plan.monthlyPriceKurus)}
          <small>/ay</small>
        </span>
      ) : SALES_EMAIL ? (
        <a href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent('Fiyat teklifi')}`}>Teklif alın</a>
      ) : (
        <span>Size özel teklif</span>
      )}
    </div>
  );
}

function usePlans() {
  const [plans, setPlans] = useState<Plans | null>(null);
  useEffect(() => {
    api<Plans>('/public/plans')
      .then(setPlans)
      .catch(() => undefined);
  }, []);
  return plans;
}

function StaffStep({ draft, update, me }: StepProps & { me: Me }) {
  const plans = usePlans();
  const setMember = (i: number, patch: Partial<Member>) => update({ members: draft.members.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  return (
    <>
      <Heading
        kicker="Personel"
        title="Kimler randevu alacak?"
        lead="Ücret, randevu alan personel sayısına göre belirlenir. Ortaklar sizinle aynı yetkilere sahip olur."
      />
      <div className={styles.stack}>
        <div className={`card ${styles.person}`}>
          <div className={styles.personHead}>
            <strong>Siz · İşletme sahibi</strong>
            <span className="muted">{formatPhone(me.phone)}</span>
          </div>
          <div className="field">
            <label htmlFor="r-owner">Müşterilerin göreceği adınız</label>
            <input id="r-owner" className="input" value={draft.ownerName} maxLength={60} onChange={(e) => update({ ownerName: e.target.value })} />
          </div>
          <label className={styles.smallCheck}>
            <input type="checkbox" checked={draft.ownerBookable} onChange={(e) => update({ ownerBookable: e.target.checked })} />
            Ben de randevu alıyorum
          </label>
        </div>

        {draft.members.map((m, i) => (
          <div key={i} className={`card ${styles.person}`}>
            <div className={styles.personHead}>
              <strong>{m.role === 'co_owner' ? 'Ortak' : 'Personel'} {i + 1}</strong>
              <button type="button" className={styles.remove} onClick={() => update({ members: draft.members.filter((_, j) => j !== i) })}>
                Kaldır
              </button>
            </div>
            <div className={styles.segmented} role="radiogroup" aria-label="Rol">
              {(['staff', 'co_owner'] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  role="radio"
                  aria-checked={m.role === role}
                  className={m.role === role ? styles.on : ''}
                  onClick={() => setMember(i, { role, bookable: true })}
                >
                  {role === 'staff' ? 'Personel' : 'Ortak'}
                </button>
              ))}
            </div>
            <div className={styles.row}>
              <div className="field">
                <label htmlFor={`m-name-${i}`}>Ad</label>
                <input id={`m-name-${i}`} className="input" value={m.displayName} maxLength={60} onChange={(e) => setMember(i, { displayName: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor={`m-phone-${i}`}>Cep telefonu</label>
                <input id={`m-phone-${i}`} className="input" type="tel" inputMode="tel" placeholder="05xx…" value={m.phone} onChange={(e) => setMember(i, { phone: e.target.value })} />
              </div>
            </div>
            {m.role === 'co_owner' && <p className={styles.help}>Ortak, sizinle aynı yetkilere sahiptir: fiyatlar, personel ve ayarlar.</p>}
            {m.role === 'co_owner' && (
              <label className={styles.smallCheck}>
                <input type="checkbox" checked={m.bookable} onChange={(e) => setMember(i, { bookable: e.target.checked })} />
                Randevu alıyor
              </label>
            )}
          </div>
        ))}
        <button
          type="button"
          className="btn"
          onClick={() => update({ members: [...draft.members, { displayName: '', phone: '', role: 'staff', bookable: true }] })}
        >
          + Personel veya ortak ekle
        </button>
        <p className={styles.help}>Eklediğiniz kişiler kendi telefon numaralarıyla “İşletmeyim” girişinden girer.</p>
        <PlanBox count={staffCount(draft)} plans={plans} />
      </div>
    </>
  );
}

function PlanStep({ draft, me, onRegistered }: { draft: Draft; me: Me; onRegistered: (r: { shopId: string; slug: string; token: string }) => void }) {
  const plans = usePlans();
  const versions = useLegalVersions();
  const [business, setBusiness] = useState(false);
  const [dataProcessing, setDataProcessing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = staffCount(draft);
  const serviceCount = Object.keys(draft.picked).length + draft.custom.length;
  const openDays = draft.days.filter((d) => d.open).length;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ shopId: string; slug: string; token: string }>('/registrations', {
        method: 'POST',
        body: {
          audience: draft.audience,
          name: draft.name.trim(),
          phone: draft.phone,
          whatsapp: draft.whatsapp || null,
          instagram: draft.instagram.trim() || null,
          about: draft.about.trim() || null,
          city: draft.city,
          district: draft.district.trim(),
          address: draft.address.trim(),
          latitude: draft.point!.lat,
          longitude: draft.point!.lng,
          hours: draft.days.flatMap((d, i) => (d.open ? [{ weekday: i + 1, startMinute: toMinute(d.start), endMinute: toMinute(d.end) }] : [])),
          services: [
            ...Object.entries(draft.picked).map(([id, p]) => ({ catalogId: Number(id), priceKurus: toKurus(p.price)!, priceIsStartingFrom: p.from })),
            ...draft.custom.map((c) => ({
              name: c.name.trim(),
              durationMinutes: Number(c.duration),
              priceKurus: toKurus(c.price)!,
              priceIsStartingFrom: c.from,
            })),
          ],
          owner: { displayName: draft.ownerName.trim(), bookable: draft.ownerBookable },
          members: draft.members.map((m) => ({ ...m, displayName: m.displayName.trim(), bookable: m.role === 'staff' || m.bookable })),
          consents: [
            { key: 'isletme-sozlesmesi', version: versions['isletme-sozlesmesi'] },
            { key: 'veri-isleme-sozlesmesi', version: versions['veri-isleme-sozlesmesi'] },
          ],
        },
      });
      onRegistered(r);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'VALIDATION'
          ? 'Bazı bilgiler eksik veya hatalı görünüyor. Önceki adımları kontrol edin.'
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Heading kicker="Son adım" title="Paketiniz ve sözleşmeler" lead="Bilgilerinizi kontrol edin. Göndermeden önce sözleşmeleri onaylamanız gerekir." />
      <div className={styles.stack}>
        <dl className={`card ${styles.summary}`}>
          <div>
            <dt>İşletme</dt>
            <dd>{draft.name}</dd>
          </div>
          <div>
            <dt>Tür</dt>
            <dd>{draft.audience && AUDIENCE[draft.audience]}</dd>
          </div>
          <div>
            <dt>Konum</dt>
            <dd>
              {draft.district}, {draft.city}
            </dd>
          </div>
          <div>
            <dt>Açık günler</dt>
            <dd>Haftada {openDays} gün</dd>
          </div>
          <div>
            <dt>Hizmetler</dt>
            <dd>{serviceCount} hizmet</dd>
          </div>
          <div>
            <dt>Sahibi</dt>
            <dd>
              {draft.ownerName} · {formatPhone(me.phone)}
            </dd>
          </div>
        </dl>

        <PlanBox count={count} plans={plans} />
        {plans && (
          <>
            <ul className={styles.perks}>
              {plans.features.map((f) => (
                <li key={f}>✓ {f}</li>
              ))}
            </ul>
            <p className={styles.help}>Fiyatlara KDV dahildir.</p>
            <p className={styles.trial}>
              İlk {plans.terms.trialDays} gün ücretsiz. Deneme süresi, salonunuz onaylandığında başlar; bu süre içinde ödeme alınmaz.
            </p>
          </>
        )}

        <div className={styles.consents}>
          <label className={styles.check}>
            <input type="checkbox" checked={business} onChange={(e) => setBusiness(e.target.checked)} />
            <span>
              <a href="/sozlesmeler/isletme-sozlesmesi" target="_blank" rel="noreferrer">
                İşletme Hizmet Sözleşmesi
              </a>
              ’ni okudum ve kabul ediyorum.
            </span>
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={dataProcessing} onChange={(e) => setDataProcessing(e.target.checked)} />
            <span>
              <a href="/sozlesmeler/veri-isleme-sozlesmesi" target="_blank" rel="noreferrer">
                Veri İşleme Sözleşmesi
              </a>
              ’ni okudum ve kabul ediyorum.
            </span>
          </label>
          <p className={styles.help}>
            Kişisel verileriniz{' '}
            <a href="/sozlesmeler/kvkk-aydinlatma" target="_blank" rel="noreferrer">
              KVKK Aydınlatma Metni
            </a>{' '}
            kapsamında işlenir.
          </p>
        </div>

        {error && (
          <p className="alert alert-danger" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className={styles.actions}>
        <div className="container narrow">
          <div className={styles.actionsRow}>
            <button type="button" className="btn btn-primary" disabled={busy || !business || !dataProcessing || !versions['isletme-sozlesmesi']} onClick={submit}>
              {busy ? 'Gönderiliyor…' : 'Başvuruyu gönder'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

type Photo = { id: string };

/** Downscales large phone photos before upload; the server re-encodes them anyway. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 4 * 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.85));
  } catch {
    return file;
  }
}

function PhotosStep({ shopId, onDone }: { shopId: string; onDone: () => void }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    for (const file of Array.from(files).slice(0, 12 - photos.length)) {
      try {
        const body = await shrink(file);
        const res = await fetch(`/api/staff/shops/${shopId}/photos`, {
          method: 'POST',
          headers: { 'content-type': body.type || file.type, authorization: `Bearer ${getToken()}` },
          body,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new ApiError(res.status, data.error ?? 'UNKNOWN');
        setPhotos((p) => [...p, { id: data.id }]);
      } catch (err) {
        setError(errorMessage(err));
        break;
      }
    }
    setBusy(false);
    if (input.current) input.current.value = '';
  }

  return (
    <Shell title="Fotoğraflar" progress={1} count={`${STEPS.length + 1}/${STEPS.length + 1}`} back={{ href: '/profil', label: '← Profil' }}>
      <Heading
        kicker="Başvurunuz alındı"
        title="Salonunuzun fotoğraflarını ekleyin"
        lead="Fotoğraflı salonlar daha çok randevu alır. İlk fotoğraf kapak olur. Bu adımı şimdi atlayıp sonra da ekleyebilirsiniz."
      />
      <ul className={styles.photos} role="list">
        {photos.map((p, i) => (
          <li key={p.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(p.id)} alt={`Fotoğraf ${i + 1}`} />
            {i === 0 && <span className={styles.photoBadge}>Kapak</span>}
          </li>
        ))}
        {photos.length < 12 && (
          <li>
            <button type="button" className={styles.addPhoto} onClick={() => input.current?.click()} disabled={busy}>
              <span aria-hidden>+</span>
              {busy ? 'Yükleniyor…' : 'Fotoğraf ekle'}
            </button>
          </li>
        )}
      </ul>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => upload(e.target.files)} />
      {error && (
        <p className="alert alert-danger" role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <div className="container narrow">
          <div className={styles.actionsRow}>
            <button type="button" className={`btn ${photos.length ? 'btn-primary' : ''}`} onClick={onDone} disabled={busy}>
              {photos.length ? 'Bitir' : 'Şimdilik atla'}
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Done({ slug }: { slug: string }) {
  return (
    <Shell title="İncelemede" back={{ href: '/profil', label: '← Profil' }}>
      <div className={styles.done}>
        <span className={styles.doneMark} aria-hidden>
          ⏳
        </span>
        <p className={styles.kicker}>İncelemede</p>
        <h1 className={styles.title}>Başvurunuz bize ulaştı</h1>
        <p className={styles.lead}>Ekibimiz bilgilerinizi kontrol ediyor. Onaylandığında size SMS göndereceğiz.</p>
        <ol className={`card ${styles.doneSteps}`}>
          <li>Onaydan sonra salonunuz haritada ve kendi sayfasında görünür.</li>
          <li>Ücretsiz deneme süreniz onay gününde başlar.</li>
          <li>Personeliniz kendi numarasıyla “İşletmeyim” girişinden girer.</li>
        </ol>
        <p className="muted">
          Sayfa adresiniz: <strong>/{slug}</strong>
        </p>
        <Link href="/profil" className="btn btn-primary btn-block">
          Profile dön
        </Link>
      </div>
    </Shell>
  );
}
