# Flow: Vendor Onboarding

From signup to accepting paid bookings — registration, profile, Stripe Connect, and approval.

---

## 1. Registration

See [auth-and-registration.md](./auth-and-registration.md#vendor-registration) for OTP + `registerVendor2` detail.

**Outcome:** `User` (`userType: vendor`) + `Vendor` profile with `isApproved: false`.

**Not done at registration:** Stripe Connect, listing creation, JWT issuance.

---

## 2. Login

`POST /api/auth/vendor/login` — vendor or employee. See auth flow doc for employee token quirks.

---

## 3. Stripe Connect

Decoupled from registration. Stripe fields live on **`User`**, not `Vendor`.

| Step | Endpoint | Middleware |
|------|----------|------------|
| Create Express account | `POST /api/auth/vendor/stripe/connect` | `requireAuth` |
| Get onboarding URL | `GET /api/auth/vendor/stripe/onboarding-link` | `requireAuth` |
| Poll onboarding status | `GET /api/auth/vendor/stripe/onboarding-status` | `requireAuth` |

**`connectVendorStripe`:**
1. If `User.stripeAccountId` exists → return it
2. Else `stripe.accounts.create({ type: "express", ... })`
3. Save `stripeAccountId` on User

**`getStripeOnboardingLink`:** Hardcoded production URLs (`leverancier.evenlyo.nl`). Returns hosted onboarding link.

**`checkStripeOnboardingStatus`:** Polls `details_submitted && charges_enabled && payouts_enabled` → sets `stripeOnboardingComplete`. Returns **full Stripe account object** in response.

> **Audit — High:** No `requireVendor`; any authenticated user could create Connect account. No Connect webhooks — polling only. [05-audit-findings.md](../05-audit-findings.md#H-006)

---

## 4. Profile management

`GET /api/vendor/profile` — `requireAuth` — `getProfile` populates User + Vendor.

`PUT /api/vendor/profile/update` — business details, categories, media URLs (Cloudinary links from frontend).

`PUT /api/vendor/profile/update-delivery-charges` — delivery pricing.

**Unauthenticated routes (audit concern):**
- `PUT /api/vendor/profile/admin/update/:id` — admin update without auth
- `POST /api/vendor/profile/request-kvk-change`
- `GET /api/vendor/profile/get-main-category/:vendorId`

---

## 5. Vendor approval

`Vendor.isApproved` set `false` at registration. Admin can toggle:

`PATCH /api/admin/users/vendors/:vendorId/approval` — `requireAdmin` — `toggleVendorApproval`.

**Gap:** No hard gate on vendor login or listing creation when `isApproved: false` was verified in routes — approval may be frontend-only.

> **Audit — Medium:** [05-audit-findings.md](../05-audit-findings.md#M-005)

---

## 6. First listing

`POST /api/vendor/listings/create` — `requireAuth` — creates `Listing` with `status` typically `pending` or `active` depending on controller logic.

Public browse: `GET /api/listings/*` — no auth.

---

## 7. Subscription plans (optional)

Vendor plans via `Plan` model. `POST /api/payments/create-subscription` — public route. Billing records in `Billing` collection. Invoice PDF: `GET /api/vendor/billing/invoices`.

---

## Related

- [listing-lifecycle.md](./listing-lifecycle.md)
- [payments-and-stripe.md](./payments-and-stripe.md)
- [vendor-team-and-rbac.md](./vendor-team-and-rbac.md)
