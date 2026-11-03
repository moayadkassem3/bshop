import Constants from 'expo-constants';

/** The backend, through the website's /api (same as the browser uses). */
export const API_URL: string = Constants.expoConfig?.extra?.apiUrl ?? 'https://salon-randevu-test.onrender.com/api';
/** The website, for pages the app opens in the browser (agreements, a salon's public page). */
export const WEB_URL: string = Constants.expoConfig?.extra?.webUrl ?? 'https://salon-randevu-test.onrender.com';

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

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

/** Set by the session: the token sent with every request, and what to do when it is no longer valid. */
export function configureApi(next: { token: string | null; onUnauthorized?: () => void }) {
  token = next.token;
  if (next.onUnauthorized) onUnauthorized = next.onUnauthorized;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError(res.status, data?.error ?? 'UNKNOWN', data?.retryAfterSeconds);
  }
  return data as T;
}

/** Sends a local image file as the request body (photo uploads: JPEG after shrinking). */
export async function apiUpload<T>(path: string, fileUri: string, contentType = 'image/jpeg'): Promise<T> {
  let res: Response;
  try {
    const blob = await (await fetch(fileUri)).blob();
    res = await fetch(`${API_URL}${path}`, { method: 'POST', headers: { 'content-type': contentType, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: blob });
  } catch {
    throw new ApiError(0, 'NETWORK');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError(res.status, data?.error ?? 'UNKNOWN');
  }
  return data as T;
}

/** The same Turkish messages as the website (apps/web/src/lib/api.ts). */
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
  PHONE_NOT_SUPPORTED: 'Şimdilik yalnızca Türkiye cep telefonu numaralarıyla giriş yapılabilir.',
  OTP_BUSY: 'Şu anda çok fazla giriş isteği var. Birkaç dakika sonra tekrar deneyin.',
  REGISTRATION_LIMIT: 'Bugün zaten bir salon kaydettiniz. Yeni bir salonu yarın ekleyebilirsiniz.',
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
  STYLE_NOT_OFFERED: 'Bu kesim salonunuzun müşterilerine uygun değil. Listeden başka bir kesim seçin.',
  NOT_PENDING: 'Bu talep az önce yanıtlandı veya otomatik onaylandı.',
  NOT_CONFIRMED: 'Bu randevunun durumu değişti.',
  NOT_STARTED: 'Randevu saati henüz gelmedi.',
  HOURS_OVERLAP: 'Bir günün saatleri çakışıyor. Molaları açılış ile kapanış arasına yerleştirin.',
  OVERLAPS_APPOINTMENTS: 'Bu aralıkta randevu var. Önce randevuyu iptal edin veya başka saate alın, sonra kapatın.',
  INVALID_RANGE: 'Bitiş saati, başlangıçtan sonra olmalı.',
  NOT_RATEABLE: 'Yalnızca tamamlanan kendi randevunuzu puanlayabilirsiniz.',
  RATING_CLOSED: 'Bu randevuyu puanlama süresi doldu.',
  HAS_UPCOMING_WORK: 'Size atanmış yaklaşan randevular var. Önce bunları iptal edin veya başka personele aktarın.',
  SHOP_HAS_APPOINTMENTS: 'Salonunuzun yaklaşan randevuları var. Hesabı silmeden önce bunları iptal edin.',
};

const waitLabel = (seconds: number) => (seconds < 60 ? `${seconds} saniye` : `${Math.ceil(seconds / 60)} dakika`);

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.retryAfterSeconds) {
    if (err.code === 'OTP_TOO_SOON') return `Yeni kod istemek için ${waitLabel(err.retryAfterSeconds)} bekleyin.`;
    if (err.code === 'OTP_LIMIT') return `Bu numara için çok fazla kod istendi. ${waitLabel(err.retryAfterSeconds)} sonra tekrar deneyebilirsiniz.`;
  }
  if (err instanceof ApiError && err.code !== 'NETWORK') return MESSAGES[err.code] ?? 'Bir sorun oluştu. Lütfen tekrar deneyin.';
  return 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.';
}
