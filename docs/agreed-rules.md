# Agreed rules — read before every build

Every rule the founder has agreed, in one place, as it stands now. The full history (who asked,
when, how it is built) is Section 15 of `docs/salon-app-handoff.md`; when the two disagree, the
newer decision wins and this file is corrected.

**Keep it current:** when the founder changes or adds a rule, update this file in the same commit
as the code.

## 0. Before every build: checklist

Go through this list for every change before committing:

1. **Both platforms.** Every change goes to the website *and* the app unless the founder says
   "only on the website" or "only in the app". Check both.
2. **Every role.** Look at the screen as a **customer** (man, woman, signed out), as an **owner /
   Ortak**, and as **staff**. Most regressions so far came from changing one role's screen and
   forgetting another's (see section 12).
3. **Fix forward.** When something looks wrong, never roll back to an old version: fix what broke
   and keep everything agreed since.
4. **Store rule** (section 2): no price, plan price, buy button, payment link or "pay on the
   website" wording in the app.
5. **Men customers** never see women's haircut photos (section 5.3).
6. **Turkish wording** in the interface, the same words on the website and in the app.
7. **Checks:** `npx tsc --noEmit -p .` in each app; API tests (`npx vitest run` in `apps/api`); the
   app's Android export; the website's `npx next build`; look at the changed screens in a browser
   (website, and the app's browser preview), in light and dark.
8. **Handoff row** in Section 15 of `docs/salon-app-handoff.md`, and this file if a rule changed.
9. **After pushing app changes:** the APK builds on GitHub (`android-app-N` pre-release, about 15
   minutes). Check the release and give the founder the APK link with the time in **Turkish time
   (UTC+3)**.
10. **Say what was not checked.** If a screen was not seen running (only type-checked), say so.

## 1. How we work

- Interface text is Turkish; code, comments and docs are English.
- Secrets never go in chat or in the repository. They go only in the Render dashboard:
  `FCM_SERVICE_ACCOUNT_JSON`, `PAYMENT_ACCOUNT_HOLDER`, `PAYMENT_BANK`, `PAYMENT_IBAN`,
  `APP_ANDROID_VERSION`, `APP_IOS_VERSION`, `APP_IOS_URL`, `ADMIN_PHONES`.
- No outside address or geocoding service. District points come from our own data file.
- No stock images or other people's artwork: draw our own (e.g. the header texture).
- Temporary test files are never committed: the app's browser-preview harness (`metro.config.js`,
  `app.config.js`, `tmp-web-stub/`, `react-native-web`, the secure-store shim) and
  `apps/web/AGENTS.md` (made by `next dev`).
- Test site: Render deploys the working branch (`salon-randevu-test`). The app's package name
  `com.salonrandevu.app` is a placeholder until the brand name is chosen; it cannot change after
  the first Play Store upload.

## 2. Store apps never sell; salons pay on the website

- To avoid Apple's and Google's 15–30% fee, salons pay **only on the website**; the app uses the
  account they paid for there (Apple 3.1.3(f), Google Play payments policy).
- **In the app, never:** a subscription or plan price, a payment amount, a buy / subscribe / pay
  button, plan changes, cancelling, "Teklif al", or any "pay on our website" wording or link.
  A salon's own **service** prices are fine.
- **Allowed in the app:** read-only facts: plan name ("3 Personel"), staff count, trial days left,
  period end, history without amounts, "Salonunuz müşterilere görünmüyor."
- The website hides prices and buy links when shown inside a store app (`useCanSell()`,
  preview with `?magaza=1`).
- Android behaves exactly like iOS.
- Owners learn where to pay by **SMS** from the server (trial 3 days / 1 day / ended; paid period
  3 days before / lapsed / hidden), each linking to `/abonelik/odeme` on the website.
