# Salon Booking Platform — Handoff & Planning Baseline

**Version:** 1.6  
**Baseline date:** 24 October 2026  
**Previous versions:** 1.5 (25 October 2026), 1.4, 1.3, 1.2 and 1.1 (24 October 2026), 1.0 (6 October 2026)  
**Status:** Build in progress. The founder authorized application code on 24 October 2026 (Section 12).  
**Working market:** All of Türkiye *(v1.4)*  
**Product name:** To be decided

This document is the reference point for continuing product design and handing the project to a designer or development team. It consolidates the founder's decisions from the planning conversations. It is a planning baseline, not a claim that every design or technical question has been resolved.

**How to use it:** Preserve the agreed requirements. Treat anything labelled proposed or open as a decision still to make. Record future changes in this document before changing dependent workflows. Do not reopen settled choices without a concrete reason.

**Status labels:**

- **Agreed** — a founder decision. Tables and statements without a label in Section 2 are agreed.
- **Proposed** — a recommendation recorded for design review; it needs the founder's confirmation before it becomes agreed.
- **Open** — not yet decided.

Rows and sections new or changed in version 1.1 are marked *(v1.1)*, in version 1.3 *(v1.3)*, in version 1.4 *(v1.4)*, in version 1.5 *(v1.5)*, and in version 1.6 *(v1.6)*; version 1.2 adds Section 12. The change record at the end summarises each version.

## 1. Product purpose

A customer wants to book an appointment, but the barber or stylist may be busy serving someone and cannot answer calls or messages. The platform lets customers see availability and request appointments directly, while giving shops control over their schedules.

The product also gives each participating shop a public profile page. Its two core benefits are easier appointment management and shop visibility. *(v1.3)* Map discovery is removed; customers reach a shop through its link or QR code, or by searching its name.

Customers are men's barbershops and women's salons across Türkiye *(v1.4)*; the plan started from İstanbul, and where the pilot runs is open. Initial shop acquisition will happen through face-to-face visits.

*(v1.1)* Customers use the product on the **web only**; there is no customer app to install. Staff and shop owners use **one native app on Android and iOS**. No delivery order between Android and iOS has been chosen.

## 2. Agreed product and commercial scope

| Area | Baseline decision |
| --- | --- |
| Customer identity | Phone number, first name, and surname; easy account creation. |
| Booking access *(v1.5)* | Shop link or QR code, search by shop name, district, or city, and the Keşfet map (v1.5 brings map discovery back; see Section 13). Contact matching stays removed. |
| Platforms *(v1.5)* | One app for customers and businesses, built in this order: web, Android, iOS (Section 13). Replaces “customers on the web only” (v1.1). |
| Owner tools *(v1.5)* | In the same app, in business mode, unlocked by the owner role. |
| Sign-in *(v1.5)* | At sign-in the user chooses “Müşteriyim” or “İşletmeyim”. Business sign-in accepts only phones registered with a shop and gives owners owner tools and staff staff tools. A signed-in user can switch to business mode from Profil without a new SMS code. Replaces the separate owner and staff entrances (v1.2). |
| Shop structure | A shop can have multiple barbers or stylists. |
| Shop service list *(v1.1)* | Each shop keeps one service list, set up once at shop level rather than by each staff member. It starts from the platform catalog (Section 6). Shops can add their own services and rename services. |
| Staff services and durations *(v1.1)* | Each staff member selects which of the shop's services they perform and sets their own durations for them. |
| Subscription *(v1.5)* | Monthly, priced by the number of bookable staff: 1 staff ₺600, 2 staff ₺800, up to 5 staff ₺1,100, up to 10 staff ₺1,350. Every plan includes the booking page with QR code, SMS notifications, and map visibility. |
| Public visibility *(v1.5)* | Only reviewed, subscribed shops have a public profile, appear in search and on the map, and take bookings. |
| Salonlarım *(v1.4)* | The home page starts with the customer's own shops: favourites (a heart on the profile page and after booking) first, then shops they booked before, each with a direct “Randevu al”. Favourites work without signing in (kept on the phone) and move to the customer's account at sign-in. |
| Shop profile page *(v1.3)* | Every shop has a public profile: photos (up to 12, the first is the cover), shop type, district and city *(v1.4)*, today's hours and the weekly hours, address with “Yol tarifi” (directions in the phone's maps app), phone, WhatsApp, Instagram, a short description, the price list, and the staff, each with their own booking link. A fixed bar offers WhatsApp, Call, Directions, and “Randevu al”. |
| Shop activation *(v1.5)* | Shops register themselves through a multi-step form (Section 13); our team reviews each shop before it becomes public and bookable. |
| Owner permissions | Manage the shop, all staff, and all appointments. |
| Staff permissions *(v1.1)* | Manage their own appointments; select which shop services they perform and modify their durations. |
| Customer phone numbers *(v1.1)* | Visible to both the owner and staff. |
| Staff choice | Customer chooses a specific person or “Any available staff member.” |
| Multiple services | Allowed in one appointment, performed by one staff member; durations are added. |
| Booking for someone else *(v1.1)* | A customer can book an appointment for another person, such as a child (“Çocuk Tıraşı”). See 4.7. |
| Service pricing | Every bookable service displays a price; “starting from” pricing must be clearly identified. |
| Confirmation | Approval normally required; the shop can designate hours for immediate automatic confirmation. |
| Approval reminder *(v1.1)* | If a pending request is still unanswered 10 minutes after it arrives, a second alert asks the staff member to confirm or decline. The 15-minute automatic confirmation does not change. |
| Approval timeout | Automatically confirm after 15 minutes or at the appointment start, whichever comes first. |
| Customer result message *(v1.1)* | The customer receives an SMS with the final result: confirmed or declined. |
| Pending reservation | Hold the selected staff member's time while approval is pending. |
| Pending requests | One pending request per customer at the same shop. (A change for multi-person bookings is proposed in 4.7.) |
| Appointment alerts | Every new appointment triggers the special, prominent alert, including automatically confirmed appointments. Confirmed again in v1.1. |
| Cancellation cutoff | Determined by the shop owner; no platform-wide cutoff has been chosen. |
| Payment for services | At the shop. No customer deposit or online service payment in the first release. |
| Earliest appointment | As early as availability permits; no fixed minimum booking lead time. |
| Service location | At the shop only. Home visits have been removed. |

