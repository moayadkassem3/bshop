export type Config = {
  databaseUrl: string;
  port: number;
  publicWebUrl: string;
  otpSecret: string;
  sessionDays: number;
  tickSeconds: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    databaseUrl: env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/bshop',
    port: Number(env.PORT ?? 3000),
    publicWebUrl: env.PUBLIC_WEB_URL ?? 'http://localhost:3001',
    otpSecret: env.OTP_SECRET ?? 'dev-only-otp-secret',
    sessionDays: Number(env.SESSION_DAYS ?? 90),
    tickSeconds: Number(env.TICK_SECONDS ?? 5),
  };
}