- **Prices** (KDV included): 1 staff ₺500, 2 ₺800, 3 ₺1.000, up to 5 ₺1.300, up to 10 ₺1.900;
  more than 10: quote ("Teklif al", website only). Counted by **bookable** staff; an owner or Ortak
  counts only when they take appointments. **Free trial 7 days**, starting at registration (a salon
  is live at once; our team checks afterwards). 7-day grace after a lapsed period.
- **Payment page** (`/abonelik/odeme`, website only): 1 / 3 / 6 / 12 months. Methods: **EFT /
  Havale** (works), **iyzico** and **Banka kartı** greyed out ("Yakında"). The owner writes **their
  phone number in the transfer's Açıklama** and taps "Ödemeyi yaptım"; our team finds the transfer
  and confirms in Yönetim → Talepler ("Ödeme geldi" / "Bulunamadı"); the owner gets an SMS either
  way. Without the three `PAYMENT_*` values the page offers "Aboneliği başlat" instead.
- **Payment-request SMS:** "{Salon}: {paket} aboneliğinizin aylık ücreti ₺X. EFT/Havale ile ödemek
  için: …/abonelik/odeme", from Yönetim → salon, at most once a day per salon.
- Our team can also activate a subscription by hand in `/yonetim` (with or without a recorded
  payment). Later: iyzico on the website, automatic e-Arşiv invoices.
- Aboneliğim → Geçmiş (website): "Ödemesiz etkinleştirildi · {tarih} tarihine kadar".

## 3. Accounts, sign-in and modes

- **One sign-in** for everyone: phone number, then the SMS code. No "Müşteriyim / İşletmeyim"
  choice screen. A number that works at a salon goes to business mode (or customer mode if that
  device used customer mode last); Profil's switch changes mode without a new code.
- "İşletmeyim · Salonumu kaydetmek istiyorum" under sign-in leads new salons to registration.
- Right after sign-in, Profil must already know whether the account owns a salon: an owner never
  sees "İşletmenizi kaydedin" (sign-in and mode switch return `owns_shop` / `has_business`).
- New customers give name, surname, **gender** (Erkek / Kadın) and accept the user agreement once.
- **Gender cannot be changed after sign-up.** Profili düzenle shows the two choices **greyed out**
  with "Cinsiyet kayıttan sonra değiştirilemez." (an account without a gender can set it once).
- Account deletion: a quiet grey "Hesabı sil" link under Çıkış yap.
- **Update pop-up (app):** a large "Yeni sürüm hazır" pop-up with Güncelle / Daha sonra when the
  store has a newer version. For each store release: raise `version` in `app.json`, publish, then
  set `APP_ANDROID_VERSION` / `APP_IOS_VERSION` (and `APP_IOS_URL`) in Render.

## 4. Roles and permissions

