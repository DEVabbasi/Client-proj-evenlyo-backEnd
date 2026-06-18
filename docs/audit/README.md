# Evenlyo Backend — Onboarding Audit

**Audience:** Engineers joining the project with zero prior context.  
**Verified against:** Current codebase (`server.js`, `app.js`, routes, controllers, models) as of audit date.  
**Not ground truth:** Root-level `FULL_SYSTEM_AUDIT.md`, `PARTIAL_PAYMENT_FLOW_AUDIT.md`, etc. — those are reference only; discrepancies are flagged in [05-audit-findings.md](./05-audit-findings.md).

---

## Start here

1. Read [00-overview.md](./00-overview.md) — how the app boots, folder layout, request lifecycle.
2. Read [01-roles-and-permissions.md](./01-roles-and-permissions.md) — what Admin, Vendor, and Client can do and how auth gates work.
3. Skim [02-data-models.md](./02-data-models.md) — entities and relationships before diving into flows.
4. Pick a journey in [03-flows/](./03-flows/) — booking, payments, auth, etc.
5. Use [04-api-reference/](./04-api-reference/) as the endpoint lookup.
6. Review [05-audit-findings.md](./05-audit-findings.md) for known risks before changing production paths.

---

## Document index

### Foundation

| File | Summary |
|------|---------|
| [00-overview.md](./00-overview.md) | Tech stack, architecture, folders, env vars, how to run locally |
| [01-roles-and-permissions.md](./01-roles-and-permissions.md) | Three roles, capabilities, middleware, intersections |
| [02-data-models.md](./02-data-models.md) | 34 Mongoose models, relationships, enums, schema quirks |

### Flows (`03-flows/`)

| File | Summary |
|------|---------|
| [auth-and-registration.md](./03-flows/auth-and-registration.md) | OTP signup, login, Google, password reset |
| [vendor-onboarding.md](./03-flows/vendor-onboarding.md) | Vendor register, profile, Stripe Connect, approval |
| [listing-lifecycle.md](./03-flows/listing-lifecycle.md) | Create, browse, search, availability, admin taxonomy |
| [booking-lifecycle.md](./03-flows/booking-lifecycle.md) | Request → accept → pay → track → complete/cancel |
| [partial-payment-and-reminders.md](./03-flows/partial-payment-and-reminders.md) | Upfront %, reminders, cron auto-cancel (links to booking) |
| [sale-item-orders.md](./03-flows/sale-item-orders.md) | Buy ServiceItems (separate from rental bookings) |
| [payments-and-stripe.md](./03-flows/payments-and-stripe.md) | PaymentIntents, webhooks, Connect payouts |
| [notifications-and-email.md](./03-flows/notifications-and-email.md) | FCM, email triggers, toggles |
| [chat-and-messaging.md](./03-flows/chat-and-messaging.md) | REST + Socket.IO chat |
| [reviews-and-claims.md](./03-flows/reviews-and-claims.md) | Post-booking review, Evenlyo Protect, claims |
| [admin-moderation.md](./03-flows/admin-moderation.md) | Users, tracking override, payouts, CMS |
| [support-and-chatbot.md](./03-flows/support-and-chatbot.md) | Tickets, OpenAI chatbot, knowledge base |
| [vendor-team-and-rbac.md](./03-flows/vendor-team-and-rbac.md) | Employees, designations, permissions |

### API reference (`04-api-reference/`)

| File | Summary |
|------|---------|
| [public-and-auth-api.md](./04-api-reference/public-and-auth-api.md) | Unauthenticated + `/api/auth/*` |
| [client-api.md](./04-api-reference/client-api.md) | Client/customer endpoints |
| [vendor-api.md](./04-api-reference/vendor-api.md) | Vendor portal endpoints |
| [admin-api.md](./04-api-reference/admin-api.md) | Admin panel endpoints |
| [payments-and-webhooks-api.md](./04-api-reference/payments-and-webhooks-api.md) | Stripe + payment callbacks |
| [shared-api.md](./04-api-reference/shared-api.md) | Notifications, settings, chat, chatbot |

### Risk register

| File | Summary |
|------|---------|
| [05-audit-findings.md](./05-audit-findings.md) | Consolidated findings with severity + suggested fix |

---

## Quick mental model

```
Client browses Listing → Cart/BookingRequest → Vendor accepts → Stripe pay (often partial upfront)
→ Vendor fulfills (tracking statuses) → Client completes/reviews
Admin oversees users, tracking, payouts, CMS. Cron nags/cancels unpaid partial bookings.
```

Two commerce paths: **rental bookings** (`BookingRequest`) and **sale items** (`saleorders` / `ServiceItem`).
