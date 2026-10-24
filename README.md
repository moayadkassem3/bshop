# bshop — salon booking platform

Appointment booking for barbershops and salons in Istanbul, sold to shops as a monthly subscription. The product plan lives in [`docs/salon-app-handoff.md`](docs/salon-app-handoff.md); Section 12 tracks build status.

## Repository layout

| Path | What it is |
| --- | --- |
| `apps/api` | Backend: Node.js + TypeScript (Fastify) and PostgreSQL. Booking rules, timers, and the outgoing SMS/push queue. |
| `apps/alert-test` | Milestone 0: an Android test app for the new-appointment alert (Expo). |
| `docs/` | Product handoff. |

## Backend

Requires Node.js 22 and PostgreSQL 16.

```bash
npm install
createdb bshop                      # once
npm run seed --workspace apps/api   # migrations + a platform admin (+905000000000)
npm run dev --workspace apps/api    # http://localhost:3000
npm test                            # needs postgres://postgres:postgres@localhost:5432
```

Settings come from environment variables: `DATABASE_URL`, `PORT`, `PUBLIC_WEB_URL`, `OTP_SECRET`, `TICK_SECONDS`. Until real providers are connected, SMS codes and staff alerts are printed to the server log.

## Alert test app

Every push that changes `apps/alert-test` builds an Android APK in GitHub Actions and publishes it under **Releases** as a pre-release (`alert-test-N`). Open the release on an Android phone, download `randevu-alarm-testi.apk`, and allow installing from that source.
