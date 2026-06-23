# 05 — Audit Findings (Risk Register)

Consolidated risks verified against **current code**. Inline flags in flow docs reference IDs here.

**Severity:** Critical | High | Medium | Tech-debt

---

## Critical

### C-001 — Unauthenticated admin surface {#C-001}

**Severity:** Critical  
**Area:** Admin routes  
**Files:** `routes/admin/Payment.js`, `adminEmployees.js`, `adminDesignations.js`, `faqs.js`, `support.js`, `knowledgeBase.js`, `chatbotTickets.js`, `listingsManagement.js`, `report.js`

**Finding:** CRUD, payouts, refunds, support, and employee management accessible without `requireAdmin`.

**Suggested fix:** Apply `[requireAdmin]` (or `[requireAuth, requireAdmin, requireActiveAdmin]`) to all `/api/admin/*` routes except explicit login/forgot-password. Add integration tests asserting 401 without token.

---

### C-002 — Google App auth trusts client payload {#C-002}

**Severity:** Critical  
**Area:** Auth  
**File:** `controllers/authController.js` — `googleAuth` when `type === "App"`

**Finding:** No Firebase `verifyIdToken`; arbitrary `userData` can create/login accounts.

**Suggested fix:** Require Firebase verification for all clients, or signed attestation from mobile app.

---

### C-003 — Unauthenticated payment confirmation (Path B) {#C-003}

**Severity:** Critical  
**Area:** Payments  
**Files:** `routes/vendor/booking.js` — `create-payment-intent`, `on-payment-success`, `amount-to-pay/:id`

**Finding:** Anyone with `bookingId` can confirm payments and mutate `AmountPaid` / `paymentStatus`.

**Suggested fix:** Require `requireAuth` + `requireClient` + booking ownership; verify Stripe PI server-side before updating booking.

---

### C-004 — Legacy mark-paid without Stripe verification {#C-004}

**Severity:** Critical  
**Area:** Payments  
**File:** `controllers/client/bookingController.js` — `markBookingAsPaid`

**Finding:** `POST /api/booking/:id/pay` sets `paid` without payment proof.

**Suggested fix:** Remove endpoint or require verified Stripe PI id; deprecate in favor of Path B with auth.

---

### C-005 — Vendor employee JWT impersonates owner {#C-005}

**Severity:** Critical  
**Area:** Auth / RBAC  
**Files:** `authController.js` vendorLogin, `authMiddleware.js`

**Finding:** Employee token `id` = vendor owner's User id; designation `pages` not enforced server-side.

**Suggested fix:** Issue tokens with employee id + `userType: 'employee'`; enforce permission middleware per route; scope queries to employee's vendor.

---

### C-006 — Chat REST APIs unauthenticated {#C-006}

**Severity:** Critical  
**Area:** Messaging  
**Files:** `routes/messageRoutes.js`, `conversationRoutes.js`, `chatRoomRoutes.js`

**Finding:** Read/delete messages and conversations without auth — IDOR risk.

**Suggested fix:** Add `requireAuth`; verify user is participant on conversation.

---

## High

### H-001 — Hardcoded vendor master password {#H-001}

**Severity:** High  
**File:** `controllers/authController.js` — vendor login (~`"sinan123"`)

**Suggested fix:** Remove immediately; use normal password reset flow.

---

### H-002 — Vendor registration skips required-field validation {#H-002}

**Severity:** High  
**File:** `authController.js` — `registerVendor2`

**Finding:** `requiredPersonal` / `requiredBusiness` arrays unused.

**Suggested fix:** Enforce same validation as legacy `registerVendor` or use Joi/Zod schema.

---

### H-003 — Unauthenticated employee password reset {#H-003}

**Severity:** High  
**Route:** `POST /api/auth/vendor/reset-password-for-employee`

**Suggested fix:** Require admin or email OTP verification before reset.

---

### H-004 — Vendor profile admin update without auth {#H-004}

