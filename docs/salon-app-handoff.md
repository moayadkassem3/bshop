# Salon Booking Platform — Handoff & Planning Baseline

**Version:** 1.0  
**Baseline date:** 6 October 2026  
**Status:** Product planning; no application code authorized yet  
**Working market:** Istanbul, Türkiye  
**Product name:** To be decided

This document is the reference point for continuing product design and handing the project to a designer or development team. It consolidates the founder's decisions from the planning conversation. It is a planning baseline, not a claim that every design or technical question has been resolved.

**How to use it:** Preserve the agreed requirements. Treat anything labelled proposed or open as a decision still to make. Record future changes in this document before changing dependent workflows. Do not reopen settled choices without a concrete reason.

## 1. Product purpose

A customer wants to book an appointment, but the barber or stylist may be busy serving someone and cannot answer calls or messages. The platform lets customers see availability and request appointments directly, while giving shops control over their schedules.

The product also helps customers discover participating shops on a map. Its two core benefits are easier appointment management and shop visibility. Discovery is an agreed first-release feature.

Initial customers are men's barbershops and women's salons in Istanbul. Initial shop acquisition will happen through face-to-face visits. Android, iOS, and web are all part of the intended product; customers must be able to book on the web without installing an app. No delivery order has been chosen.

## 2. Agreed product and commercial scope

| Area | Baseline decision |
| --- | --- |
| Customer identity | Phone number, first name, and surname; easy account creation. |
| Booking access | Shop link or QR code, map discovery, and optional contact matching. |
| Shop structure | A shop can have multiple barbers or stylists. |
| Subscription | Monthly shop subscription, with an extra fee per additional barber or stylist. |
| Map membership | Only subscribed shops appear; map visibility is included in the subscription. |
| Shop activation | Our team reviews shops before public visibility and booking activation. |
| Owner permissions | Manage the shop, all staff, and all appointments. |
| Staff permissions | Manage their own appointments and modify their service durations. |
| Staff choice | Customer chooses a specific person or “Any available staff member.” |
| Multiple services | Allowed in one appointment, performed by one staff member; durations are added. |
| Service pricing | Every bookable service displays a price; “starting from” pricing must be clearly identified. |
| Confirmation | Approval normally required; the shop can designate hours for immediate automatic confirmation. |
| Approval timeout | Automatically confirm after 15 minutes or at the appointment start, whichever comes first. |
| Pending reservation | Hold the selected staff member's time while approval is pending. |
| Pending requests | One pending request per customer at the same shop. |
| Appointment alerts | Every new appointment triggers the prominent alert, including automatically confirmed appointments. |
| Cancellation cutoff | Determined by the shop owner; no platform-wide cutoff has been chosen. |
| Payment for services | At the shop. No customer deposit or online service payment in the first release. |
| Earliest appointment | As early as availability permits; no fixed minimum booking lead time. |
| Service location | At the shop only. Home visits have been removed. |

The shop's subscription payment process is separate from the customer's payment for salon services. Subscription prices, collection method, billing-seat definition, and billing policies remain open.

## 3. People and permissions

- **Customer:** Find a shop, view prices and availability, book, track the result, and cancel or request rescheduling under the shop's rules.
- **Shop owner:** Configure the shop, services, prices, team, schedules, confirmation hours, and cancellation cutoff; manage all shop appointments.
- **Barber or stylist:** View and manage their own schedule and appointments, respond to requests, and adjust service durations.
- **Platform reviewer:** Review shop submissions before they become public and bookable. This is a required operational role; the full administration interface is not yet specified.

Receptionist accounts, detailed permission exceptions, and access to customer records beyond appointment needs have not been defined.

## 4. Main workflows

### 4.1 Shop onboarding

The shop provides its business details, location, service offerings, prices, staff, and schedules. The owner sets cancellation rules and any hours for immediate automatic confirmation. Our team reviews the shop, and subscription requirements must be satisfied before public activation.

The exact order of review, subscription payment, and activation is open. The public activation condition is agreed: reviewed and subscribed.

### 4.2 Customer discovery

1. Open a shop's direct link or scan its QR code; or find a shop through the app's map.
2. Optionally use phone-contact matching to find registered shops whose business numbers are already saved in the customer's contacts.
3. Open the shop profile and view services, prices, staff, and appointment availability.
4. Continue into booking without requiring an app installation.

Contact matching refers to **the customer's contacts**, not a barber importing a customer address book. Permission handling, matching approach, and supported platforms are still to be designed. It must remain optional.

**Proposed map design:** Pins with shop profiles, an accompanying list, area search, optional current location, and filters for services and appointment availability. Exact filters, ranking, map provider, and profile fields are open. Opening hours and available appointment times should be distinguishable.

### 4.3 Customer booking