The shop's subscription payment process is separate from the customer's payment for salon services. Subscription prices, billing-seat definition, and billing policies remain open; the founder will set the monthly fee per staff member later. *(v1.1)* **iyzico** is the founder's preferred candidate for collecting subscriptions; it is to be confirmed during feasibility (Phase 3).

### 2.1 Proposed for confirmation *(v1.1)*

These recommendations came out of the v1.0 review. They are not agreed until the founder confirms them.

| Area | Proposal | Reason |
| --- | --- | --- |
| Service prices | The owner sets one price per service for the whole shop. Per-staff prices can be added later if shops ask for them. | Fastest setup, consistent with a single shop-level service list, and “Any available” never needs a price range. |
| Phone verification | Verify the phone with an SMS code at the final booking step, before the slot is held. Returning customers on the same device skip the code. | Ties each booking to a real phone; the main protection against fake bookings. |
| Booking limit | At most 2 future appointments (or booking groups, 4.7) per customer per shop. The owner can raise the limit. | With automatic confirmation and no deposit, one person could otherwise fill a barber's day. |
| No-show record | Track no-shows per customer per shop. The owner can block a customer, or require manual approval for them (no automatic confirmation). | Without deposits, this is the shop's main protection. |
| Late cancellation | Customers can still cancel after the cutoff; it is recorded as a late cancellation in their history. | With no fee, blocking cancellation only turns it into a no-show. |
| Automatic-confirmation hours | Based on the appointment start time, not the request time. Eligible slots show an “Anında onay” (instant confirmation) badge. | Predictable for the shop, and the customer can see it before booking. |
| SMS budget | Plan for about 3 texts per booking: verification code, result, reminder. Include the cost in subscription pricing. | Web-only customers cannot receive push notifications, so every customer message is an SMS. |
| Subscription sales | Sell the subscription face to face or through a web payment link, never inside the staff app. | Keeps the app clear of app-store in-app purchase rules (to verify in Phase 3). |
| Failed subscription payment | A 7-day grace period with reminders to the owner. Then the shop's profile goes offline and it stops taking new bookings; existing appointments are kept. | Predictable for shops; protects customers who already booked. |
| Staff removal | When a staff member is removed from a shop, their access to customer data ends immediately. | Staff can see customer phone numbers. |

## 3. People and permissions

- **Customer:** On the web, without installing an app: find a shop, view prices and availability, book for themselves or someone else, track the result, and cancel or request rescheduling under the shop's rules.
- **Shop owner:** Configure the shop, its service list (including custom and renamed services), prices, team, schedules, confirmation hours, and cancellation cutoff; manage all shop appointments. Uses the same native app as staff, with owner permissions.
- **Barber or stylist:** View and manage their own schedule and appointments, respond to requests, select which of the shop's services they perform, and set their durations. *(Proposed)* Mark their own absence (4.8).
- **Platform reviewer:** Review shop submissions before they become public and bookable. This is a required operational role; the full administration interface is not yet specified.

*(v1.1)* Both the owner and staff see customer phone numbers. Receptionist accounts and detailed permission exceptions have not been defined.

## 4. Main workflows

### 4.1 Shop onboarding

The shop provides its business details, location, staff, and schedules. *(v1.1)* It builds its service list once, starting from the platform catalog and adding its own services or renaming services as needed. The owner sets prices, cancellation rules, and any hours for immediate automatic confirmation. Each staff member marks which services they perform and their durations. Our team reviews the shop, and subscription requirements must be satisfied before public activation.

The exact order of review, subscription payment, and activation is open. The public activation condition is agreed: reviewed and subscribed.

*(Proposed)* Our team completes this setup together with the owner during the face-to-face visit, so the shop is ready to take bookings the same day it is activated.

### 4.2 Customer discovery

1. Open a shop's direct link or scan its QR code, or search by shop name or district on the home page.
2. Open the shop profile and view services, prices, staff, and appointment availability.
3. Continue into booking on the web.

*(v1.1)* **Contact matching is removed from the first release.** If it is reconsidered later, the recommended approach is to match on the customer's device against the public list of shop business numbers and never upload the customer's contacts.

*(v1.3)* **Shop profile page:** the link and QR code open the shop's profile (Section 2); “Randevu al” starts the booking. The map design is withdrawn with map discovery.

**Proposed *(v1.1)*:**

- Each staff member gets their own link and QR code to share (for example on Instagram or WhatsApp). A customer arriving through it starts with that staff member already chosen.
- Treat links shared by shops (Instagram bio, WhatsApp, Google Business Profile) and the QR code in the shop as the main booking channels.

### 4.3 Customer booking

1. Select services.
2. Choose a staff member or “Any available staff member.”
3. Choose a time that accommodates the complete service duration.
4. *(v1.1)* Choose who the appointment is for: “Kendim” (myself) or “Başka biri” (someone else). See 4.7.
5. Provide phone number, first name, and surname. *(Proposed)* Verify the phone with an SMS code here, not before browsing.
6. Review the service price, staff assignment, cancellation rule, and confirmation behavior. *(Proposed)* Also show “Ödeme salonda” (payment at the shop) and the shop address with a directions link.
7. Submit the booking. *(Proposed)* Re-check that the time is still free; if it was just taken, say so (“Bu saat az önce doldu”) and offer the nearest alternatives. Reserve the staff member and time.
8. Follow the confirmation workflow below.

One appointment cannot split services between different staff members in the first release. For “Any available staff member,” an eligible person must be assigned when reserving the slot; a policy is proposed in Section 5.

*(Proposed)* Customers can browse services, staff, and times without signing in. Screen-level proposals from the competitor review are in Appendix A.

### 4.4 Confirmation and timing

**During designated automatic-confirmation hours:** Confirm immediately and notify both sides. Send the prominent staff alert. The alert announces an existing confirmation; it does not create a second approval step. No reminder is sent.

