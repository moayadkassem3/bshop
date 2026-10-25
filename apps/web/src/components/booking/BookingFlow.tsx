'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration, formatPrice, turkeyDate } from '@/lib/format';
import type { ShopProfile, Slot } from '@/lib/types';
import { ConfirmStep, type BookingResult } from './ConfirmStep';
import { DoneStep } from './DoneStep';
import { ServiceStep } from './ServiceStep';
import { StaffStep } from './StaffStep';
import { TimeStep } from './TimeStep';
import styles from './booking.module.css';

type Step = 'services' | 'staff' | 'time' | 'confirm' | 'done';
const STEPS: { key: Exclude<Step, 'done'>; label: string }[] = [
  { key: 'services', label: 'Hizmet' },
  { key: 'staff', label: 'Personel' },
  { key: 'time', label: 'Saat' },
  { key: 'confirm', label: 'Onay' },
];

/**
 * Customer booking (handoff 4.3): services first, then a staff member ("Personel") or
 * "Fark etmez", then a time, then sign-in and the summary. A staff member's
 * own link (?personel=...) skips the staff step.
 */
export function BookingFlow({ profile, presetStaffId }: { profile: ShopProfile; presetStaffId: string | null }) {
  const presetStaff = profile.staff.find((s) => s.id === presetStaffId) ?? null;
  const [step, setStep] = useState<Step>('services');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState<string | null>(presetStaff?.id ?? null);
  const [date, setDate] = useState(() => turkeyDate(new Date()));
  const [slot, setSlot] = useState<Slot | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Each step starts at the top of the page, like a new screen.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const selected = useMemo(
    () => serviceIds.map((id) => profile.services.find((s) => s.id === id)!).filter(Boolean),
    [serviceIds, profile.services],
  );
  const eligibleStaff = profile.staff.filter((s) => serviceIds.every((id) => s.service_ids.includes(id)));
  const staffName = staffId ? profile.staff.find((s) => s.id === staffId)?.display_name : null;
  const totalKurus = selected.reduce((sum, s) => sum + s.price_kurus, 0);
  const startingFrom = selected.some((s) => s.price_is_starting_from);
  const slotDuration = slot?.staff.find((s) => !staffId || s.id === staffId)?.durationMinutes;
  const duration = slotDuration ?? selected.reduce((sum, s) => sum + s.duration_minutes, 0);

  function goToStaffOrTime() {
    setSlot(null);
    if (presetStaff && serviceIds.every((id) => presetStaff.service_ids.includes(id))) {
      setStep('time');
      return;
    }
    if (presetStaff) {
      setNotice(`${presetStaff.display_name} seçtiğiniz hizmetlerin hepsini vermiyor. Başka bir personel seçin.`);
      setStaffId(null);
    }
    setStep('staff');
  }

  const visibleSteps = presetStaff && staffId === presetStaff.id ? STEPS.filter((s) => s.key !== 'staff') : STEPS;
  const currentIndex = visibleSteps.findIndex((s) => s.key === step);

  const back = () => {
    setNotice(null);
    if (step === 'staff') setStep('services');
    else if (step === 'time') setStep(visibleSteps.some((s) => s.key === 'staff') ? 'staff' : 'services');
    else if (step === 'confirm') setStep('time');
  };

  const primary: { label: string; disabled: boolean; onClick: () => void } | null =
    step === 'services'
      ? { label: 'Devam et', disabled: selected.length === 0, onClick: goToStaffOrTime }
      : step === 'staff'
        ? { label: 'Saat seç', disabled: false, onClick: () => setStep('time') }
        : step === 'time'
          ? { label: 'Devam et', disabled: !slot, onClick: () => setStep('confirm') }
          : null;

  return (
    <div className={styles.flow}>
      {step !== 'done' && (
        <ol className={styles.progress} aria-label="Adımlar">
          {visibleSteps.map((s, i) => (
            <li
              key={s.key}
              className={i < currentIndex ? styles.progressDone : i === currentIndex ? styles.progressActive : undefined}
              aria-current={i === currentIndex ? 'step' : undefined}
            >
              <span className={styles.progressDot}>{i < currentIndex ? '✓' : i + 1}</span>
              {s.label}
            </li>
          ))}
        </ol>
      )}

      {notice && <p className="alert alert-info">{notice}</p>}

      {step === 'services' && <ServiceStep services={profile.services} selected={serviceIds} onChange={setServiceIds} />}
      {step === 'staff' && (
        <StaffStep
          slug={profile.slug}
          staff={eligibleStaff}
          serviceIds={serviceIds}
          value={staffId}
          onChange={(id) => {
            setStaffId(id);
            setSlot(null);
          }}
        />
      )}
      {step === 'time' && (
        <TimeStep
          slug={profile.slug}
          serviceIds={serviceIds}
          staffId={staffId}
          date={date}
          onDateChange={(d) => {
            setDate(d);
            setSlot(null);
          }}
          value={slot}
          onChange={setSlot}
        />
      )}
      {step === 'confirm' && slot && (
        <ConfirmStep
          profile={profile}
          services={selected}
          staffId={staffId}
          staffName={staffName ?? null}
          slot={slot}
          durationMinutes={duration}
          totalKurus={totalKurus}
          startingFrom={startingFrom}
          onBooked={(r) => {
            setResult(r);
            setStep('done');
          }}
          onSlotTaken={() => {
            setSlot(null);
            setNotice('Bu saat az önce doldu. Lütfen başka bir saat seçin.');
            setStep('time');
          }}
        />
      )}
      {step === 'done' && result && <DoneStep result={result} slug={profile.slug} />}

      {step !== 'done' && step !== 'confirm' && (
        <div className={styles.bottomBar}>
          <div className={styles.bottomInner}>
            {step !== 'services' && (
              <button type="button" className={`btn ${styles.backButton}`} onClick={back} aria-label="Geri">
                ←
              </button>
            )}
            <div className={styles.summary}>
              <strong>
                {selected.length ? `${selected.length} hizmet · ${formatDuration(duration)}` : 'Hizmet seçin'}
              </strong>
              {selected.length > 0 && <span className="muted">{formatPrice(totalKurus, startingFrom)}</span>}
            </div>
            {primary && (
              <button type="button" className="btn btn-primary" disabled={primary.disabled} onClick={primary.onClick}>
                {primary.label}
              </button>
            )}
          </div>
        </div>
      )}
      {step === 'confirm' && (
        <button type="button" className={`btn ${styles.backLink}`} onClick={back}>
          ← Saati değiştir
        </button>
      )}
    </div>
  );
}
