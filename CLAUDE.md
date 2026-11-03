# Salon Randevu — notes for future work

Turkish salon booking SaaS: `apps/api` (Fastify, PostgreSQL), `apps/web` (Next.js). The full
product record is `docs/salon-app-handoff.md`; read it before changing a workflow.

## Store apps (iOS and Android) never sell — founder decision, 3 November 2026

The native apps will wrap the website (Capacitor). To avoid Apple's and Google's 15–30% fee,
salons pay **only on the website**; the apps use the account they paid for there.

Rules for anything shown inside the apps (Apple 3.1.3(f), Google Play payments policy):

- No buy or subscribe buttons ("Aboneliği başlat", "Kartla öde", plan changes, cancelling).
- No prices, plan prices, payment amounts or "Teklif al" links.
- No "subscribe / pay on our website" wording or links. State facts only
  ("Ücretsiz denemenizin bitmesine 1 gün kaldı.", "Salonunuz müşterilere görünmüyor.").
- Read-only status is fine: plan name, staff count, trial days left, period end, history
  without amounts (Aboneliğim, `/abonelik`).

How it is built:

- `apps/web/src/lib/store.ts`: `useCanSell()` is `true` on the website and `false` in the apps
  (Capacitor's `isNativePlatform()`); `null` until known, so selling UI never flashes.
  **Every new price, buy button or payment link must be rendered only when `useCanSell() === true`.**
  Preview the app behaviour on the website with `?magaza=1` (`?magaza=0` ends it).
- Owners learn where to pay outside the app: SMS reminders from the server
  (`apps/api/src/services/subscriptionReminders.ts`: trial 3 days / 1 day / ended; paid period
  3 days before / lapsed / hidden), each linking to `PUBLIC_WEB_URL/abonelik`.
- Treat Android the same as iOS: one behaviour for both apps.

When the apps are built: the Capacitor shell must report `isNativePlatform()`; check every
screen with `?magaza=1` before submitting to the stores.

## Payments

- Now: no company or payment gate. Our team activates subscriptions in the admin panel
  (`/yonetim` → salon → "Aboneliği etkinleştir", with or without a recorded payment).
  Prices are fixed (`apps/api/src/domain/plans.ts`); the panel shows the listed amount.
- Later (once a company exists): iyzico subscriptions on the website (card stored by iyzico,
  3D Secure on the first payment), webhooks recording payments, automatic e-Arşiv invoices
  (e.g. Paraşüt). Late and hidden states already exist (7-day grace).

## Working conventions

- UI text is Turkish; code, comments and docs are English.
- Record each change as a row in Section 15 of `docs/salon-app-handoff.md`.
- Tests: `apps/api` with vitest (needs PostgreSQL); typecheck both apps with `npx tsc --noEmit -p .`.
