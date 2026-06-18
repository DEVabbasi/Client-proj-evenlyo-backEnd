# 01 — Roles and Permissions

Three human roles interact with Evenlyo. Each maps to different route prefixes, identity models, and JWT shapes. This doc traces **what each role can do from code**, not from product specs.

---

## Role summary

| Role | Identity in DB | Login endpoint | Typical JWT issuer |
|------|----------------|----------------|------------------|
| **Client (User)** | `User` with `userType: 'client'` | `POST /api/auth/client/login` | `signToken({ id, name })` — no expiry |
| **Vendor** | `User` with `userType: 'vendor'` + `Vendor` profile | `POST /api/auth/vendor/login` | `signToken` — employee tokens use **owner's User id** |
| **Vendor employee** | `Employee` linked to vendor | Same vendor login | Token `id` = vendor owner's User `_id` |
| **Admin** | `AdminEmployee` (separate collection) | `POST /api/login-admin` or `/api/admin/login-employee` | `signToken({ id, name })` — **not** `/api/auth/admin/login` (broken) |

Legacy `User` + `Admin` model exists but admin panel uses **`AdminEmployee`**.

---

## How gating works

All middleware lives in `middleware/authMiddleware.js`.

### `requireAuth`

1. Reads `Authorization: Bearer <token>`
2. `verifyAccessToken(token)` using `JWT_SECRET`
3. Loads `User` by `decoded.id`
4. If no User and `userType === 'vendor'` → tries `Employee`
5. If no User and `userType === 'admin'` → tries `AdminEmployee`
6. Sets `req.user` and calls `next()`

