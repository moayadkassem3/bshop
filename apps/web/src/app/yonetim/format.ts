import type { AdminSalon } from './types';

const TZ = 'Europe/Istanbul';
export const shortDate = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }).format(new Date(iso));
export const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

/** The salon's state in one short label, with a tone for its badge. */
export function salonStatus(s: Pick<AdminSalon, 'suspended_at' | 'subscription_status' | 'visible' | 'current_period_end'>): { label: string; tone: 'success' | 'info' | 'warning' | 'danger' | 'muted' } {
  if (s.suspended_at) return { label: 'Kaldırıldı', tone: 'danger' };
  if (s.subscription_status === 'active') return { label: 'Abone', tone: 'success' };
  if (s.subscription_status === 'past_due') return s.visible ? { label: 'Ödeme gecikti', tone: 'warning' } : { label: 'Ödemedi · gizli', tone: 'danger' };
  if (s.subscription_status === 'trial' && s.visible) {
    const d = s.current_period_end ? daysUntil(s.current_period_end) : null;
    return { label: d != null ? `Deneme · ${d} gün` : 'Deneme', tone: 'info' };
  }
  if (s.subscription_status === 'trial') return { label: 'Deneme bitti · gizli', tone: 'warning' };
  if (s.subscription_status === 'canceled') return { label: 'Abonelik bitti', tone: 'muted' };
  return { label: 'Yayında değil', tone: 'muted' };
}

export const METHODS: Record<string, string> = { havale: 'Havale/EFT', nakit: 'Nakit', kart: 'Kart', diger: 'Diğer' };
/** Labels for the payment list, including activations without a payment. */
export const METHOD_LABELS: Record<string, string> = { ...METHODS, yok: 'Ödemesiz' };