- **Owner** and **Ortak** (co-owner) have exactly the same permissions; only the label differs.
- **Staff**: their own appointments, hours and photo; they read the rest of the salon.
- **Invites:** adding someone sends an invite (push if they have the app, SMS otherwise); they join
  only when they accept in Profil → Ekip daveti. **One person works at one salon** ("already
  registered as staff with a salon" otherwise).
- What staff get (website and app):
  - Salonum's tools in the same separate cards as owners (section 6.1).
  - **QR kod**, Kesim fotoğrafı paylaş, Değerlendirmeler, Çalışma saatleri (their own week).
  - **İstatistiklerim:** the salon page's visits (kept for everyone) and their own appointments.
  - **Salon bilgileri:** Salon, Hizmetler, Personel to read; in Hizmetler they tick the services
    they give (saved at once). Prices and the service list stay with the owner.
  - **Abonelik** (read-only): the state and the package's name, with "Aboneliği salon sahibi ve
    ortaklar takip eder."; no price, payment button or history.
  - Their own profile photo in Profil → Profili düzenle (owners can set anyone's in Personel).

## 5. Customer side

### 5.1 Navigation and Keşfet

- Bottom bar: **Keşfet · Randevular · Favoriler · Profil** (business mode: **Salonum · Randevular
  · Geçmiş · Profil**).
- Keşfet is a full-screen map with the salon-type chips **Tümü · Erkek kuaförü · Kadın kuaförü**,
  opening on the customer's gender. It opens on Kadıköy until a location is shared, remembers the
  last location for 7 days and never asks for location on page load.
- The chosen pin shows the name, then "4,6 ★ · 350 m" (rating once the salon has enough).
- **Men** (customer and business mode, including Haritada gör): "Kadın kuaförü" is **greyed out
  and cannot be tapped**.
- **Tapping the search bar** opens the search screen: Popüler kesimler for the customer's gender,
  Favorilerim cards, nearby salons as cards; while typing, results nearest first, then matches
  elsewhere in Türkiye.

### 5.2 Salon page and booking

- Order: salon info, then **Hizmetler ve fiyatlar** right after it, photos, Çalışmalarımız, hours,
  Personel (with staff photos), Değerlendirmeler. Ara / Aç are real buttons.
- Photos open as a centred card with neighbours peeking in, with one short, even fade (no bounce).
- Booking: Hizmet → Personel → Saat → Onay; "Başka saat öner" lets the salon offer another time.
- Randevularım: Yaklaşan and Geçmiş (no Randevular / Talepler split for customers).

### 5.3 Popüler kesimler and haircut photos

- Shown on Favoriler, on the search screen, at `/kesimler`, and as Çalışmalarımız on salon pages.
- They follow the customer's gender.
- **Men never see women's haircut photos**, in customer *and* business mode: no Tümü / Kadın
  choice on Popüler kesimler, only men's styles in the strips, and women's photos hidden on a
  unisex salon's page (the section goes when none is left). It follows the account's gender, so an
  account without a gender (e.g. an owner who registered a salon) is not limited until it sets one
  in Profil → Profili düzenle. Signed-out visitors and women are not limited.
- Sharing a cut: pick a style for the salon's type, or **"Diğer (kendi adınızı yazın)"** with the
  salon's own name for the cut (up to 40 letters).

### 5.4 Ratings

- Stars only (1–5), only the salon is rated, from a completed visit; changeable for 14 days.
- The average shows from 3 customers. The salon may answer each rating once, in public.

## 6. Business side

### 6.1 Salonum

At the top, one card for today (founder's design, 14 November 2026): "Günaydın / İyi günler /
İyi akşamlar / İyi geceler, {ad}" by the hour in Türkiye, "Bugünün planı hazır." (or "Bugün için
randevu yok."), two tiles with icons ("N Randevu" today, "N Bekleyen talep"), an amber "N yeni
randevu talebi · İncele" bar while requests wait, and "Sıradaki randevu · Tümünü gör" with the next
appointment as a large card (time range, customer, services · length, status, staff, price).

Below it, four separate cards, the same for owners, Ortak and staff:

1. Haritada gör · QR kod · Kesim fotoğrafı paylaş
2. İstatistikler (staff: İstatistiklerim) · Değerlendirmeler
3. Çalışma saatleri · Salon bilgileri
4. Aboneliğim (staff: Abonelik, read-only)

### 6.2 Randevular

- Talepler and Takvim, switched by tapping or swiping sideways.
- A waiting request has a compact "Müşteri geldi mi? [Gelmedi] [Geldi]" row once it has started.
- **Takvim** (founder's design, 14 November 2026):
  - The month with arrows (a week at a time).
  - A row of day boxes (weekday and date, a dot on days with appointments) that opens on today,
    with one day before it at the left, so **the coming days always show**; it scrolls sideways.
    **Tapping a day that is showing does not move the row**: on the 14th (13–18 showing), tapping
    15, 16 or 17 keeps it still; tapping 18, the last one showing, slides it (the chosen day goes
    second from the left). Also for the first day showing, and for a day out of view (arrows,
    month calendar).
  - The **month calendar slides down** from the handle under the row (tap or drag down; tapping
    the month name works too), with each day's number of appointments.
  - Staff chips start with "Tüm ekip".
  - **"Saat kapat" is a large dashed button at the bottom** of the day.
  - The month view and Saat kapat **close when the user goes to Talepler or another screen**.
- **Geçmiş** tab: past appointments and every cancellation, with a red count of new cancellations.

### 6.3 Salon bilgileri and settings

- **Salon fotoğrafı** (owners, Salon tab): the salon's profile photo, a square shown wherever the
  salon appears small (lists, the map's Salonum card, Favoriler, search). Until one is set, the
  first gallery photo stands in, then the initial. Kept apart from the gallery (Fotoğraflar).

- Tabs Salon · Hizmetler · Personel. The save bar appears only when something changed; the "saved"
  message clears itself.
- Registration: one topic per page; the pin must be placed by hand; no address search service.

## 7. Notifications and SMS

- **New appointment alarm:** full-screen, rings until answered, during the salon's working hours.
- **Outside working hours:** never an alarm, but an **ordinary notification** with the usual sound
  and banner (not silent). SMS go out as usual at any hour.
- **Announcements** (Yönetim → Bildirimler): to salons (by type), customers (by gender) or
  everyone; now, later, daily or on chosen weekdays, only 09:00–21:00 Istanbul time. Recipients are
  people who allowed notifications on their phone. **No Duyurular switch and no consent note** in
  the app: the phone's notification permission is enough.
- **Sending in groups** of 500, at most 2,000 waiting, appointment messages always first.

## 8. Look and feel

- Colours: brand blue, dark colour **navy `#0b1120`**; icon and logo tile **white scissors on
  `#192C60`** (app icon, website icon, sign-in logo tile, update pop-up).
- Theme: app follows the phone (Profil → Görünüm: Otomatik / Açık / Koyu); website default Açık.
- Dark headers carry a faint line drawing of salon tools (our own drawing; website
  `public/doku.svg`, app `lib/pattern.ts`, kept in step).
- **Dialogs:** the app's own (`confirm`, `chooseAction`) with a light blur, a little dimming, a
  smooth open and close, and a very soft shadow. Never `Alert.alert`.
- Icons: the website and the app use the same drawings (`components/Icon.tsx` in both).
- The keyboard never covers the field being typed in (app `useKeyboardRoom`, website
  `KeyboardGuard`).
- Disabled primary buttons are greyed out, not just faded.
- Motion: short and calm (120–240 ms), off with the phone's "reduce motion".
- Wording: "Personel" (not Usta), "kuaför" / "erkek kuaförü" (not berber).

## 9. Admin (`/yonetim`)

- For our team: analytics, subscriptions and payments, spam checks; no approval before going live.
- Admins are the numbers in `ADMIN_PHONES`.
- Tabs include Özet, Salonlar, Talepler (payment notices, quote and subscription requests),
  Değerlendirmeler and Bildirimler.

## 10. Privacy and security

- Customer phone numbers are visible to the salon's owner and staff only.
- Sign-in codes only to Turkish mobile numbers; limits per number and platform-wide.
- Photos are re-encoded with location data removed.
- Statistics store daily counts only, with no visitor data.

## 11. Open, not decided or not done

- Product name (the build says "Salon Randevu", `NEXT_PUBLIC_BRAND_NAME`), and so the final
  package name.
- Lawyer review of the six agreement drafts before launch.
- iOS app (needs an Apple developer account and a Mac build service).
- Yearly plan; how often prices follow inflation; the sales e-mail (`NEXT_PUBLIC_SALES_EMAIL`).
- Booking: the time step opens on today even when today is full (not yet asked for).
- A longer absence screen (izin, several days) for staff.

## 12. Mistakes not to repeat

- **14 November 2026:** staff's Salonum was left as one long card after Salon bilgileri was added
  for staff; then the staff subscription card was forgotten. Every Salonum change must be checked
  as owner *and* staff.
- When a rule is changed for one role or one platform, check the other role and the other platform
  before pushing.
