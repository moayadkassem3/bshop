'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PhoneInput } from '@/components/PhoneInput';
import { PROVINCES } from '@/components/register/provinces';
import { api, errorMessage } from '@/lib/api';
import { SALES_EMAIL } from '@/lib/config';
import { phoneComplete } from '@/lib/phone';
import { getToken } from '@/lib/session';
import type { Me } from '@/lib/types';
import styles from './quote.module.css';

type Source = 'fiyatlar' | 'kayit' | 'ayarlar';

const BACK: Record<Source, { href: string; label: string }> = {
  fiyatlar: { href: '/isletmeler', label: '← Paketler ve fiyatlar' },
  kayit: { href: '/isletme-kaydi', label: '← Kayda dön' },
  ayarlar: { href: '/isletme-ayarlari#personel', label: '← Personel' },
};

const ABOVE = 10;

type Form = { salonName: string; contactName: string; phone: string; email: string; staffCount: string; branchCount: string; city: string; message: string };

/**
 * "Teklif al" (v1.7): salons with more than 10 staff ask for a custom price.
 * The request is saved and our team is told; the owner can also send it from
 * their own email app. Filled in from the link (?personel=, ?il=, ?salon=) and
 * from the account when signed in.
 */
export function QuoteForm() {
  const [source, setSource] = useState<Source>('fiyatlar');
  const [form, setForm] = useState<Form>({ salonName: '', contactName: '', phone: '', email: '', staffCount: '', branchCount: '1', city: '', message: '' });
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const update = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const from = q.get('kaynak');
    if (from === 'kayit' || from === 'ayarlar') setSource(from);
    update({
      staffCount: q.get('personel') ?? '',
      city: PROVINCES.includes(q.get('il') ?? '') ? q.get('il')! : '',
      salonName: q.get('salon') ?? '',
    });
    if (!getToken()) return;
    api<Me>('/me')
      .then((me) =>
        setForm((f) => ({
          ...f,
          contactName: f.contactName || [me.first_name, me.last_name].filter(Boolean).join(' '),
          phone: f.phone || me.phone.replace(/^\+90/, '0'),
        })),
      )
      .catch(() => undefined);
  }, []);

  const staff = Number(form.staffCount);
  const branches = Number(form.branchCount) || 1;
  const problem =
    form.salonName.trim().length < 2
      ? 'Salon adını yazın.'
      : form.contactName.trim().length < 2
        ? 'Adınızı ve soyadınızı yazın.'
        : !phoneComplete(form.phone)
          ? 'Cep telefonunuzu yazın.'
          : !Number.isInteger(staff) || staff <= ABOVE
            ? `Randevu alacak personel sayısını yazın (${ABOVE}’dan fazla).`
            : form.email && !/^\S+@\S+\.\S+$/.test(form.email)
              ? 'E-posta adresini kontrol edin.'
              : null;

  async function submit(byEmail: boolean) {
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      await api('/public/quote-requests', {
        method: 'POST',
        body: {
          salonName: form.salonName,
          contactName: form.contactName,
          phone: form.phone,
          email: form.email || null,
          staffCount: staff,
          branchCount: branches,
          city: form.city || null,
          message: form.message || null,
          source,
          website,
        },
      });
      setSent(true);
      if (byEmail && SALES_EMAIL) window.location.href = mailto();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function mailto() {
    const lines = [
      `Salon: ${form.salonName}`,
      `Yetkili: ${form.contactName}`,
      `Telefon: ${form.phone}`,
      form.email && `E-posta: ${form.email}`,
      `Randevu alacak personel: ${staff}`,
      `Şube sayısı: ${branches}`,
      form.city && `İl: ${form.city}`,
      form.message && `\n${form.message}`,
    ].filter(Boolean);
    return `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(`Fiyat teklifi: ${form.salonName}`)}&body=${encodeURIComponent(lines.join('\n'))}`;
  }

  const back = BACK[source];

  if (sent) {
    return (
      <div className={`container narrow ${styles.page}`}>
        <Link href={back.href} className={styles.back}>
          {back.label}
        </Link>
        <div className={`card ${styles.done}`} role="status">
          <h1>Talebiniz alındı</h1>
          <p>
            {form.contactName.split(' ')[0]}, {staff} personelli salonunuz için size özel fiyatı hazırlayıp <strong>{form.phone}</strong> numarasından arayacağız.
          </p>
          {SALES_EMAIL && (
            <p className={styles.muted}>
              E-postayla da yazmak isterseniz: <a href={mailto()}>{SALES_EMAIL}</a>
            </p>
          )}
          <Link href={back.href} className="btn btn-primary btn-block">
            {source === 'kayit' ? 'Kayda devam et' : 'Tamam'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`container narrow ${styles.page}`}>
      <Link href={back.href} className={styles.back}>
        {back.label}
      </Link>
      <header className={styles.head}>
        <p className={styles.kicker}>{ABOVE}’dan fazla personel</p>
        <h1>Size özel teklif</h1>
        <p className={styles.lead}>Birkaç bilgi bırakın; salonunuza uygun fiyatı hazırlayıp sizi arayalım.</p>
      </header>

      <form
        className={`card ${styles.form}`}
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
      >
        <div className="field">
          <label htmlFor="q-salon">Salon adı</label>
          <input id="q-salon" className="input" maxLength={120} value={form.salonName} onChange={(e) => update({ salonName: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="q-name">Adınız soyadınız</label>
          <input id="q-name" className="input" maxLength={80} autoComplete="name" value={form.contactName} onChange={(e) => update({ contactName: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="q-phone">Cep telefonu</label>
          <PhoneInput id="q-phone" value={form.phone} onChange={(phone) => update({ phone })} />
        </div>
        <div className="field">
          <label htmlFor="q-email">E-posta (isteğe bağlı)</label>
          <input id="q-email" className="input" type="email" inputMode="email" maxLength={120} autoComplete="email" value={form.email} onChange={(e) => update({ email: e.target.value })} />
        </div>
        <div className={styles.row}>
          <div className="field">
            <label htmlFor="q-staff">Randevu alacak personel</label>
            <input
              id="q-staff"
              className="input"
              inputMode="numeric"
              placeholder={`${ABOVE + 1}+`}
              value={form.staffCount}
              onChange={(e) => update({ staffCount: e.target.value.replace(/\D/g, '').slice(0, 4) })}
            />
          </div>
          <div className="field">
            <label htmlFor="q-branches">Şube sayısı</label>
            <input id="q-branches" className="input" inputMode="numeric" value={form.branchCount} onChange={(e) => update({ branchCount: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="q-city">İl</label>
          <select id="q-city" className="input" value={form.city} onChange={(e) => update({ city: e.target.value })}>
            <option value="">Seçin</option>
            {PROVINCES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="q-message">Eklemek istedikleriniz (isteğe bağlı)</label>
          <textarea
            id="q-message"
            className={`input ${styles.textarea}`}
            maxLength={1000}
            placeholder="Örn. şubeler, çalışma şekliniz, ne zaman başlamak istediğiniz"
            value={form.message}
            onChange={(e) => update({ message: e.target.value })}
          />
        </div>
        {/* Left empty by people; it catches form-filling bots. */}
        <input className={styles.trap} tabIndex={-1} autoComplete="off" aria-hidden name="website" value={website} onChange={(e) => setWebsite(e.target.value)} />

        <p className={styles.muted}>
          Bilgileriniz yalnızca size teklif vermek için kullanılır (
          <a href="/sozlesmeler/kvkk-aydinlatma" target="_blank" rel="noreferrer">
            KVKK Aydınlatma Metni
          </a>
          ).
        </p>
        {error && (
          <p className="alert alert-danger" role="alert">
            {error}
          </p>
        )}
        {problem && <p className={styles.problem}>{problem}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || Boolean(problem)}>
          Talebi gönder
        </button>
        {SALES_EMAIL && (
          <button type="button" className="btn btn-block" disabled={busy || Boolean(problem)} onClick={() => void submit(true)}>
            E-postayla gönder
          </button>
        )}
      </form>
    </div>
  );
}
