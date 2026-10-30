'use client';

import { getToken } from './session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    /** Seconds until the request may be tried again, when the server says. */
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

/** Calls the backend through the /api rewrite, with the customer's token when signed in. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'UNKNOWN', typeof data.retryAfterSeconds === 'number' ? data.retryAfterSeconds : undefined);
  return data as T;
}

const MESSAGES: Record<string, string> = {
  SLOT_TAKEN: 'Bu saat az önce doldu. Lütfen başka bir saat seçin.',
  PENDING_EXISTS: 'Bu salonda yanıt bekleyen bir talebiniz var. Yanıt gelince yeni randevu alabilirsiniz.',
  BOOKING_LIMIT: 'Bu salondaki yaklaşan randevu sınırına ulaştınız.',
  OTP_INVALID: 'Kod hatalı veya süresi dolmuş.',
  OTP_TOO_SOON: 'Yeni kod istemek için biraz bekleyin.',
  OTP_LIMIT: 'Bu numara için çok fazla kod istendi.',
  INVALID_PHONE: 'Telefon numarası geçerli değil.',
  NAME_REQUIRED: 'Ad ve soyad gerekli.',
  FORBIDDEN: 'Bu salon şu anda bu hesaptan randevu kabul etmiyor.',
  NOT_CANCELLABLE: 'Bu randevu artık iptal edilemiyor.',
  UNAUTHENTICATED: 'Devam etmek için telefon numaranızı doğrulayın.',
  NOT_FOUND: 'Salon bulunamadı veya şu anda randevu almıyor.',
  NOT_BUSINESS: 'Bu numara kayıtlı bir işletmeye ait değil.',
  REGISTRATION_PENDING: 'Önceki başvurunuz hâlâ inceleniyor. Sonuçlandığında yeni bir işletme kaydedebilirsiniz.',
  DUPLICATE_MEMBER: 'Her kişinin telefon numarası farklı olmalı.',
  CONSENT_REQUIRED: 'Devam etmek için sözleşmeleri onaylayın.',
  OUTDATED_DOCUMENT: 'Sözleşme güncellendi. Lütfen sayfayı yenileyip tekrar onaylayın.',
  INVALID_INSTAGRAM: 'Instagram kullanıcı adı geçerli değil.',
  INVALID_IMAGE: 'Fotoğraf JPEG, PNG veya WebP olmalı.',
  PHOTO_LIMIT: 'En fazla 12 fotoğraf ekleyebilirsiniz.',
  MEMBER_HAS_APPOINTMENTS: 'Bu kişinin yaklaşan randevuları var. Önce Randevular → Takvim’den iptal edin.',
  ALREADY_MEMBER: 'Bu telefon numarası zaten ekipte.',
  CANNOT_DEMOTE_SELF: 'Kendinizi ekipten çıkaramaz veya rolünüzü düşüremezsiniz.',
  OWN_SHOP: 'Çalıştığınız salondan müşteri olarak randevu alamazsınız.',
  POST_LIMIT: 'Paylaşım sınırına ulaşıldı. Eski paylaşımlardan birini kaldırın.',
  NOT_PENDING: 'Bu talep az önce yanıtlandı veya otomatik onaylandı.',
  NOT_CONFIRMED: 'Bu randevunun durumu değişti.',
  NOT_STARTED: 'Randevu saati henüz gelmedi.',
};

/** "45 saniye", "12 dakika": how long to wait, rounded up. */
function waitLabel(seconds: number): string {
  return seconds < 60 ? `${seconds} saniye` : `${Math.ceil(seconds / 60)} dakika`;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.retryAfterSeconds) {
    if (err.code === 'OTP_TOO_SOON') return `Yeni kod istemek için ${waitLabel(err.retryAfterSeconds)} bekleyin.`;
    if (err.code === 'OTP_LIMIT') return `Bu numara için çok fazla kod istendi. ${waitLabel(err.retryAfterSeconds)} sonra tekrar deneyebilirsiniz.`;
  }
  if (err instanceof ApiError) return MESSAGES[err.code] ?? 'Bir sorun oluştu. Lütfen tekrar deneyin.';
  return 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.';
}
