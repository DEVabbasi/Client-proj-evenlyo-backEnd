# Flow: Listing Lifecycle

How services get onto the marketplace and how clients find them.

---

## Taxonomy (admin-managed)

**Categories:** `GET /api/categories` (public)

**SubCategories:** `GET /api/subcategories`, `GET /api/subcategories/category/:categoryId`

SubCategory holds **payment policy** (upfront %, Evenlyo Protect) used at booking time.

**Admin listing management** (`/api/admin/listing/*`) — **mostly unauthenticated:**
- Stats, subcategory CRUD, toggle subcategories
- See [admin-moderation.md](./admin-moderation.md)

> **Audit — Critical:** Unauthenticated admin listing routes. [05-audit-findings.md](../05-audit-findings.md#C-001)

---

## Vendor creates listing

`POST /api/vendor/listings/create` — `requireAuth`

Controller sets vendor from `req.user.id`, bilingual fields, pricing, category refs, images (URLs), availability, `quantity` for stock.

**Other vendor listing routes:**
- `GET /api/vendor/listings/all`, `/overview`, `/listings/filter`
- `PATCH /api/vendor/listings/:id/toggle-status`
- `PUT /api/vendor/listings/update/:id`
- `DELETE /api/vendor/listings/delete/:id`

---

## Client discovery (public)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/listings` | Paginated listings |
| `GET /api/listings/search` | Text search |
| `GET /api/listings/filter` | Filters |
| `GET /api/listings/featured`, `/popular` | Curated |
| `POST /api/listings/homeData` | Home page bundle |
| `GET /api/listings/:id` | Detail |
| `GET /api/listings/:id/availability` | Date availability |
| `GET /api/listings/calendar/:id` | Calendar view |
| `GET /api/listings/vendor/:vendorId` | By vendor |

`utils/bookingUtils.checkAvailability` implements overlap logic — **not always called** at booking create (see booking flow).

---

## Cart staging

Client adds listing to cart before formal booking:

`POST /api/cart/add` — `requireAuth`, `requireClient`

`POST /api/cart/submit` — may trigger booking request flow or checkout.

Booking create removes item from cart.

---

## Stock

Listing `quantity` decremented on **vendor accept**, restored on **client cancel** (30 min) and **vendor complete**. Cron auto-cancel may only write `StockLog` without restoring quantity — see [partial-payment-and-reminders.md](./partial-payment-and-reminders.md).

Vendor manual stock: `POST /api/vendor/stock/event`

---

## Related

- [booking-lifecycle.md](./booking-lifecycle.md)
- [vendor-onboarding.md](./vendor-onboarding.md)
