# Flow: Payments and Stripe

Three parallel payment implementations coexist — this is the highest-risk area of the codebase.

---

## Path A — Legacy client booking pay

| Step | Endpoint | Auth |
|------|----------|------|
| Create PI | `POST /api/booking/:id/create-payment-intent` | `requireAuth`, `requireClient` |
| Confirm | `POST /api/booking/:id/pay` | `requireAuth`, `requireClient` |

Full `pricing.totalPrice`. `markBookingAsPaid` sets `status: paid` **without Stripe verification**.

---

## Path B — Escrow / partial (vendor routes)

Documented in [partial-payment-and-reminders.md](./partial-payment-and-reminders.md#payment-after-accept).

`GET/POST /api/vendor/bookings/amount-to-pay|create-payment-intent|on-payment-success` — **unauthenticated**.

---

## Path C — Generic payments + webhook

| Step | Endpoint |
|------|----------|
| Create PI | `POST /api/payments/create-payment-intent` |
| Lookup | `GET /api/payments/get-payment-intent/:internalId` |
| Subscription | `POST /api/payments/create-subscription` |
| Webhook | `POST /api/payments/webhook` |

**`createPaymentIntent`** (`paymentController.js`): If `bookingId` in body, charges full `pricing.totalPrice`. Saves `PaymentIntent` document.

**Webhook** (`stripeWebhookController.js`):
- Verifies signature via `STRIPE_WEBHOOK_SECRET` (skipped if unset — **audit risk**)
- `payment_intent.succeeded` → `paymentController.updateStatus` → sets `booking.paymentStatus = 'paid'`, `booking.status = 'paid'`

**Only works** for PIs created through Path C (record in `PaymentIntent` collection). Path B PIs won't update via webhook.

> **Audit — High:** Webhook does not handle Path B bookings. [05-audit-findings.md](../05-audit-findings.md#H-010)

---

## Stripe Connect (vendor payouts)

Vendor `User.stripeAccountId` — see [vendor-onboarding.md](./vendor-onboarding.md).

**Admin disbursement** (`/api/admin/payments/*`) — **no auth middleware:**
- `GET /` — payment overview
- `GET /:vendorId/payout-orders`
- `POST /:vendorId/disburse-payments`
- `POST /vendor-claims`, `/refund`

Admin transfers to connected accounts via Stripe API in `PaymentController.js`.

---

## Raw body for webhooks

`app.js` `express.json` verify hook saves `req.rawBody` for `/api/payments/webhook` — required for signature validation.

---

## Mental model

```
Frontend chooses path → Path B (partial) is production booking flow
Webhook (Path C) → parallel, may not update same bookings
Admin payouts → separate Stripe transfer flow
```

---

## Related

- [partial-payment-and-reminders.md](./partial-payment-and-reminders.md)
- [booking-lifecycle.md](./booking-lifecycle.md)
- [payments-and-webhooks-api.md](../04-api-reference/payments-and-webhooks-api.md)