> **Audit — Medium:** `requireAuth` logs raw auth headers/tokens to console (`authMiddleware.js` ~16–23). See [05-audit-findings.md](./05-audit-findings.md#H-007).

### `requireClient` / `requireVendor`

`requireRole(['client'])` or `requireRole(['vendor'])` — checks `req.user.userType`.

**Problem:** Vendor employee login returns `userType: "Employee"` in the response, but middleware expects `"vendor"`. Employees rely on `requireAuth` only on most routes, not `requireVendor`.

### `requireAdmin`

**Separate code path** — does not chain on `requireAuth`:

1. Verifies JWT
2. `AdminEmployee.findById({ _id: baseUser.id })` — non-idiomatic query
3. Sets `req.user = adminDoc || decodedToken`

Used on most admin routes. `requireActiveAdmin` and `requirePermission` exist but are often **commented out**.

### Exported bundles (mostly unused)

`clientRoutes`, `vendorRoutes`, `adminRoutes` — defined but routes apply middleware individually.

---

## Client capabilities

**Gated:** `requireAuth` + often `requireClient`.

| Area | What they can do | Key routes |
|------|------------------|------------|
| Auth | Register (OTP), login, Google, forgot password | `/api/auth/*` |
| Browse | Categories, listings, search, vendor profiles | `/api/categories`, `/api/listings`, `/api/vendor/*` (public GETs) |
| Cart | Add, update, remove, submit | `/api/cart/*` |
| Booking | Create request, pay, cancel, track, review, claim | `/api/booking/*` |
| Purchases | Sale-item orders | `/api/client/purchases`, `/api/sale-item-purchase` |
| Settings | Profile, password, notification toggles | `/api/settings/*` |
| Support | Create ticket (auth), contact form (public) | `/api/support/*` |
| Notifications | List + mark read | `/api/notifications` (client branch) |

**Public without login:** All listing browse endpoints, plans, FAQs, blogs (read), chatbot message, contact form.

---

## Vendor capabilities

**Gated:** Usually `requireAuth` only — `requireVendor` on **some** routes.

| Area | What they can do | Key routes |
|------|------------------|------------|
| Auth | Register (OTP), login, Stripe Connect | `/api/auth/vendor/*` |
| Profile | Read/update business profile, delivery charges | `/api/vendor/profile/*`, `/api/vendor/vendorprofile` |
| Listings | CRUD, toggle status, filter | `/api/vendor/listings/*` |
| Bookings | Accept/reject, analytics | `/api/vendor/bookings/*` |
| Tracking | On the way, picked up, completed, received back | `/api/vendor/tracking/*` |
| Stock | Listing stock events + logs | `/api/vendor/stock/*` |
| Items | ServiceItem CRUD (sale inventory) | `/api/vendor/items/*` |
| Earnings | Analytics | `/api/vendor/earnings/*` |
| Billing | Invoices, PDF download | `/api/vendor/billing/*` |
| Team | Designations, role users (employees) | `/api/vendor/roles/*` |
| Notifications | Vendor notification list | `/api/notifications/vendor-notifications` |

**Also on client booking routes:** `GET /api/booking/pending`, `GET /api/booking/vendor-history` use `requireVendor`.

> **Audit — High:** Several vendor profile routes have **no auth** (`PUT /api/vendor/profile/admin/update/:id`, KVK request). See [05-audit-findings.md](./05-audit-findings.md#H-004).

---

## Admin capabilities

**Gated:** `requireAdmin` on **some** routes; many admin routes have **no middleware**.

| Area | What they can do | Auth on route |
|------|------------------|---------------|
| Dashboard | Stats | `requireAdmin` |
| Users | List/block/reset clients & vendors, approve vendors, bulk email | `requireAdmin` |
| Bookings | Analytics, filtered list, details | Mixed — some use `requireAuth`+`requireAdmin`+`requireActiveAdmin` |
| Tracking | All bookings, sale orders, status override | `requireAdmin` |
| Payments | Payouts, refunds, vendor claims | **None** |
| Settings | Platform fees, notification toggles | `requireAdmin` |
| CMS | Blogs, FAQs, knowledge base (QnA) | Blogs: `requireAdmin`; FAQs/QnA: **none** |
| Support | Ticket list, status, email reply | **None** |
| Employees | CRUD, login, forgot password | Login: **none**; CRUD: **none** |
| Chatbot tickets | List, reply, delete | **None** |

> **Audit — Critical:** Unauthenticated admin payment and employee routes. [05-audit-findings.md](./05-audit-findings.md#C-001).

---

## Where roles intersect

These are the handoffs you'll debug most often:

```
Client creates booking (pending)
    → Vendor accepts (accepted, stock -1)
    → Client pays (upfront_paid or paid)
    → Vendor marks on the way → Client marks received
    → Vendor completes OR client marks finished
    → Client reviews

Parallel: Cron auto-cancels if upfront_paid + event passed + not fully paid
    → Vendor + Admin cancellation emails

Evenlyo Protect enabled:
    → Admin email/push at NEW, ACCEPTED, REJECTED, RECEIVED

Admin can override tracking status at any time (PATCH /api/admin/tracking/:trackingId/status)
```

**Vendor employee** logs in but JWT acts as vendor owner — designation `pages` returned at login are **not enforced** server-side on most routes.

**Admin notifications** use `AdminEmployee.notificationSettings.email.*` toggles (granular). **Client/Vendor** use coarse `User.notifications.email` / `.push` booleans.

---

## Notification permission model

| Actor | Storage | Granularity |
|-------|---------|-------------|
| Admin | `AdminEmployee.notificationSettings` | Per-event: `orderCancellation`, `evenlyoProtect`, `newRegistration`, etc. |
| Client/Vendor | `User.notifications` | `{ email: bool, push: bool }` only |

Email sends typically check `notifications.email !== false` before calling `utils/mailer.js`.

---

## JWT inconsistency (important for debugging)

| Login path | Token function | Payload | Expiry |
|------------|----------------|---------|--------|
| Client email login | `signToken` | `{ id, name }` | **None** |
| Vendor login | `signToken` | `{ id, name }` | **None** |
| Admin employee login | `signToken` | `{ id, name }` | **None** |
| Google auth | `signAccessToken` | `{ id, email, userType, firstName, lastName }` | 30 days |

`requireAuth` only needs `id` in the payload, so all formats work — but leaked `signToken` sessions never expire.

---

## Related docs

- [03-flows/auth-and-registration.md](./03-flows/auth-and-registration.md)
- [03-flows/vendor-onboarding.md](./03-flows/vendor-onboarding.md)
- [04-api-reference/](./04-api-reference/)
- [05-audit-findings.md](./05-audit-findings.md)