1. Select services.
2. Choose a staff member or “Any available staff member.”
3. Choose a time that accommodates the complete service duration.
4. Provide phone number, first name, and surname. Phone verification and returning-customer sign-in still need design.
5. Review the service price, staff assignment, cancellation rule, and confirmation behavior.
6. Submit the booking; reserve the staff member and time.
7. Follow the confirmation workflow below.

One appointment cannot split services between different staff members in the first release. For “Any available staff member,” an eligible person must be assigned when reserving the slot; the assignment policy is open.

### 4.4 Confirmation and timing

**During designated automatic-confirmation hours:** Confirm immediately and notify both sides. Send the prominent staff alert. The alert announces an existing confirmation; it does not create a second approval step.

**At other times:** Create a pending appointment, hold the slot, and alert the staff member. The owner or assigned staff member can confirm or decline before the deadline.

**Approval deadline = the earlier of request time + 15 minutes and appointment start time.**

If no response arrives by that deadline, confirm automatically and update both sides. A missed alert does not extend the deadline or cause the booking to expire.

| Example | Result without a staff response |
| --- | --- |
| Request at 14:00 for a 16:00 appointment | Automatically confirmed at 14:15. |
| Request at 14:00 for a 14:05 appointment | Automatically confirmed at 14:05. |
| Request during automatic-confirmation hours | Confirmed immediately. |

The customer must see whether the appointment is pending or confirmed and the precise automatic-confirmation deadline. Last-minute requests can remain pending until their start time; this is an intentional founder decision.

There is no fixed advance-booking requirement. Available start-time increments and treatment of a booking starting at the current instant remain open; the timing rule must not create an appointment that stays pending past its start.

### 4.5 Appointment alerts

Every new appointment uses the prominent alert experience, regardless of its confirmation route. Desired features are a distinctive ringtone, a prominent presentation potentially using the full screen, and optional spoken appointment details.

- Pending request: Show the requested time, services, and Confirm / Decline actions.
- Already confirmed booking: Announce the confirmed appointment and provide its details.
- Confirmation must update the same appointment; it must not create another booking.

Custom sound, full-screen presentation, speech, and background delivery must be evaluated for Android, iOS, and web before exact behavior is promised. These are product intentions, not verified platform capabilities.

Recipients, repeat-alert behavior, owner escalation, and alerts for appointments staff enter themselves are open. Any fallback must preserve appointment status and deadlines.

### 4.6 Daily operations and customer changes

Owners and staff see their schedules, add appointments manually, record walk-ins, and block unavailable time. Customers receive confirmation updates and reminders.

Owners set the cancellation cutoff. Reminder timing, reminder channels, cancellation after the cutoff, rescheduling rules, staff-initiated cancellations, delays, and no-shows still need explicit workflows. No penalty or cancellation fee has been agreed.

## 5. Scheduling rules and safeguards

**Agreed:** Services have default durations that staff can modify. Multiple selected services occupy their combined duration. Pending and confirmed appointments reserve time. Staff availability accounts for working hours, breaks, and blocked periods.

**Proposed implementation requirements for design review:**

- Use a staff-specific duration when configured; otherwise use the catalog default.
- A combined catalog service uses its own listed duration; do not expand it into additional component services.
- Only offer a time if the full booking fits and the staff member can perform all selected services.
- Assign and reserve a specific staff member for “Any available” bookings, so availability remains reliable.
- Changing a service duration affects future bookings; existing appointments retain their booked duration unless explicitly edited.
- Check an individual appointment's duration edit against other reservations. Notify the customer of changes affecting their start time through the agreed rescheduling flow.
- Prevent simultaneous requests from reserving the same staff member for overlapping times.
- Handle staff responses and automatic confirmation together so there is one final outcome, including when they arrive at the deadline.
- Release reserved time when a request is declined or an appointment is cancelled. A decline after automatic confirmation must follow the cancellation workflow.

Use Istanbul local time in customer and shop displays. Decide the available start-time increments during scheduling design.

## 6. Initial service catalog — 45 services

Names and durations below are supplied by the founder and preserved as given. They are scheduling defaults, not a universal statement about how long every shop takes. Staff may modify durations. More services can be added to the platform later.

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

## 7. Proposed delivery plan

This is a sequence of deliverables, not a development schedule or technology commitment.