**At other times:** Create a pending appointment, hold the slot, and alert the staff member. *(v1.1)* If there is still no response 10 minutes after the request, send a second alert (the reminder) with the same Confirm / Decline actions. The owner or assigned staff member can confirm or decline before the deadline.

**Approval deadline = the earlier of request time + 15 minutes and appointment start time.** *(Unchanged in v1.1.)*

If no response arrives by that deadline, confirm automatically and update both sides. A missed alert or reminder does not extend the deadline or cause the booking to expire.

| Example | Reminder | Result without a staff response |
| --- | --- | --- |
| Request at 14:00 for a 16:00 appointment | 14:10 | Automatically confirmed at 14:15. |
| Request at 14:00 for a 14:12 appointment | *(Proposed)* 14:06 | Automatically confirmed at 14:12. |
| Request at 14:00 for a 14:05 appointment | *(Proposed)* None | Automatically confirmed at 14:05. |
| Request during automatic-confirmation hours | None | Confirmed immediately. |

*(Proposed)* **Last-minute reminder rule:** when the deadline is the appointment start and comes before request + 15 minutes, send the reminder halfway through the remaining response window, and skip it if that window is under 6 minutes.

The customer must see whether the appointment is pending or confirmed and the precise automatic-confirmation deadline. *(v1.1)* The customer receives an SMS with the final result (confirmed or declined). No customer message is sent at the reminder. *(Proposed)* On-screen pending wording: “Salon onayı bekleniyor — 14:15'e kadar yanıt gelmezse otomatik onaylanır.”

Last-minute requests can remain pending until their start time; this is an intentional founder decision.

There is no fixed advance-booking requirement. Available start-time increments and treatment of a booking starting at the current instant remain open (proposals in Section 5); the timing rule must not create an appointment that stays pending past its start.

### 4.5 Appointment alerts

Every new appointment uses the special, prominent alert, regardless of its confirmation route. Desired features are a distinctive ringtone, a prominent presentation potentially using the full screen, and optional spoken appointment details. *(v1.1)* The founder confirmed keeping this for every booking, accepting that it may reach staff while they are serving a customer. *(v1.2)* For a pending request, the alert keeps ringing until the staff member answers (founder, after alert test 1).

- Pending request: Show the requested time, services, and Confirm / Decline actions.
- *(v1.1)* Reminder at 10 minutes: The same request and actions, presented again.
- Already confirmed booking: Announce the confirmed appointment and provide its details.
- Confirmation must update the same appointment; it must not create another booking.

*(v1.1)* Alerts are delivered to staff members' own phones through the native staff app. **Not pursued:** a dedicated always-on “shop tablet mode” at the counter, because it complicates selling and scaling the service.

Custom sound, full-screen presentation, speech, and background delivery must be evaluated on Android and iOS before exact behavior is promised. These are product intentions, not verified platform capabilities. Constraints to verify in Phase 3:

- Android 14 and later: Google Play restricts full-screen notification alerts to calling and alarm apps.
- iOS: no full-screen notifications for third-party apps; Critical Alerts need a special Apple permission that a booking app is unlikely to get. Custom notification sounds and Time-Sensitive notifications are available.
- Spoken details while the app is in the background are limited on both platforms.

Recipients, repeat-alert behavior beyond the 10-minute reminder, owner escalation, and alerts for appointments staff enter themselves are open. *(Proposed)* The reminder also goes to the owner. Any fallback must preserve appointment status and deadlines.

### 4.6 Daily operations and customer changes

Owners and staff see their schedules, add appointments manually, record walk-ins, and block unavailable time. Customers receive confirmation updates and reminders by SMS.

Owners set the cancellation cutoff. Reminder timing, cancellation after the cutoff, rescheduling rules, staff-initiated cancellations, delays, and no-shows still need explicit workflows. No penalty or cancellation fee has been agreed.

**Proposed *(v1.1)*:**

- Customers can cancel after the cutoff; it is recorded as a late cancellation (2.1).
- Changes caused by the shop (staff absence, shop-initiated cancellation) never count against the customer's cutoff or no-show record.
- A decline after automatic confirmation follows the cancellation workflow, sends the customer an SMS immediately, and offers the nearest free times.
- Appointments entered by staff (phone bookings, walk-ins) create a customer record from the name and phone number, which is linked when that customer later books on the web.
- Shop-wide closures and special hours (for example the Bayram holidays) can be set by the owner. Open: how existing bookings on a newly closed day are handled; the staff-absence flow in 4.8 is the suggested model.

### 4.7 Booking for someone else *(v1.1)*

**Agreed:** A customer can book an appointment for another person, such as a child.

**Proposed details:**

- The last booking step asks “Randevu kimin için?” (who is the appointment for?) with “Kendim” or “Başka biri”, plus a name field for the other person.
- The booker stays the contact: verification, result, and reminder texts go to the booker's phone.
- The staff app shows it as, for example, “Emir (çocuk) — Mehmet Yılmaz adına.”
- “Bir kişi daha ekle” (add another person) lets a parent book for themselves and a child together. It offers back-to-back times with the same staff member, or the same time with another staff member. Each person becomes a separate appointment, linked in one booking group.
- Up to 3 people in one booking group.
- The pending-request rule becomes: one pending **booking group** per customer per shop.

### 4.8 Unexpected staff absence *(v1.1, proposed)*

1. **Marking it:** Staff can mark their own absence; the owner can mark it for anyone. Options: “Bugün yokum” (out today) or a date and time range. New bookings in that period stop immediately.
2. **What the app shows:** Every pending and confirmed appointment affected, each with an automatic suggestion of another staff member who performs the same services and is free at the same time.
3. **What the owner does:** Reviews the suggestions in one place and taps “Uygula” (apply). Pending requests are reassigned or declined in the same step.
4. **What the customer receives by SMS:**
   - “Any available” bookings that are reassigned: an informational text with the new staff member's name; the time stays the same.
   - Bookings where the customer chose the absent staff member: a link with three choices — keep the time with the new staff member, pick a new time with the original staff member, or cancel. If the customer does not respond, the reassigned booking stands.
   - Bookings that cannot be reassigned: cancelled, with a link to rebook.