**Severity:** High  
**Route:** `PUT /api/vendor/profile/admin/update/:id`

**Suggested fix:** `requireAdmin` middleware.

---

### H-005 — Stripe onboarding returns full account object {#H-005}

**Severity:** High  
**File:** `authController.js` — `checkStripeOnboardingStatus`

**Suggested fix:** Return only `{ onboarded, charges_enabled, payouts_enabled }`.

---

### H-006 — Stripe Connect without requireVendor {#H-006}

**Severity:** High  
**Routes:** `/api/auth/vendor/stripe/*`

**Suggested fix:** Add `requireVendor`; reject non-vendor users.

---

### H-007 — Auth middleware logs tokens {#H-007}

**Severity:** High  
**File:** `middleware/authMiddleware.js`

**Suggested fix:** Remove `console.log` of headers/tokens; use debug-level logger with redaction.

---

### H-008 — Missing import causes runtime error {#H-008}

**Severity:** High  
**File:** `controllers/client/bookingController.js` — `getVendorActionButtons` used but not imported

**Suggested fix:** Import from `utils/tracking.js` or inline fix.

---

### H-009 — Cron cancel timing vs email warning {#H-009}

**Severity:** High  
**File:** `corn/paymentReminder.js`

**Finding:** 1-day email warns cancel before event; code cancels **after** event date.

**Suggested fix:** Align policy: either cancel before event (e.g. end of event day - 1) or change email copy.

**Discrepancy:** `PARTIAL_PAYMENT_FLOW_AUDIT.md` may describe different timing — **code wins:** cancel when `now.isAfter(eventDate)`.

---

### H-010 — Webhook does not update Path B bookings {#H-010}

**Severity:** High  
**Files:** `stripeWebhookController.js`, vendor `paymentConfirmation`

**Suggested fix:** Unify on one payment path; or webhook handler looks up booking by Stripe metadata `bookingId`.

---

### H-011 — Public admin notification endpoints {#H-011}

**Severity:** High  
**File:** `routes/notifications.js` — `admin-notifications`, `read-all`

**Suggested fix:** `requireAdmin` on admin routes.

---

## Medium

### M-001 — JWT signToken never expires {#M-001}

**Severity:** Medium  
**File:** `utils/jwtUtils.js`

**Suggested fix:** Use `signAccessToken` everywhere with expiry; rotate secrets.

---

### M-002 — requireAdmin findById syntax {#M-002}

**Severity:** Medium  
**File:** `authMiddleware.js` — `AdminEmployee.findById({ _id: baseUser.id })`

**Suggested fix:** `findById(baseUser.id)`.

---

### M-003 — paymentStatus enum mismatch {#M-003} — **Resolved**

**Severity:** Medium (was)  
**File:** `models/Booking.js` vs `corn/paymentReminder.js`

**Finding:** Cron previously set `cancelled_due_to_non_payment` not in enum.

**Resolution:** Auto-cancel now only sets `status: "cancelled"`; `paymentStatus` is left unchanged (`upfront_paid`). Cron query excludes `cancelled`/`rejected` bookings. Backfill: `node scripts/backfill-cancelled-payment-status.js`.

---

### M-004 — FCM token route broken handler {#M-004}

**Severity:** Medium  
**File:** `authController.js` — `updateFcmToken`

**Suggested fix:** Standard `(req, res)` signature.

---

### M-005 — Vendor approval not enforced server-side {#M-005}

**Severity:** Medium  

**Suggested fix:** Middleware `requireApprovedVendor` on listing/booking accept routes.

---

### M-006 — adminLogin at /api/auth/admin/login broken {#M-006}

**Severity:** Medium  
**File:** `authController.js` — `performLogin`

**Suggested fix:** Remove route or wire to `loginEmployee`; document admin login URL.

---

### M-007 — Three parallel payment paths {#M-007}

**Severity:** Medium  

**Suggested fix:** Deprecate Path A/C for bookings; single authenticated Path B with webhook backup.

---