| Phase | Work | Completion condition |
| --- | --- | --- |
| 1. Finish system definition | Resolve the booking, cancellation, assignment, identity, and alert decisions listed below. Define appointment states and role permissions. | Founder has a coherent set of workflows, including exceptional cases. |
| 2. Design customer and shop experiences | Create screen flows and a clickable prototype for discovery, booking, confirmation, schedules, settings, and review. Prepare Turkish interface wording. | Validate the prototype with the founder and initial Istanbul shops; document revisions. |
| 3. Validate feasibility and prepare engineering handoff | Evaluate alerts on all three platforms, map and contact matching approaches, subscriptions, and notification delivery. Review applicable privacy and consent requirements. Define the data model and acceptance scenarios. | Select the technical approach and document platform limits and unresolved dependencies. Any experimental coding requires the founder's go-ahead to begin code work. |
| 4. Implement the agreed first release | Build customer booking, staff scheduling, review/activation, subscription access, map discovery, contact matching, and notifications for Android, iOS, and web. | Agreed acceptance scenarios pass across the intended platforms; any staged rollout is explicitly agreed. |
| 5. Run an Istanbul pilot | Onboard reviewed shops face-to-face, verify their schedules and services, and observe real booking and alert behavior. | Pilot findings are recorded and release-blocking issues are resolved. |

**Proposed pilot measures:** Completed booking rate, staff response time, share automatically confirmed by timeout, missed-alert reports, schedule conflicts, cancellations/no-shows, and active shops. Targets and pilot size remain open.

## 8. Decisions to close before implementation

| Priority | Decision needed | Reason |
| --- | --- | --- |
| First | “Any available” assignment and eligible-service rules | Determines which staff member is reserved and alerted. |
| First | Automatic-confirmation hours: shop-wide or per staff, and whether rules use appointment start time or request time | Prevents inconsistent confirmation behavior. |
| First | Cancellation and rescheduling, including pending requests, after-cutoff changes, and shop-initiated changes | Determines when reservations are released or replaced and who is notified. |
| First | Staff duration editing: service default, individual appointment, or both; owner control | Establishes edit permissions and conflict handling. |
| First | Alert recipients and exact behavior on each platform | Defines the central staff experience and realistic delivery expectations. |
| First | Phone verification, sign-in, and duplicate-account handling | Defines how an appointment is tied to the correct customer. |
| Before pilot | Start-time increments, booking horizon, delays, completion, and no-show states | Completes day-to-day scheduling. |
| Before pilot | Reminder channels, timing, and customer preferences | Makes appointment communication concrete. |
| Before pilot | Subscription price, included staff, extra-staff billing, and failed-payment behavior | Makes shop access and charges predictable. |
| Before pilot | Shop review criteria and location verification | Makes map listings and activation consistent. |
| Before pilot | Contact matching, map ranking, permissions, and data handling | Defines discovery behavior and privacy requirements. |
| Before pilot | Catalog coverage and “starting from” price presentation | Confirms that the initial services meet participating men's and women's salons' needs. |

A privacy and consent review is a future work item. This document does not assert that a particular contact-access or notification design has been legally or technically validated.

## 9. Proposed acceptance scenarios

Use these to review the design and, after implementation is authorized, verify the product:

1. A customer books from a shop link on the web without installing an app.
2. A shop with several staff members maintains separate, conflict-free schedules.
3. A pending request reserves the full service duration, and another customer cannot take overlapping time for that staff member.
4. A normal request automatically confirms after 15 minutes if unanswered; a last-minute request confirms at its start time.
5. Staff confirmation or decline before the deadline produces one consistent outcome; a decline releases the slot.
6. Automatic-confirmation hours bypass pending approval and still trigger the prominent appointment alert.
7. “Any available” assigns an eligible staff member and respects their actual schedule and service duration.
8. Multiple services use their total duration; a combined catalog service uses its own duration.
9. Customers see the owner's cancellation rule and the applicable service price before submitting.
10. Reviewed, subscribed shops can be discovered on the map; optional contact discovery does not block ordinary booking.
11. Staff can add walk-ins and block time without creating conflicting customer availability.
12. The catalog contains the 45 listed services, and home visits cannot be booked.

Exact alert-delivery acceptance criteria must be added after platform feasibility checks. Reminder, cancellation, rescheduling, and billing scenarios must be completed once their rules are settled.

## 10. Scope boundaries and continuation instructions

**Explicitly outside the first release:** Home visits; online customer payments or deposits; appointments split between multiple staff members.

**Not part of the agreed baseline unless added later:** Ratings and reviews, in-app chat, loyalty programs, advertising, retail checkout, and multi-branch management.

No product name, technology stack, hosting provider, budget, delivery date, or implementation order among Android, iOS, and web has been selected. No Notion page or external project has been created for this plan.

**Next action:** Resolve the first-priority decisions in Section 8, then produce the screen flows and appointment-state specification. Continue product and workflow planning before writing application code.

**Handoff instruction:** Read this document as the current planning baseline. Preserve the founder's decisions, particularly automatic confirmation at the earlier deadline, alerts for every new appointment, map discovery in the first release, owner-defined cancellation cutoffs, payment at the shop, and the removal of home visits. Advance open items without presenting proposals as already agreed.

## Change record

| Version | Date | Change |
| --- | --- | --- |
| 1.0 | 6 October 2026 | Consolidated planning decisions and created the initial handoff. Included 45 services; removed home visits; preserved the last-minute confirmation rule. |
