import type { Clock } from './clock.js';
import type { Config } from './config.js';
import type { Db } from './db.js';
import type { PushProvider, SmsProvider } from './notifications.js';

export type Deps = {
  db: Db;
  clock: Clock;
  sms: SmsProvider;
  push: PushProvider;
  config: Config;
};