### M-008 — vendorId User vs Vendor doc confusion {#M-008}

**Severity:** Medium  
**Files:** Multiple controllers

**Suggested fix:** Standardize on `User` id for `Booking.vendorId`; helper `resolveVendorUserId` everywhere.

---

### M-009 — Stripe webhook secret optional {#M-009}

**Severity:** Medium  
**File:** `stripeWebhookController.js`

**Suggested fix:** Fail startup if `STRIPE_WEBHOOK_SECRET` missing in production.

---

### M-010 — Availability not checked at booking create {#M-010}

**Severity:** Medium  
**File:** `bookingController.js` — `createBookingRequest`

**Suggested fix:** Call `checkAvailability` before save.

---

### M-011 — Inconsistent vendorId in accept/reject/pending {#M-011}

**Severity:** Medium  

**Suggested fix:** Audit all `vendorId` queries; use `vendor.userId` consistently.

---

### M-012 — Cron cancel stock not restored on Listing.quantity {#M-012}

**Severity:** Medium  
**File:** `corn/paymentReminder.js`

**Suggested fix:** `$inc` listing quantity like client cancel does.

---

### M-013 — Review endpoint under-validated {#M-013}

**Severity:** Medium  
**Route:** `POST /api/booking/:id/review`

**Suggested fix:** Require completed booking + one review per booking.

---

## Tech-debt

### T-001 — corn/ folder typo {#T-001}

Rename to `cron/` when safe (update `server.js` require).

---

### T-002 — Booking vs BookingRequest naming {#T-002}

**File:** `models/Booking.js`, refs `ref: 'Booking'`

**Suggested fix:** Rename model or fix refs; single import alias.

---

### T-003 — Duplicate email logic in cron {#T-003}

**File:** `corn/paymentReminder.js` vs `utils/mailer.js`

**Suggested fix:** Reuse mailer functions; single SMTP config.

---

### T-004 — i18n infrastructure unused {#T-004}

**File:** `app.js`, missing `locales/`

**Suggested fix:** Remove i18next or add locale files.

---

### T-005 — Dead dependencies and routes {#T-005}

`redis`, `passport`, `swagger`, unmounted `routes/stock.js`, `routes/vendor/SaleItemPurchase.js`

**Suggested fix:** Remove from package.json and repo or mount/document.

---

### T-006 — Multiple routers at /api with GET /:id {#T-006}

**File:** `app.js` mount order

**Suggested fix:** Prefix admin employee/designation routes under `/api/admin/employees`.

---

### T-007 — bcrypt and bcryptjs both used {#T-007}

**Suggested fix:** Standardize on one library.

---

### T-008 — Missing utils/seeder.js {#T-008}

**File:** `package.json` scripts.seed

**Suggested fix:** Add seeder or remove script.

---

### T-009 — Cron comment vs schedule {#T-009}

**File:** `corn/paymentReminder.js` — comment says daily midnight; cron is `0 */5 * * *`

**Suggested fix:** Fix comment or schedule per product spec.

---

### T-010 — Triple review storage {#T-010}

`Review` model + embedded reviews on Listing/Vendor

**Suggested fix:** Single source of truth.

---

## Discrepancies vs root audit docs

| Root doc claim | Current code (verified) |
|----------------|-------------------------|
| `PARTIAL_PAYMENT_FLOW_AUDIT.md` cron timing | Code: every **5 hours** (`0 */5 * * *`) |
| `FULL_SYSTEM_AUDIT.md` some route auth | Many admin routes still **unauthenticated** — worse than doc may imply |
| Vendor cancellation email "not sent" | **Fixed** in `utils/mailer.js` + `bookingController.cancelBooking`; cron uses local copy in `paymentReminder.js` |

---

## Priority remediation order

1. C-001, C-003, C-004, C-006 (security exposure)
2. C-002, C-005, H-001 (auth bypass)
3. H-009, H-010, M-007 (payment integrity)
4. Medium/Tech-debt in normal sprint work
