# Salon Randevu — notes for future work

Turkish salon booking SaaS: `apps/api` (Fastify, PostgreSQL), `apps/web` (Next.js), and
`apps/mobile` — the native Android/iOS app (Expo SDK 54, Expo Router, React Native). The full
product record is `docs/salon-app-handoff.md`; read it before changing a workflow.

**Before every build, read `docs/agreed-rules.md`** — every rule the founder agreed, as it stands
now, with a checklist (both platforms, every role, store rule, men see only men's haircut photos,
APK link in Turkish time). Update it in the same commit when a rule changes.

## Native app (`apps/mobile`) — founder decision, 3 November 2026

Fully native screens (not a WebView of the website), for a stable, smooth experience. It talks to
the same backend as the website (`extra.apiUrl` in `app.json`, the website's `/api`). Built in
phases: 1 foundation (sign-in, Profil, Salonum, Randevular, Geçmiş, Keşfet list, salon page,
Favoriler, Hesabı sil); 2 booking, favourites, ratings; 3 alarm and push (reuse the tested
`apps/alert-test` full-screen alert module; needs a Firebase project); 4 business tools (map,
Çalışma saatleri, Saat kapat, photos, QR, statistics, read-only Aboneliğim); 5 store submission.

- Expo docs (docs.expo.dev) are blocked from the cloud sessions: read the installed packages'
  type definitions instead, and take versions from `node_modules/expo/bundledNativeModules.json`.
- Check JS with `npx tsc --noEmit` and `EXPO_OFFLINE=1 npx expo export --platform android`;
  `npx expo prebuild --platform android --no-install` checks the native config. The Android SDK
  cannot be downloaded here: `.github/workflows/android-app.yml` builds the APK on every push and
  publishes it as a GitHub pre-release.
- Same Turkish wording, colours (`src/lib/theme.ts`) and rules as the website; keep them in step.
- The package name `com.salonrandevu.app` is a placeholder until the brand name is chosen; it
  cannot change after the first Play Store upload.

## Store apps (iOS and Android) never sell — founder decision, 3 November 2026

To avoid Apple's and Google's 15–30% fee, salons pay **only on the website**; the native app uses
the account they paid for there. The native app simply has no selling screens: never add a
subscription price, plan price, buy button or payment link to `apps/mobile` (a salon's own
service prices are fine).

Rules for anything shown inside the apps (Apple 3.1.3(f), Google Play payments policy):

- No buy or subscribe buttons ("Aboneliği başlat", "Kartla öde", plan changes, cancelling).
- No prices, plan prices, payment amounts or "Teklif al" links.
- No "subscribe / pay on our website" wording or links. State facts only
  ("Ücretsiz denemenizin bitmesine 1 gün kaldı.", "Salonunuz müşterilere görünmüyor.").
- Read-only status is fine: plan name, staff count, trial days left, period end, history
  without amounts (Aboneliğim, `/abonelik`).

How it is built:

- Native app: no selling UI at all (see above).
- Website: `apps/web/src/lib/store.ts` `useCanSell()` hides prices and buy links if the website is
  ever shown inside a native shell (e.g. a WebView screen); preview with `?magaza=1`.
- Owners learn where to pay outside the app: SMS reminders from the server
  (`apps/api/src/services/subscriptionReminders.ts`: trial 3 days / 1 day / ended; paid period
  3 days before / lapsed / hidden), each linking to `PUBLIC_WEB_URL/abonelik`.
- Treat Android the same as iOS: one behaviour for both apps.

Before submitting to the stores: check every native screen against the rules above.

## Payments

- Now: no company or payment gate. Our team activates subscriptions in the admin panel
  (`/yonetim` → salon → "Aboneliği etkinleştir", with or without a recorded payment).
  Prices are fixed (`apps/api/src/domain/plans.ts`); the panel shows the listed amount.
- Later (once a company exists): iyzico subscriptions on the website (card stored by iyzico,
  3D Secure on the first payment), webhooks recording payments, automatic e-Arşiv invoices
  (e.g. Paraşüt). Late and hidden states already exist (7-day grace).

## Working conventions

- UI text is Turkish; code, comments and docs are English.
- Record each change as a row in Section 15 of `docs/salon-app-handoff.md`, and update
  `docs/agreed-rules.md` when a rule changes.
- Tests: `apps/api` with vitest (needs PostgreSQL); typecheck both apps with `npx tsc --noEmit -p .`.
