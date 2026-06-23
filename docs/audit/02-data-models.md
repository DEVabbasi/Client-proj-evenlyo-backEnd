# 02 — Data Models

34 Mongoose models in `models/`. The booking model is registered as **`BookingRequest`** but the file is `Booking.js` — you'll see `require('../models/Booking')` everywhere.

---

## Core domain (transaction path)

### User (`users`)

Central identity. Fields that matter:

- `userType`: `client` | `vendor` | `admin`
- `accountType`: `personal` | `business` (vendors)
- `provider`: `email` | `google`
- `notifications`: `{ email, push }` — coarse toggles
- `stripeAccountId`, `stripeOnboardingComplete` — Stripe Connect on **User**, not Vendor
- `appFcm`, `webFcm` — FCM device tokens

### Vendor (`vendorDetails` collection)

Business profile linked 1:1 via `userId` → `User`.

- `businessName`, `businessEmail`, categories, `isApproved` (default `true` in schema; registration sets `false`)
- Embedded `reviews[]` — duplicates standalone `Review` collection

### Category → SubCategory

Taxonomy for listings. **SubCategory** holds payment policy:

- `isUpfrontEnabled`, `upfrontFeePercent`, `escrowHours`
- `isEvenlyoProtectEnabled`, `evenlyoProtectFeePercent`

### Listing (`listings`)

Bookable service catalog. Vendor = `User` ref.

- `status`: `draft` | `pending` | `active` | `inactive` | `suspended`
- `pricing`: per hour/day/event, security fee, km rate
- `quantity` — stock for rental items
- Bilingual `title`, `description` (`en` / `nl`)

### BookingRequest (`bookingrequests`)

**The main transaction record.** File: `models/Booking.js`, model name: `BookingRequest`.

Key fields:

| Field | Purpose |
|-------|---------|
| `trackingId` | Public tracking code (`TRK...`) |
| `userId` | Client (`User`) |
| `vendorId` | Vendor (`User` — **not** Vendor doc) |
| `listingId` | Listing ref |
| `status` | Lifecycle — see enum below |
| `paymentStatus` | `pending` \| `paid` \| `upfront_paid` \| `refunded` \| … |
| `isFullyPaid`, `isUpfrontPaid`, `AmountPaid`, `AmountLeft` | Partial payment tracking |
| `payments[]` | `{ paymentIntentId, amount, type: advance\|remaining\|full, status }` |
| `pricingBreakdown` | Server/client calculated fees, Evenlyo Protect |
| `details.startDate` | Event date — **cron uses this** for reminders/cancel |
| `reminder3DaysSent`, `reminder1DaysSent` | Cron idempotency flags |
| `statusHistory[]` | Audit trail of status changes |
| `claimDetails` | Evenlyo Protect / damage claims |
| `listingDetails` | Snapshot at booking time |

**Status enum:** `pending`, `accepted`, `rejected`, `paid`, `on_the_way`, `received`, `picked_up`, `completed`, `cancelled`, `claim`, `finished`, `received_back`, `complain`

### ServiceItem (`serviceitems`) + saleorders (`saleorders`)

**Buy** path (not rental). `SaleItemPurchase.js` exports model `saleorders`.

- `ServiceItem`: `stockQuantity`, prices, vendor = `User`
- `saleorders`: `items[]`, `totalAmount`, `status`: `Order Placed` \| `On the way` \| `Delivered`

### Cart (`carts`)

One cart per user (`userId` unique). Items hold `listingId`, `tempDetails`, `listingSnapshot`.

### PaymentIntent (`paymentintents`)

Stripe PI mapping: `stripeIntentId`, `amount`, `paymentPurpose`, refs to booking/listing/user.

Only Path C payments (generic `/api/payments/create-payment-intent`) populate this — webhook updates through here.

---

## Supporting models

| Model | Collection | Purpose |
|-------|------------|---------|
| Settings | settings | Singleton platform config (fees, VAT, app versions) — seeded by `ensureAppSettings()` |
| OTP | otps | Email OTP with TTL index |
| Notification | notifications | In-app + push metadata (bilingual) |
| Review | reviews | Standalone reviews (also embedded elsewhere) |
| StockLog | stocklogs | Listing inventory audit |
| ServiceItemStockLog | serviceitemstocklogs | ServiceItem inventory audit |
| ActivityLog | activitylogs | Vendor dashboard feed |
| Conversation / Message | conversations / message | Primary chat |
| ChatRoom | chatrooms | Legacy chat |
| SupportTicket | supporttickets | User support |
| ChatbotTicket | chatbottickets | Anonymous chatbot inquiries |
| Plan / Billing | plans / billings | Vendor subscriptions |
| Blog / FAQ / QnA | blogs / faqs / qnas | CMS + chatbot knowledge |
| AdminEmployee | adminemployees | Admin panel auth (separate from User) |
| Employee | employees | Vendor staff |
| Role / Designation / VendorDesignation / AdminDesignation | various | **Three parallel RBAC systems** |

---

## Relationship diagram

```
Category ──1:N──► SubCategory
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
      Listing    ServiceItem    (payment policy)
         │            │
    User(vendor)  User(vendor)
         │            │
         └─────┬──────┘
               ▼
            User (client)
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
  Cart    BookingRequest  saleorders
               │
         PaymentIntent (optional)
```

**BookingRequest** references:
- `userId` → User (client)
- `vendorId` → User (vendor) — **not** Vendor document
- `listingId` → Listing

**Vendor profile** is separate: `Vendor.userId` → User.

---

## Known schema inconsistencies

Verified against current models — these cause real bugs:

| Issue | Impact |
|-------|--------|
| `ref: 'Booking'` in Listing, Review, Vendor reviews | Populate fails — model is `BookingRequest` |
| `vendorId` sometimes User, sometimes Vendor doc | Wrong queries in several controllers |
| `trackingId` sub-schema in Booking.js | Likely copy-paste bug — field should be plain String |
| `Vendor` index on `approvalStatus` | Field is `isApproved` — index is dead |
| `FAQ` indexes on `category`, `order` | Fields don't exist in schema |
| Reviews in 3 places | `Review` collection + embedded in Listing + Vendor |
| Dual chat: Conversation+Message vs ChatRoom | Unclear which frontend uses which |

> Full risk register: [05-audit-findings.md](./05-audit-findings.md)

---

## Important enums quick reference

**Booking `paymentStatus`:** `pending`, `paid`, `refunded`, `partially_refunded`, `upfront_paid`

**Booking `payments[].type`:** `advance`, `remaining`, `full`

**StockLog `type`:** `checkin`, `checkout`, `missing`, `stockin`, `stockout`

**AdminEmployee `role`:** `Admin`, `Employee`

---

## Related docs

- [03-flows/booking-lifecycle.md](./03-flows/booking-lifecycle.md)
- [03-flows/partial-payment-and-reminders.md](./03-flows/partial-payment-and-reminders.md)
- [03-flows/sale-item-orders.md](./03-flows/sale-item-orders.md)
