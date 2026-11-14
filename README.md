# bshop — salon booking platform

Appointment booking for kuaför salons across Türkiye, sold to shops as a monthly subscription. The product plan lives in [`docs/salon-app-handoff.md`](docs/salon-app-handoff.md); Section 12 tracks build status and Sections 13–14 the latest decisions.

## Repository layout

| Path | What it is |
| --- | --- |
| `apps/api` | Backend: Node.js + TypeScript (Fastify) and PostgreSQL. Booking rules, timers, and the outgoing SMS/push queue. |
| `apps/web` | The app on the web (Next.js): Keşfet map, Randevular, Favoriler, Profil (customer or business sign-in), shop profile pages, booking, the business page with prices, shop registration (`/isletme-kaydi`), and the legal texts (`/sozlesmeler`, drafts in `content/legal/`). |
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

Settings come from environment variables: `DATABASE_URL`, `PORT`, `PUBLIC_WEB_URL`, `OTP_SECRET`, `TICK_SECONDS`, `UPLOADS_DIR` (shop photos, default `uploads/`). Until real providers are connected, SMS codes and staff alerts are printed to the server log.

## Customer website

```bash
npm run seed:demo --workspace apps/api   # two demo shops in Kadıköy (demo-berber, demo-kuafor-moda)
npm run dev --workspace apps/api         # backend on :3000
npm run dev --workspace apps/web         # website on http://localhost:3001
```

Open `http://localhost:3001` for the Keşfet map (it opens on Kadıköy until you share your location) or `http://localhost:3001/demo-berber` for a shop's profile page; booking is at `/<shop>/randevu`, and a staff member's personal link is `/<shop>/randevu?personel=<staff id>`. The website forwards `/api/*` to the backend (`API_URL`, default `http://localhost:3000`). SMS codes appear in the backend log. To register a new shop, open `/isletme-kaydi`; it stays hidden until a platform admin approves it (`POST /admin/shops/<id>/review`), which starts the 7-day trial. Demo photos are generated placeholders marked “Örnek fotoğraf”. The map uses MapLibre with OpenFreeMap tiles; `npm run dev`/`build` copy MapLibre's worker files into `public/maplibre/` first.

Website settings: `NEXT_PUBLIC_BRAND_NAME` (working name “Salon Randevu” until the product name is chosen) and `NEXT_PUBLIC_SALES_EMAIL` (where shops with more than 10 staff ask for a quote).

## Test deployment (Render)

`render.yaml` describes a free test deployment in Frankfurt: one web service that runs the website and backend together (`scripts/render-start.sh`), and a free PostgreSQL database. In the Render dashboard choose **New → Blueprint**, connect this repository, pick the branch named in `render.yaml`, and apply. The first deploy takes a few minutes; the link is shown on the service page (`https://<name>.onrender.com`).

It runs with `DEMO_MODE=true`: sign-in codes are shown on screen because no SMS provider is connected, and newly registered salons are approved at once. Platform admins never get an on-screen code. Photos are kept in the database (`PHOTO_STORAGE=database`) because the free service's disk is wiped on restart. Free services sleep after 15 minutes without visitors (the next visit takes about a minute), and Render's free database expires after 30 days. Do not use it for real customers.

## Alert test app

Every push that changes `apps/alert-test` builds an Android APK in GitHub Actions and publishes it under **Releases** as a pre-release (`alert-test-N`). Open the release on an Android phone, download `randevu-alarm-testi.apk`, and allow installing from that source.
