/**
 * Agreements shown at sign-up (handoff v1.6). The text lives in the website
 * (apps/web/content/legal/<key>.md); bump the version here whenever it changes,
 * so acceptance is recorded against the text the person actually saw.
 */
export type LegalDocument = {
  key: string;
  title: string;
  version: string;
  /** Who must accept it: customers at sign-in, businesses at registration; notices are only shown. */
  audience: 'customer' | 'business' | 'notice' | 'optional';
};

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  { key: 'kullanici-sozlesmesi', title: 'Kullanıcı Sözleşmesi', version: '2026-10-25', audience: 'customer' },
  { key: 'kvkk-aydinlatma', title: 'KVKK Aydınlatma Metni', version: '2026-10-25', audience: 'notice' },
  { key: 'cerez-politikasi', title: 'Çerez ve Yerel Depolama Politikası', version: '2026-10-25', audience: 'notice' },
  { key: 'ticari-ileti-izni', title: 'Ticari Elektronik İleti Onayı', version: '2026-10-25', audience: 'optional' },
  { key: 'isletme-sozlesmesi', title: 'İşletme Hizmet ve Abonelik Sözleşmesi', version: '2026-10-25', audience: 'business' },
  { key: 'veri-isleme-sozlesmesi', title: 'Veri İşleme Sözleşmesi', version: '2026-10-25', audience: 'business' },
];

export const currentVersion = (key: string) => LEGAL_DOCUMENTS.find((d) => d.key === key)?.version;
export const requiredFor = (audience: 'customer' | 'business') =>
  LEGAL_DOCUMENTS.filter((d) => d.audience === audience).map((d) => d.key);