5. **Cutoff and record:** The shop's cancellation cutoff does not apply to these changes. The customer can cancel freely, and nothing is added to their no-show or late-cancellation record.
6. **Owner alert:** When staff mark their own absence and it affects existing appointments, the owner is alerted.

## 5. Scheduling rules and safeguards

**Agreed:** Services have default durations that staff can modify. *(v1.1)* Each staff member selects which of the shop's services they perform and sets their own durations. Multiple selected services occupy their combined duration. Pending and confirmed appointments reserve time. Staff availability accounts for working hours, breaks, and blocked periods.

**Proposed implementation requirements for design review:**

- Use a staff-specific duration when configured; otherwise use the shop's default for the service.
- A combined catalog service uses its own listed duration; do not expand it into additional component services.
- Only offer a time if the full booking fits and the staff member performs all selected services.
- Assign and reserve a specific staff member for “Any available” bookings, so availability remains reliable.
- Changing a service duration affects future bookings; existing appointments retain their booked duration unless explicitly edited.
- Check an individual appointment's duration edit against other reservations. Notify the customer of changes affecting their start time through the agreed rescheduling flow.
- Prevent simultaneous requests from reserving the same staff member for overlapping times.
- Handle staff responses and automatic confirmation together so there is one final outcome, including when they arrive at the deadline.
- Release reserved time when a request is declined or an appointment is cancelled. A decline after automatic confirmation must follow the cancellation workflow.

**Proposed *(v1.1)*:**

- **“Any available” assignment:** consider only staff who perform all selected services and are free for the whole duration; pick the one with the lightest load that day. The owner can reassign while the request is pending.
- **Start times:** offer starts on 15-minute marks plus the exact minute the staff member's previous appointment ends, so no dead gaps are left. Hide past times.
- **Minimum lead time:** an optional per-shop setting, default 0. The platform still has no fixed minimum. Starts are offered from “now + lead time”, rounded up to 5 minutes, so a slot never appears at an odd current minute.
- **Buffer:** an optional per-shop or per-staff gap after each appointment for cleanup, set explicitly rather than hidden in the time grid.
- **Booking horizon:** open (how far ahead customers can book).

Use Türkiye time (one time zone nationwide, Europe/Istanbul) in customer and shop displays. Türkiye has used UTC+3 all year with no daylight saving time since 2016; store times in UTC regardless.

### 5.1 Draft appointment states *(v1.1, proposed)*

| State | Entered when | Can move to |
| --- | --- | --- |
| Pending | A customer submits outside automatic-confirmation hours. | Confirmed, Declined, Cancelled |
| Confirmed | Staff or owner confirms; the deadline passes; booked during automatic-confirmation hours; or entered by staff. Record which route. | Completed, No-show, Cancelled |
| Declined | Staff or owner declines before the deadline. | — (final) |
| Cancelled | Customer withdraws or cancels (before or after cutoff), shop cancels, or staff absence cannot be covered. Record the reason. | — (final) |
| Completed | The appointment took place. | — (final) |
| No-show | The customer did not arrive. | — (final) |

Reassignment to another staff member changes the appointment; it is not a separate state. Open: whether rescheduling edits the same appointment or cancels it and creates a new one. *(Proposed)* Edit the same appointment, keep its history, and re-check availability.

## 6. Platform service catalog — 45 services

*(v1.1)* This list is now the **starting template** for each shop's own service list. A shop sets its list up once at shop level, can add its own services, and can rename services. Each staff member then selects which of the shop's services they perform and sets their durations.

Names and durations below are supplied by the founder and preserved as given. They are scheduling defaults, not a universal statement about how long every shop takes. More services can be added to the platform template later.

Related services with different durations must not be silently merged or normalized. For example, “Saç-Sakal Kesimi” is 60 minutes while “Saç-Sakal Kesimi+Yıkama” is 45 minutes.

| Service | Default duration |
| --- | --- |
| Saç Kesimi | 30 dk |
| Sakal Tıraşı | 20 dk |
| Saç-Sakal Kesimi | 60 dk |
| Saç Bakımı | 20 dk |
| Damat Tıraşı | 120 dk |
| Saç Düzleştirme | 30 dk |
| Keratin Yükleme | 15 dk |
| Keratin Düzleştirme | 30 dk |
| Saç Kesimi+Yıkama | 30 dk |
| Saç-Sakal Kesimi+Yıkama | 45 dk |
| Modern Saç Kesimi | 30 dk |
| Klasik Saç Kesimi | 30 dk |
| Sakal Tasarımı | 20 dk |
| Skin Fade | 30 dk |
| Anatomik Saç Kesimi | 30 dk |
| Saç Sakal Kesimi & Boya | 45 dk |
| Saç kesimi & Protein Yüklemesi | 45 dk |
| Saç Sakal kesimi & Protein Yüklemesi | 60 dk |
| Keratin Bakım | 60 dk |
| Fade Kesim | 30 dk |
| Cilt Bakımı | 45 dk |
| Cilt Botoksu | 30 dk |
| Saç Sakal & Buhar | 60 dk |
| Yanak Kulak Ağda | 15 dk |
| Kaş Tasarımı | 15 dk |
| Keratin Düzleştirme(Kısa Saç) | 30 dk |
| Pigmentaston-Renk Kırma | 20 dk |
| Yanak-Kulak-Burun | 20 dk |
| Sakal Boyama | 20 dk |
| Premium Saç Kesimi&Sakal | 60 dk |
| Buharlı Cilt Bakımı | 45 dk |
| Çocuk Tıraşı | 30 dk |
| Fön | 15 dk |
| Saç Yıkama+Fön | 15 dk |
| Saç Boyama | 20 dk |
| Saç Botoksu | 20 dk |
| Bıyık Boyama | 20 dk |
| Ense Kulak Temizleme | 10 dk |
| Saç Kesimi & Boya | 45 dk |
| Siyah Maske | 20 dk |
| Saç Kesimi & Buhar | 45 dk |
| Söz Tıraşı | 60 dk |
| Nişan Tıraşı | 60 dk |
| Saç Boyama(Tek Renk) | 30 dk |
| Keratin Yükleme(En Kısa Saç) | 30 dk |

