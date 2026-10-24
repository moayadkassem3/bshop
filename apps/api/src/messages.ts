import { DateTime } from 'luxon';

// Turkish customer SMS and staff push texts (handoff Appendix B wording).

const wholeLira = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const withKurus = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatPrice(kurus: number): string {
  return `₺${(kurus % 100 === 0 ? wholeLira : withKurus).format(kurus / 100)}`;
}

export function formatWhen(instant: Date, timezone: string): string {
  return DateTime.fromJSDate(instant, { zone: timezone }).setLocale('tr').toFormat('d MMMM cccc HH:mm');
}

export function formatTime(instant: Date, timezone: string): string {
  return DateTime.fromJSDate(instant, { zone: timezone }).toFormat('HH:mm');
}

type Ctx = { shop: string; when: string; link: string };

export const sms = {
  otp: (code: string) => `Randevu doğrulama kodunuz: ${code}. Kod 5 dakika geçerlidir. Kimseyle paylaşmayın.`,
  confirmed: (c: Ctx & { staff: string }) =>
    `${c.shop}: ${c.when} randevunuz onaylandı (${c.staff}). Ödeme salonda. Randevularınız: ${c.link}`,
  declined: (c: Ctx) =>
    `${c.shop}: ${c.when} randevu talebiniz salon tarafından kabul edilemedi. Başka bir saat seçmek için: ${c.link}`,
  cancelledByShop: (c: Ctx) =>
    `${c.shop}: ${c.when} randevunuz salon tarafından iptal edildi. Yeni saat seçmek için: ${c.link}`,
  reassignedInfo: (c: Ctx & { staff: string }) =>
    `${c.shop}: ${c.when} randevunuz ${c.staff} ile devam edecek. Saat değişmedi. Randevularınız: ${c.link}`,
  reassignedChoice: (c: Ctx & { staff: string; previousStaff: string }) =>
    `${c.shop}: ${c.previousStaff} bu saatte müsait değil. ${c.when} randevunuz ${c.staff} ile devam edecek. Değiştirmek veya iptal etmek için: ${c.link}`,
};

type Appt = { customer: string; services: string; when: string };

export const push = {
  newRequest: (a: Appt & { deadline: string }) => ({
    title: 'Yeni randevu talebi',
    body: `${a.customer} · ${a.services} · ${a.when}. Yanıt verilmezse ${a.deadline} saatinde otomatik onaylanır.`,
  }),
  newConfirmed: (a: Appt) => ({
    title: 'Yeni randevu (onaylandı)',
    body: `${a.customer} · ${a.services} · ${a.when}`,
  }),
  reminder: (a: Appt & { deadline: string }) => ({
    title: 'Hatırlatma: talep yanıt bekliyor',
    body: `${a.customer} · ${a.services} · ${a.when}. ${a.deadline} saatinde otomatik onaylanacak.`,
  }),
  autoConfirmed: (a: Appt) => ({
    title: 'Randevu otomatik onaylandı',
    body: `${a.customer} · ${a.services} · ${a.when}`,
  }),
  customerCancelled: (a: Appt & { late: boolean }) => ({
    title: a.late ? 'Randevu geç iptal edildi' : 'Randevu iptal edildi',
    body: `${a.customer} · ${a.when}`,
  }),
  reassignedToYou: (a: Appt) => ({
    title: 'Size aktarılan randevu',
    body: `${a.customer} · ${a.services} · ${a.when}`,
  }),
  absenceNeedsReview: (a: { staff: string; count: number }) => ({
    title: `${a.staff} yok olarak işaretlendi`,
    body: `${a.count} randevu etkileniyor. İnceleyip uygulayın.`,
  }),
};
