# Flow: Partial Payment and Reminders

How upfront payments, remaining balances, email reminders, and **auto-cancel** work. This is tightly coupled to [booking-lifecycle.md](./booking-lifecycle.md) — read that first for request/accept context.

---

## Payment policy source

When a booking is created, `getListingPaymentPolicy` reads the listing's **SubCategory**:

- `isUpfrontEnabled`, `upfrontFeePercent` — e.g. pay 87% now
- `escrowHours` — documented in policy response
- `isEvenlyoProtectEnabled`, `evenlyoProtectFeePercent`

The booking stores `willPayUpfront`, `AmountLeft`, `pricingBreakdown.upfrontFee`, `isUpfrontPaid`, `isFullyPaid`.

---

## Payment after accept

**Primary path (escrow/partial)** — used by staging/production client apps:

### Get amount due

`GET /api/vendor/bookings/amount-to-pay/:id` — **no auth**

Logic (`getAmountToPay`):
- Not upfront → `AmountLeft`
- Upfront, not yet paid → `pricingBreakdown.upfrontFee`
- Upfront already paid → `AmountLeft` (remainder)

### Create Stripe PaymentIntent

`POST /api/vendor/bookings/create-payment-intent` — **no auth**

Body: `{ amount, bookingId }`. Blocks if event start datetime passed. Creates Stripe PI.

> **Audit — Critical:** No booking ownership check — anyone with `bookingId` can create intents. [05-audit-findings.md](../05-audit-findings.md#C-003)

### Confirm payment (client callback)

`POST /api/vendor/bookings/on-payment-success` — **no auth**

`paymentConfirmation` (`controllers/vendor/bookingAnalytics.js`):

1. Validates `bookingId`, `paymentIntent`, `amount`
2. Prevents duplicate PI in `booking.payments[]`
3. Prevents overpayment vs `pricingBreakdown.total`
4. Classifies: `advance` | `remaining` | `full`
5. Updates `AmountPaid`, `AmountLeft`, pushes to `payments[]`
6. If fully paid: `isFullyPaid = true`, `paymentStatus = "paid"`
7. Else: `paymentStatus = "upfront_paid"`, `isUpfrontPaid = true`
8. Vendor push notification

**Does not set `booking.status = "paid"`** — status may stay `"accepted"` while `paymentStatus` changes.

**Models:** `BookingRequest`, `User`, `Notification`

> **Audit — High:** Unauthenticated payment confirmation — fake payments possible. [05-audit-findings.md](../05-audit-findings.md#C-003)

**After upfront pay:** Client can proceed only after **full** `paymentStatus: "paid"` for tracking (`mark-on-the-way` gate).

---

## Legacy full-payment path (still in code)

| Step | Endpoint | Auth |
|------|----------|------|
| Create PI | `POST /api/booking/:id/create-payment-intent` | `requireAuth`, `requireClient` |
| Mark paid | `POST /api/booking/:id/pay` | `requireAuth`, `requireClient` |

`markBookingAsPaid` sets `status = "paid"` **without verifying Stripe** — client can mark paid without paying.

> **Audit — Critical:** [05-audit-findings.md](../05-audit-findings.md#C-004)

Charges full `pricing.totalPrice` — ignores upfront split.

---

## Cron: reminders and auto-cancel

**Trigger:** Server boot loads `corn/paymentReminder.js`  
**Schedule:** `0 */5 * * *` (every 5 hours at minute 0)

> **Discrepancy vs `PARTIAL_PAYMENT_FLOW_AUDIT.md`:** That doc may describe different timing — **verified in code:** every 5 hours, not daily midnight. Comment in file says "daily at midnight" — wrong.

**Query:** `paymentStatus: "upfront_paid"`, `isFullyPaid: false`, `status` not `cancelled`/`rejected`

For each booking with `details.startDate`:

| Condition | Action |
|-----------|--------|
| Event is 3 days away (`diffDays === 3`) and `!reminder3DaysSent` | Email client reminder, set flag |
| Event is 1 day away and `!reminder1DaysSent` | Urgent email + cancellation warning, set flag |
| **Now is after event date** and still not fully paid | Auto-cancel (below) |

### Reminder emails

Sent via **inline Nodemailer** in cron file (not `utils/mailer.sendReminderEmail`). Dutch content. Pay link: `https://evenlyo.nl/pay/{bookingId}`.

### Auto-cancel

When `now.isAfter(eventDate)`:

1. `status = "cancelled"`
2. `paymentStatus` unchanged (stays `upfront_paid` for partial-pay bookings)
3. `StockLog` checkin (note: may not restore `listing.quantity`)
4. Vendor FCM push (if `notifications.push`)
5. Vendor email `sendVendorCancellationEmail` (cron-local copy)
6. Admin email if `AdminEmployee.notificationSettings.email.orderCancellation`

Log: `❌ Booking Auto-Cancelled: {bookingId}`

> **Audit — High:** 1-day email warns cancel "before event" but code cancels **after** event date. [05-audit-findings.md](../05-audit-findings.md#H-009)

> **Audit — Medium:** `listing.quantity` not incremented on cron cancel (only StockLog). [05-audit-findings.md](../05-audit-findings.md#M-012)

**Different from client cancel** ([booking-lifecycle.md](./booking-lifecycle.md#7-client-cancel-manual)): 30-minute window, restores quantity, uses `utils/mailer.sendVendorCancellationEmail`.

---

## Testing auto-cancel (operational note)

To test in dev: temporarily change cron to `* * * * *`, set booking `details.startDate` to yesterday, `paymentStatus: upfront_paid`, `isFullyPaid: false`. **Revert cron after testing.**

---

## Field reference

| Field | Meaning |
|-------|---------|
| `willPayUpfront` | SubCategory policy applies |
| `isUpfrontPaid` | At least advance received |
| `isFullyPaid` | Total settled |
| `AmountPaid` / `AmountLeft` | Running totals |
| `payments[]` | Audit of each Stripe PI |
| `reminder3DaysSent` / `reminder1DaysSent` | Cron idempotency |

---

## Related

- [booking-lifecycle.md](./booking-lifecycle.md)
- [payments-and-stripe.md](./payments-and-stripe.md)
- [notifications-and-email.md](./notifications-and-email.md)