**Removed:** Evde Hizmet Alımı. Home-visit bookings, customer service addresses, travel buffers, home-service areas, and travel charges are outside the first release.

### 6.1 Items to confirm with the founder *(v1.1)*

The list is preserved as given; these points should be confirmed, not silently corrected, before the template is loaded:

- “Keratin Yükleme” is 15 min, but “Keratin Yükleme(En Kısa Saç)” (shortest hair) is 30 min.
- “Saç Boyama” (20 min) is shorter than “Saç Boyama(Tek Renk)” (30 min).
- These variants have the same duration as the base service: Saç Kesimi and Saç Kesimi+Yıkama; Fön and Saç Yıkama+Fön; Keratin Düzleştirme and Keratin Düzleştirme(Kısa Saç).
- Choosing “Saç Kesimi” and “Sakal Tıraşı” separately totals 50 min; the “Saç-Sakal Kesimi” combination is 60 min.
- “Pigmentaston” is probably a typo for “Pigmentasyon”.
- Names mix `&`, `+`, and `-`, and capitalisation is inconsistent.
- 20 min for hair colouring and 30 min for keratin straightening are short for women's salons.

The first services and durations in this list match a men's barbershop's live listing on a competitor platform (Appendix A), so the template probably reflects one men's barbershop's setup.

**Proposed for women's salons:** add template services such as highlights (röfle), balayage, perms, manicure and pedicure, gel polish, lash and brow services, body waxing, and bridal hair and make-up. Support duration variants by hair length (short, medium, long) instead of a separate service for each. Decide whether processing time (the stylist serves someone else while colour sets) is supported; the recommendation is to exclude it explicitly from the first release. Tag services (or shops) by audience — women, men, unisex.

## 7. Proposed delivery plan

This is a sequence of deliverables, not a development schedule or technology commitment.

| Phase | Work | Completion condition |
| --- | --- | --- |
| 1. Finish system definition | Resolve the booking, cancellation, assignment, identity, and alert decisions listed below. Confirm the appointment states (5.1) and role permissions. | Founder has a coherent set of workflows, including exceptional cases. |
| 2. Design customer and shop experiences | Create screen flows and a clickable prototype for the customer web (discovery, booking, confirmation) and the staff/owner app (schedules, requests, alerts, absence, settings, service list), plus the reviewer flow. Prepare Turkish interface wording. | Validate the prototype with the founder and the first shops; document revisions. |
| 3. Validate feasibility and prepare engineering handoff | Evaluate alerts in the native app on Android and iOS (4.5), photo storage, subscription collection with iyzico, e-invoicing (e-arşiv / e-fatura), and SMS delivery. Review privacy and messaging requirements: KVKK (including VERBİS registration and data transfer abroad, which affects hosting choice), SMS sender-name registration, and whether İYS applies to appointment messages. Check app-store rules for a subscription sold outside the app. Define the data model and acceptance scenarios. | Select the technical approach and document platform limits and unresolved dependencies. Any experimental coding requires the founder's go-ahead to begin code work. |
| 4. Implement the agreed first release | Build customer web booking and shop profile pages, the staff/owner native app for Android and iOS, review/activation, subscription access, and SMS and in-app notifications. | Agreed acceptance scenarios pass on the customer web and both mobile platforms; any staged rollout is explicitly agreed. |
| 5. Run a pilot *(city open, v1.4)* | Onboard reviewed shops face-to-face, verify their service lists and schedules, and observe real booking and alert behavior. | Pilot findings are recorded and release-blocking issues are resolved. |

*(Proposed, v1.1)* Run a small alert prototype on Android and iOS before Phase 2, so the alert design is based on what the platforms allow. This needs the founder's go-ahead because it involves code.

**Proposed pilot measures:** Completed booking rate, staff response time, share confirmed after the reminder, share automatically confirmed by timeout, missed-alert reports, schedule conflicts, cancellations/no-shows, active shops, and *(v1.1)* booking source (shop link, staff link, QR code, search). Targets and pilot size remain open.

## 8. Decisions to close before implementation

**Closed in v1.1:** platforms (customer web only; native staff/owner app); owner tools location (same app); contact matching (removed); shop-level service list with custom and renamed services; staff select their services and durations; customer phone visibility (owner and staff); approval reminder at 10 minutes; customer SMS with the final result; booking for someone else (in principle); shop tablet mode (not pursued).

| Priority | Decision needed | Reason |
| --- | --- | --- |
| First | “Any available” assignment rule (proposal in Section 5) | Determines which staff member is reserved and alerted. |
| First | Automatic-confirmation hours: shop-wide or per staff; appointment start time or request time (proposal in 2.1) | Prevents inconsistent confirmation behavior. |
| First | Cancellation and rescheduling, including pending requests, after-cutoff changes, and shop-initiated changes (proposals in 2.1, 4.6, 4.8) | Determines when reservations are released or replaced and who is notified. |
| First | Duration editing for an individual appointment, and whether the owner can override staff durations | Staff service durations are agreed; per-appointment edits and owner control are not. |
| First | Alert recipients, owner escalation, and exact behavior on Android and iOS | Defines the central staff experience and realistic delivery expectations. |
| First | Phone verification, sign-in, and duplicate-account handling (proposal in 2.1) | Defines how an appointment is tied to the correct customer. |
| First | Who sets service prices (proposal in 2.1) | Needed for the service-list and booking screens. |
| First | Booking limit, no-show record, and customer blocking (proposals in 2.1) | Main protection against abuse without deposits. |
| Before pilot | Start-time increments, minimum lead time, buffer, booking horizon, delays, completion, and no-show states (proposals in Section 5 and 5.1) | Completes day-to-day scheduling. |
| Before pilot | Booking-for-someone-else details and staff-absence workflow (proposals in 4.7 and 4.8) | Common real-world cases. |
| Before pilot | Shop closures and special hours | Holidays affect existing bookings. |
| Before pilot | Reminder timing and customer preferences (channel is SMS) | Makes appointment communication concrete. |
| Before pilot | Subscription price, included staff, seat definition, payment provider (iyzico preferred), and failed-payment behavior (proposal in 2.1) | Makes shop access and charges predictable. |
| Before pilot | Shop review criteria, address and photo checks | Makes public profiles and activation consistent. |
| Before pilot | Catalog coverage for women's salons, items in 6.1, and “starting from” price presentation | Confirms that the template meets participating men's and women's salons' needs. |

