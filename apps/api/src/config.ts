export type Config = {
  databaseUrl: string;
  port: number;
  publicWebUrl: string;
  otpSecret: string;
  sessionDays: number;
  tickSeconds: number;
  uploadsDir: string;
  /** 'disk' (UPLOADS_DIR) or 'database', for hosts whose disk is wiped on restart. */
  photoStorage: 'disk' | 'database';
  /**
   * Test deployments only: SMS codes are returned to the screen (no SMS
   * provider yet) and new registrations are approved immediately.
   */
  demoMode: boolean;
  /** Phone numbers of our team, made admins at start-up (ADMIN_PHONES, comma-separated). */
  adminPhones: string[];
  /**
   * Our bank account for EFT / Havale payments, shown on the website's payment page
   * (PAYMENT_ACCOUNT_HOLDER, PAYMENT_BANK, PAYMENT_IBAN). Without all three the option is closed.
   */
  paymentAccount: { holder: string; bank: string; iban: string } | null;
  /** Firebase service account for push notifications (FCM_SERVICE_ACCOUNT_JSON); without it they print to the log. */
  fcmServiceAccount: string | undefined;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    databaseUrl: env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/bshop',
    port: Number(env.PORT ?? 3000),
    publicWebUrl: env.PUBLIC_WEB_URL ?? env.RENDER_EXTERNAL_URL ?? 'http://localhost:3001',
    otpSecret: env.OTP_SECRET ?? 'dev-only-otp-secret',
    sessionDays: Number(env.SESSION_DAYS ?? 90),
    tickSeconds: Number(env.TICK_SECONDS ?? 5),
    uploadsDir: env.UPLOADS_DIR ?? 'uploads',
    photoStorage: env.PHOTO_STORAGE === 'database' ? 'database' : 'disk',
    demoMode: env.DEMO_MODE === 'true',
    paymentAccount:
      env.PAYMENT_ACCOUNT_HOLDER?.trim() && env.PAYMENT_BANK?.trim() && env.PAYMENT_IBAN?.trim()
        ? { holder: env.PAYMENT_ACCOUNT_HOLDER.trim(), bank: env.PAYMENT_BANK.trim(), iban: env.PAYMENT_IBAN.replace(/\s+/g, '').toUpperCase() }
        : null,
    fcmServiceAccount: env.FCM_SERVICE_ACCOUNT_JSON,
    adminPhones: (env.ADMIN_PHONES ?? '').split(',').map((p) => p.trim()).filter(Boolean),
  };
}
