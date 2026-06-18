# API Reference — Payments and Webhooks

Flow: [payments-and-stripe.md](../03-flows/payments-and-stripe.md), [partial-payment-and-reminders.md](../03-flows/partial-payment-and-reminders.md)

---

## Generic payments `/api/payments`

| Method | Path | Auth | Body | Response | Notes |
|--------|------|------|------|----------|-------|
| POST | `/create-payment-intent` | **Public** | `amount`, `currency?`, `bookingId?`, `listingId?`, `userId?`, `paymentPurpose?` | `{ clientSecret, internalId }` | Creates `PaymentIntent` doc |
| GET | `/get-payment-intent/:internalId` | **Public** | — | PI details | |
| POST | `/create-subscription` | **Public** | plan/vendor fields | Subscription client secret | Vendor plans |
| POST | `/webhook` | Stripe signature | Raw Stripe event body | `{ received: true }` | Uses `req.rawBody` |

### Webhook events handled

- `payment_intent.succeeded` → updates `PaymentIntent` + may set `booking.status/paymentStatus` to `paid`
- `payment_intent.payment_failed`
- `payment_intent.requires_action`

> Only bookings linked via Path C `PaymentIntent` collection get webhook updates.

---

## Booking payment (client legacy) `/api/booking`

| POST | `/:id/create-payment-intent` | requireAuth, requireClient | Full price PI |
| POST | `/:id/pay` | requireAuth, requireClient | Mark paid without Stripe verify |

---

## Booking payment (escrow) `/api/vendor/bookings`

| GET | `/amount-to-pay/:id` | **Public** | `{ amount, type }` |
| POST | `/create-payment-intent` | **Public** | `{ amount, bookingId }` |
| POST | `/on-payment-success` | **Public** | `{ bookingId, paymentIntent, amount }` |

---

## Admin payouts `/api/admin/payments`

See [admin-api.md](./admin-api.md) — all **unauthenticated**.

---

## Stripe Connect `/api/auth/vendor/stripe`

| POST | `/connect` | requireAuth | Create Express account |
| GET | `/onboarding-link` | requireAuth | Hosted onboarding URL |
| GET | `/onboarding-status` | requireAuth | Poll status |

---

## Environment

- `STRIPE_SECRET_KEY` — API calls
- `STRIPE_WEBHOOK_SECRET` — webhook verification (if unset, verification skipped)