A privacy and consent review is a future work item. This document does not assert that a particular notification or data-handling design has been legally or technically validated.

## 9. Proposed acceptance scenarios

Use these to review the design and, after implementation is authorized, verify the product:

1. A customer books from a shop link on the web without installing an app.
2. A shop with several staff members maintains separate, conflict-free schedules.
3. A pending request reserves the full service duration, and another customer cannot take overlapping time for that staff member.
4. A normal request receives a reminder alert at 10 minutes and automatically confirms at 15 minutes if unanswered; a last-minute request confirms at its start time.
5. Staff confirmation or decline before the deadline produces one consistent outcome; a decline releases the slot.
6. The customer receives an SMS with the final result (confirmed or declined).
7. Automatic-confirmation hours bypass pending approval and still trigger the prominent appointment alert.
8. “Any available” assigns an eligible staff member and respects their actual schedule and service duration.
9. Multiple services use their total duration; a combined catalog service uses its own duration.
10. Customers see the owner's cancellation rule and the applicable service price before submitting.
11. Reviewed, subscribed shops have a public profile with photos, hours, and contact details, and appear in search; others do not.
12. Staff can add walk-ins and block time without creating conflicting customer availability.
13. A shop starts from the 45-service template, adds a custom service, renames a service, and staff select their own services and durations. Home visits cannot be booked.
14. A customer books an appointment for someone else, and the staff app shows both names.
15. The owner and staff can both see the customer's phone number on an appointment.

Exact alert-delivery acceptance criteria must be added after platform feasibility checks. Reminder, cancellation, rescheduling, staff-absence, and billing scenarios must be completed once their rules are settled.

## 10. Scope boundaries and continuation instructions

**Explicitly outside the first release:** Home visits; online customer payments or deposits; appointments split between multiple staff members; *(v1.1)* contact matching; native customer apps.

**Not pursued:** *(v1.1)* A dedicated shop tablet mode for alerts.

**Not part of the agreed baseline unless added later:** Ratings and reviews, in-app chat, loyalty programs, advertising, retail checkout, and multi-branch management.

No product name, hosting provider, budget, or delivery date has been selected. The product-level platforms are agreed (customer web; native staff/owner app on Android and iOS), and the development technology is agreed (Section 12). No order between Android and iOS has been chosen. No Notion page or external project has been created for this plan.

**Next action:** Test the alert app on real phones (Section 12), then build the customer website (milestone 2). Proposals are built as adjustable defaults; confirm or adjust them as each screen is reviewed.

**Handoff instruction:** Read this document as the current planning baseline. Preserve the founder's decisions, particularly automatic confirmation at the earlier deadline with a reminder at 10 minutes, the special alert for every new appointment, a public profile page for every shop (no map discovery), web-only customers with a native staff/owner app, a shop-level service list that shops can extend and rename, owner-defined cancellation cutoffs, payment at the shop, and the removal of home visits and contact matching. Advance open items without presenting proposals as already agreed.

## 11. Risk register *(v1.1, proposed)*

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Fake or abusive bookings | A staff member's day is blocked by bookings that never arrive. | SMS verification, booking limit, no-show record, customer blocking (2.1). |
| Platform alert limits | The special alert cannot be as prominent as intended on Android or iOS. | Early alert prototype; design around custom sound and high-priority notifications (4.5). |
| Unanswered requests | Bookings auto-confirm while staff are unavailable. | 10-minute reminder; decline-after-confirmation path with alternatives (4.6). |
| Few shops at launch | Search finds little, so customers rarely discover new shops. | Lead with each shop's link and QR code; discovery is not the first release's main channel. |
| SMS costs | Each booking costs several texts. | Budget about 3 texts per booking in subscription pricing (2.1). |
| Catalog fit for women's salons | Women's salons cannot represent their services. | Shop-level custom services; women's template additions; length variants (6.1). |
| Failed subscription payments | Shops lose access unexpectedly, or keep access without paying. | Grace period with owner reminders; existing bookings kept (2.1). |

## Appendix A. Competitor booking flow review *(v1.1)*

