# Flow: Booking Lifecycle

The rental/booking happy path from client request through fulfillment. For **partial payments, reminders, and auto-cancel**, see [partial-payment-and-reminders.md](./partial-payment-and-reminders.md) (cross-linked throughout).

---

## Status machine (simplified)

```
pending → accepted → (payment) → on_the_way → received → finished | picked_up → received_back → completed
         ↘ rejected                    ↘ complain (claim)
         ↘ cancelled (client or cron)
```

`paymentStatus` (`upfront_paid`, `paid`) runs parallel to `status` — tracking gates often check `paymentStatus`, not `status`.

---

## 1. Create booking request

**Trigger:** Client submits booking from listing page or cart.

`POST /api/booking/request`  
Middleware: `requireAuth`, `requireClient`  
Controller: `createBookingRequest` (`controllers/client/bookingController.js`)

**What happens:**

1. Validates `listingId`, `vendorId`, dates, `eventLocation`, `distanceKm > 0`
2. Time rules (Europe/Amsterdam): no past dates; same-day ≥2 hours ahead
3. Loads listing — must be `status: "active"`, `isActive: true`
4. `checkListingStock` — quantity check only (**stock not decremented yet**)
5. `resolveVendorUserId` — ensures vendor owns listing
6. Pricing via `calculateFullBookingPrice` + platform fee from `Settings`
7. Creates `BookingRequest` with `status: "pending"`, snapshots `listingDetails`, stores `pricingBreakdown` from request body
8. Removes listing from client's `Cart`
9. `notifyVendorNewBooking` → in-app `Notification` + **FCM push** to vendor
10. If Evenlyo Protect: admin notification + `sendEvenlyoProtectBookingEmail` (`NEW`)

**Models:** `BookingRequest`, `Listing`, `User`, `Cart`, `Settings`, `Notification`

**Response:** `{ success, data: { bookingRequest, paymentPolicy: { upfrontFeePercent, upfrontAmount, remainingAmount, ... } } }`

> **Audit — Medium:** `checkAvailability` imported but **not called** at create. Client-supplied `pricingBreakdown` trusted for platform fee. [05-audit-findings.md](../05-audit-findings.md#M-010)

---

## 2. Vendor accepts

**Trigger:** Vendor taps Accept on pending booking.

`POST /api/vendor/bookings/:id/accept`  
Middleware: `requireAuth`, `requireVendor`  
Controller: `acceptBooking` (`controllers/vendor/bookingAnalytics.js`)

1. Loads `Vendor` by `req.user.id`, finds booking where `vendorId: vendor.userId`, `status: "pending"`
2. Stock check + `$inc listing.quantity: -1`
3. `StockLog` type `checkout`
4. `status = "accepted"` (pre-save hook appends `statusHistory`)
5. Activity log `booking_accepted`
6. Client notification + optional `sendOrderStatusEmail` (`ACCEPTED`)
7. Evenlyo Protect: admin email `ACCEPTED`

**Models:** `BookingRequest`, `Listing`, `StockLog`, `User`, `Vendor`

> **Audit — Medium:** Date availability check **commented out** at accept. `getPendingBookings` may query wrong `vendorId` (Vendor doc vs User id). [05-audit-findings.md](../05-audit-findings.md#M-011)

**Next:** Client pays — see [partial-payment-and-reminders.md](./partial-payment-and-reminders.md#payment-after-accept).

---

## 3. Vendor rejects

`POST /api/vendor/bookings/:id/reject`  
Middleware: `requireAuth` only (**missing `requireVendor`**)

Sets `status: "rejected"`, `rejectionReason`. Client email/push. Evenlyo Protect admin alert.

Uses `vendorId: vendor._id` in query — **inconsistent** with accept which uses `vendor.userId`.

> **Audit — Medium:** [05-audit-findings.md](../05-audit-findings.md#M-011)

---

## 4. Tracking — vendor on the way

**Requires:** `paymentStatus: "paid"` (full payment — partial upfront alone is **not** enough)

`POST /api/vendor/tracking/:id/mark-on-the-way`  
Middleware: `requireAuth`, `requireVendor`

Sets `status: "on_the_way"`. In-app notification to client. No email.

> **Worth noting:** If client only paid upfront (`upfront_paid`), this endpoint returns an error until remaining balance is paid.

---

## 5. Client marks received

`POST /api/booking/:id/mark-received`  
Middleware: `requireAuth`

Requires `status: "on_the_way"`. Sets `status: "received"`. Vendor notification. Evenlyo Protect admin email `RECEIVED`.

---

## 6. Completion paths

### Service (human) — client marks finished

`POST /api/booking/:id/mark-finished`  
Requires `status` in `["received", "picked_up"]` → `status: "finished"`

### Rental — vendor pickup and return

| Step | Endpoint | New status |
|------|----------|------------|
| Vendor picks up | `POST /api/vendor/tracking/:id/mark-picked-up` | `picked_up` or `claim` |
| Vendor receives item back | `POST /api/vendor/tracking/:id/received-back` | `received_back` |
| Vendor completes | `POST /api/vendor/tracking/:id/mark-completed` | `completed` |

`mark-completed`: restores listing `quantity +1`, `StockLog` checkin, `sendBookingCompletionEmail` to client.

---

## 7. Client cancel (manual)

`POST /api/booking/:id/cancel`  
Middleware: `requireAuth`, `requireClient`

Eligible: `status` in `["pending", "accepted", "paid"]` within **30 minutes** of `createdAt`.

Sets `status: "cancelled"`, restores stock, `sendVendorCancellationEmail` to vendor if `notifications.email` enabled.

**Different from cron cancel** — see [partial-payment-and-reminders.md](./partial-payment-and-reminders.md#auto-cancel).

---

## 8. Client views booking

| Endpoint | Purpose |
|----------|---------|
| `GET /api/booking/:id` | Full details |
| `GET /api/booking/:id/track` | Summary for tracking UI |
| `GET /api/booking/:id/direction` | Map coordinates |
| `GET /api/booking/history` | Client history |
| `GET /api/booking/vendor-history` | Vendor history (`requireVendor`) |

> **Audit — High:** `getVendorActionButtons` referenced without import — runtime error on vendor history. [05-audit-findings.md](../05-audit-findings.md#H-008)

---

## Role intersections

| Action | Client sees | Vendor sees | Admin sees |
|--------|-------------|-------------|------------|
| Request created | Pending in history | Push + notification | Evenlyo Protect email if enabled |
| Accepted | Email + notification | Stock reduced | — |
| Paid | Payment confirmed | Payment notification | — |
| On the way | Tracking updates | — | Tracking dashboard |
| Cancelled (client) | Cancelled | Cancellation email | — |
| Cancelled (cron) | Cancelled | Email + push | Email if toggle on |

Admin can override any status: `PATCH /api/admin/tracking/:trackingId/status` — [admin-moderation.md](./admin-moderation.md).

---

## Related

- [partial-payment-and-reminders.md](./partial-payment-and-reminders.md)
- [payments-and-stripe.md](./payments-and-stripe.md)
- [reviews-and-claims.md](./reviews-and-claims.md)
- [notifications-and-email.md](./notifications-and-email.md)