Reviewed on 24 October 2026 from founder-supplied screenshots of the customer web booking flow at kuaforumyanimda.com (a men's barbershop with three staff). All items are **proposed** for Phase 2 design.

**Worth adopting:**

- A 4-step progress bar and a fixed bottom bar with a running total (for example “1 hizmet · 30 dk · ₺450”).
- Services listed per staff member, with search and a “Seçili” (selected) filter.
- An “İlk uygun saat” (first available time) shortcut.
- Times grouped into morning, afternoon, and evening, with a horizontal row of day chips.
- Recognising a returning customer by phone, with “Randevularım” (my appointments) always visible.

**Do better than the competitor:**

| Competitor behavior | Problem | Proposal |
| --- | --- | --- |
| No “any available staff” option | The customer must pick a person. | Keep “Fark etmez (ilk müsait)”. |
| Staff cards show service count and working hours | Does not help the customer choose. | Show a photo and the next free time (for example “Bugün 18:45”). |
| Fixed 45-minute steps for a 30-minute service | Wastes time, or hides a buffer. | Start-time rule and explicit buffer in Section 5. |
| A slot shifted to the current minute (“18:02” at 18:01) | Looks broken and gives no notice. | Minimum lead time and 5-minute rounding (Section 5). |
| Most of the day shown as greyed-out past slots | Free times sit at the bottom. | Hide past times; mark fully booked days on the day chips. |
| “Popüler” badge on every service | Carries no meaning. | Base it on real booking data, top 3 at most. |
| Manual “Yenile” (refresh) button | Times can be stale. | Re-check at submission with alternatives (4.3). |
| Summary labelled “Onayınız bekleniyor” | Easily confused with the shop's approval. | “Kontrol edin” before submitting; the pending wording in 4.4 after. |
| Summary omits cancellation rule, payment, and address | Customers are surprised later. | Step 6 in 4.3. |
| Women / men / unisex filter on staff | Mixes up who the service is for with who the staff member is. | Tag services or shops by audience (6.1). |
| Staff first, then services | Does not suit “any available”. | Keep services first; staff links skip the staff step (4.2). |
| Sign-in before the first step | Adds friction before the customer has seen anything. | Browse freely; verify at the final step (4.3). |

## Appendix B. Interface wording *(v1.1, proposed)*

| Concept | Turkish interface wording |
| --- | --- |
| Pending | Salon onayı bekleniyor |
| Confirmed | Onaylandı |
| Declined | Reddedildi |
| Cancelled | İptal edildi |
| Late cancellation | Geç iptal |
| Any available staff member | Fark etmez (ilk müsait) |
| Instant confirmation | Anında onay |
| First available time | İlk uygun saat |
| Who is the appointment for? | Randevu kimin için? |
| Myself / Someone else | Kendim / Başka biri |
| Add another person | Bir kişi daha ekle |
| Payment at the shop | Ödeme salonda |
| Out today | Bugün yokum |
| This time was just taken | Bu saat az önce doldu |

## 12. Build status *(v1.2)*

**Authorized:** The founder authorized application code on 24 October 2026, approved the technology below, and asked for the proposals in this document to be built as adjustable defaults rather than waiting on each decision.

**Business model reflected in the build:** one shared system sold to many shops on monthly subscriptions. Every shop's data is separated in the database and the API; review and subscription status decide whether a shop is visible and bookable; our team's back office creates, reviews, and activates shops.

**Technology (agreed):**

| Part | Technology |
| --- | --- |
| Backend | Node.js and TypeScript (Fastify), PostgreSQL. Reminders and automatic confirmations run in a worker inside the backend. |
| Customer website | Next.js (milestone 2). |
| Staff/owner app | React Native with Expo, one codebase for Android and iOS. |
| Hosting | A European region (to be chosen; KVKK review in Phase 3). |

**Milestones:**

| # | Milestone | Status |
| --- | --- | --- |
| 0 | Alert test app for Android (`apps/alert-test`), built by GitHub Actions and published as a pre-release | Test 1 done on the founder's Android phone (results below); test 2 adds the full-screen alert. iOS needs an Apple Developer account. |
| 1 | Backend core (`apps/api`): shop separation, subscription gating, SMS-code sign-in, service list, staff services and durations, availability, booking (including “Fark etmez” and booking for someone else), pending/confirmed rules with the 10-minute reminder and 15-minute automatic confirmation, staff actions, walk-ins, blocked time, staff absence, outgoing-message queue | Delivered; automated tests cover the acceptance scenarios in Section 9. SMS and push print to the server log until real providers are connected. |
| 2 | Customer website (`apps/web`): home search, shop page with the 4-step booking (services, staff or “Fark etmez” with each one's next free time, day and time with “İlk uygun saat” and “Anında onay”, summary with SMS sign-in and “Randevu kimin için?”), live pending/confirmed status, “Randevularım” with cancellation and late-cancellation warning, and the business page with separate owner and staff entrances. *(v1.3)* Each shop's profile page with photos, hours, contact details, and the WhatsApp · Call · Directions · Randevu al bar; the map is removed | Delivered; checked end to end in a browser at phone size. Photos are stored on the server's disk until cloud storage is set up (milestone 5). |
| 3 | Staff/owner app | Next |
| 4 | Real SMS, push, and iyzico | Planned; needs the founder's accounts |
| 5 | Admin panel and launch | Planned |

**Alert test 1 results (founder's Android phone, 24 October 2026):**

| Check | Result |
| --- | --- |
| Sound with the screen off | Plays |
| Arrives after the app is swiped away | Yes |
| Onayla / Reddet buttons on the notification | Shown and working |
| Full-screen view while locked | No (test 1 had none; test 2 adds it) |
| Details read aloud while locked | No (speech needs the app on screen; test 2 opens it over the lock screen) |
| Ringing in silent mode | No (to repeat with the alarm-sound option on) |

**Correction made during the build:** the last-minute reminder rule in 4.4 said “skip if the window is under 4 minutes”, which contradicted its own example (a 5-minute window with no reminder). The threshold is now 6 minutes, matching the example.

## 13. Decisions in version 1.5 *(v1.5)*

These founder decisions (25 October 2026) replace the earlier rows they mention.

| Area | Decision | Replaces |
| --- | --- | --- |
| One app | One app for customers and businesses: web first, then Android, then iOS. Sign-in asks “Müşteriyim” or “İşletmeyim”; Profil switches to business mode. | Customers on the web only and a staff-only native app (v1.1); separate owner and staff entrances (v1.2) |
| Navigation | A fixed bottom bar: Keşfet · Randevular · Favoriler · Profil. Shop profile and booking pages open full screen without it. | The website header and footer |
| Map | Keşfet is a full-screen map with a floating search (shops, districts, cities, services), salon-type filters (Tümü, Erkek kuaförü, Kadın kuaförü), and “Konumumu kullan”. Before the customer shares their location, it opens on Kadıköy, İstanbul. The list below shows shops nearest first. | Map removed (v1.3) |
| Wording | “Personel” instead of “Usta”; “kuaför” and “erkek kuaförü” instead of “berber”. | Earlier interface wording |
| Pricing | 1 staff ₺600, 2 staff ₺800, up to 5 staff ₺1,100, up to 10 staff ₺1,350 per month; QR booking page, SMS notifications, and map visibility included. | “Extra fee per additional staff” (open) |
| Shop registration | Self-service, multi-step registration (“quiz”), followed by our team's review. | Shops created by our team during the visit |
| Agreements | Sign-up shows the usual agreements; drafts to be prepared and reviewed by a lawyer before launch. | — |

**Open after v1.5:** the product name; whether prices include KDV (VAT); the price for more than 10 staff; whether SMS is unlimited in every plan; a free trial; whether an owner who also works counts as one of the plan's staff. *(v1.6: all answered in Section 14 except the product name.)*

**Technology note:** the website uses React (Next.js). The map uses MapLibre with free OpenFreeMap vector tiles, no key needed; MapLibre also runs in React Native, so the Android and iOS apps can share it. A paid tile provider can replace OpenFreeMap at launch if traffic requires it.

## 14. Decisions in version 1.6 *(v1.6)*

The founder answered the questions left open after v1.5 (25 October 2026).

| Area | Decision |
| --- | --- |
| KDV | Plan prices include KDV. The pricing page and the registration form say “Fiyatlara KDV dahildir”. |
| More than 10 staff | Priced individually: shops ask for a quote by email. The sales address is still to be provided (`NEXT_PUBLIC_SALES_EMAIL`); until then the page says a custom offer is prepared. |
| SMS | Unlimited in every plan. At about ₺1,500 per 10,000 SMS the cost is small; the business agreement keeps a fair-use clause against abuse. |
| Free trial | One week. It starts when our team approves the shop, not at sign-up, so the review time is not lost; the shop owner gets an SMS on approval. |
| Co-owner | An “Ortak” (co-owner) label with the same permissions as the owner. The owner and co-owners can choose whether they take appointments. |
| Owner who also works *(proposed default)* | Counts as one of the plan's staff only when “Ben de randevu alıyorum” is ticked. Co-owners follow the same rule; staff always count. |
| Product name | Still open. The build shows “Salon Randevu” and reads the name from `NEXT_PUBLIC_BRAND_NAME`, so changing it is one setting. |
| Visual identity | Blue (#1F48C9) and near-black (#0E1013) on a light grey background (#F3F5F8), with bold, tightly spaced headings (Inter). The logo is a white scissors mark on black; on the dark sign-in screen it sits on a blue tile. It is used as the browser and home-screen icon. The founder's mockups are the reference for the screens. |

**Built in v1.6:**

- **Shop registration (`/isletme-kaydi`).** One topic per page:
  1. Phone verification, for anyone not yet signed in.
  2. Salon type.
  3. Name and contact details. The salon phone may be a landline or an 0850 number; WhatsApp and sign-in numbers stay mobile.
  4. Province (all 81), district, address, and a pin on the map.
  5. Working hours.
  6. Services from the platform list with the owner's prices, plus custom services.
  7. Staff and co-owners, with the matching plan shown live.
  8. Summary, plan, 7-day trial, and the two business agreements.

  After it is sent, the owner can add photos straight away. Each page is saved in the browser as a draft.
- **Review.** A new shop stays hidden until our team approves it. Approval starts the trial and sends the owner an SMS. Each person can have one registration under review at a time.
- **Profil.** Shows “İşletmelerim” with the person's label (Sahibi, Ortak, Personel) and the shop's state (İncelemede, Deneme · N gün kaldı, Aktif). Also links to registration, prices, and the legal texts.
- **Agreements (`/sozlesmeler`).** Turkish drafts of six documents:
  - Kullanıcı Sözleşmesi
  - KVKK Aydınlatma Metni
  - Çerez Politikası
  - Ticari İleti İzni
  - İşletme Hizmet Sözleşmesi
  - Veri İşleme Sözleşmesi

  Every acceptance is recorded with the document's version and time. Customers accept the user agreement at sign-in; marketing permission is optional and can be withdrawn. Businesses accept both business agreements when registering. The drafts have placeholders (company title, address, MERSİS, KEP, e-mail) and **must be reviewed by a lawyer before launch**.
- **Theme.** All screens use the brand colours and logo. Randevular is split into “Randevular” (accepted by the salon) and “Talepler” (waiting for the salon, or declined), each with Yaklaşan / Geçmiş. A new request opens on Talepler.
- **Names in Turkish order.** Staff and shop names are sorted in Turkish alphabetical order (Ç after C, Ş after S).

| Version | Date | Change |
| --- | --- | --- |
| 1.0 | 6 October 2026 | Consolidated planning decisions and created the initial handoff. Included 45 services; removed home visits; preserved the last-minute confirmation rule. |
| 1.1 | 24 October 2026 | Founder decisions: customers on the web only, with one native staff/owner app on Android and iOS; contact matching removed; shop-level service list from the platform template, with custom and renamed services; staff select their services and durations; customer phone numbers visible to owner and staff; reminder alert at 10 minutes with automatic confirmation unchanged at 15; customer SMS with the final result; booking for someone else; special alert kept for every booking; shop tablet mode not pursued; iyzico preferred for subscriptions. Added proposals for prices, verification, abuse protection, late cancellation, booking groups, staff absence, scheduling, appointment states, women's catalog coverage, and Turkey-specific feasibility checks. Added catalog items to confirm, a risk register, a competitor review, and interface wording. |
| 1.2 | 24 October 2026 | Founder authorized application code, approved the technology, and asked for proposals to be built as adjustable defaults; per-staff monthly fee to be set later. Alert keeps ringing until answered. Separate sign-in for owners and staff. Added Section 12 (build status). Corrected the last-minute reminder threshold to 6 minutes to match the 4.4 example. |
| 1.3 | 24 October 2026 | Founder decisions: map discovery removed; every shop gets a public profile page with photos, hours, address and directions, phone, WhatsApp, and Instagram, and a WhatsApp · Call · Directions · Randevu al bar. Customers reach shops by link, QR code, or name search. |
| 1.4 | 24 October 2026 | Founder decisions: the app serves all of Türkiye (shops record their city; search matches it; “İstanbul” removed from the website; pilot city open); “Salonlarım” on the home page with favourite shops and shops booked before. |
| 1.5 | 25 October 2026 | Founder decisions: map discovery returns as the Keşfet tab; one app for customers and businesses with a Müşteriyim / İşletmeyim sign-in and mode switching; bottom navigation bar; “Personel” and “kuaför” wording; subscription prices by staff count; self-service shop registration; agreements at sign-up. Added Section 13. |
| 1.6 | 25 October 2026 | Founder decisions: prices include KDV; more than 10 staff priced by email quote; SMS unlimited with fair use; one-week free trial starting at approval; co-owner (“Ortak”) label with owner permissions; product name still open. Built self-service registration, approval SMS, agreement drafts with recorded acceptance, landline salon phones, and Turkish name sorting. Added Section 14. |
