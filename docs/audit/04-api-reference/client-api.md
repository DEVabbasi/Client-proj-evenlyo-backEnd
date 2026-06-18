# API Reference — Client

Auth: `requireAuth` + usually `requireClient` unless noted.

Flow docs: [booking-lifecycle](../03-flows/booking-lifecycle.md), [sale-item-orders](../03-flows/sale-item-orders.md), [partial-payment](../03-flows/partial-payment-and-reminders.md)

---

## Booking `/api/booking`

| Method | Path | Auth | Body / params | Flow |
|--------|------|------|---------------|------|
| POST | `/request` | requireAuth, requireClient | `listingId`, `vendorId`, `details` (dates, location, times), `pricingBreakdown`, `distanceKm`, … | [booking](../03-flows/booking-lifecycle.md#1-create-booking-request) |
| GET | `/accepted` | requireAuth, requireClient | — | Awaiting payment |
| POST | `/:id/pay` | requireAuth, requireClient | `transactionId?` | Legacy mark paid |
| POST | `/:id/create-payment-intent` | requireAuth, requireClient | — | Legacy Stripe PI |
| GET | `/history` | requireAuth | query pagination | |
| GET | `/:id` | requireAuth | — | Details |
| GET | `/:id/details` | requireAuth | — | Simple details |
| GET | `/:id/track` | requireAuth | — | Tracking summary |
| GET | `/:id/direction` | requireAuth | — | Map coords |
| POST | `/:id/mark-received` | requireAuth | — | [tracking](../03-flows/booking-lifecycle.md#5-client-marks-received) |
| POST | `/:id/mark-finished` | requireAuth, requireClient | — | Service complete |
| POST | `/:id/cancel` | requireAuth, requireClient | `reason?` | [cancel](../03-flows/booking-lifecycle.md#7-client-cancel-manual) |
| POST | `/:id/claim` | requireAuth | `reason`, `claimType` | [claims](../03-flows/reviews-and-claims.md) |
| POST | `/:id/review` | requireAuth | `rating`, `review` {en,nl} | [reviews](../03-flows/reviews-and-claims.md) |
| GET | `/:id/restock-again` | requireAuth | — | Restock helper |

---

## Cart `/api/cart`

| Method | Path | Auth | Body |
|--------|------|------|------|
| POST | `/add` | requireAuth, requireClient | `listingId`, details |
| POST | `/wishlist` | requireAuth, requireClient | wishlist item |
| GET | `/` | requireAuth | — |
| PUT | `/update/:listingId` | requireAuth, requireClient | quantity/details |
| DELETE | `/remove/:listingId` | requireAuth, requireClient | — |
| DELETE | `/` | requireAuth, requireClient | Clear cart |
| POST | `/submit` | requireAuth, requireClient | — |

---

## Purchases `/api/client/purchases`

| POST | `/place-order` | requireAuth | Sale item order — [sale-item flow](../03-flows/sale-item-orders.md) |

## Sale items `/api`

| POST | `/sale-item-purchase` | requireAuth | Alternate place order |
| GET | `/sale-item-history` | requireAuth | Client order history |

---

## Support `/api/support`

| POST | `/ticket` | requireAuth | `issueRelatedTo`, `details`, `trackingId?` |

---

## Settings `/api/settings`

| GET/PUT | `/personal-info` | requireAuth | Profile |
| PUT | `/change-password` | requireAuth | `currentPassword`, `newPassword` |
| GET/PUT | `/notifications` | requireAuth | `{ email, push }` toggles |

---

## Vendor profile (client mount) `/api/vendor`

| GET | `/vendorprofile` | requireAuth, requireVendor | Own profile |
| PUT | `/vendorprofile` | requireAuth, requireVendor | Update |
| GET | `/business-details` | requireAuth, requireVendor | |
| GET | `/dashboard` | requireAuth, requireVendor | Dashboard summary |

---

## Notifications `/api/notifications`

| GET | `/` | requireAuth | Client notifications |
| PATCH | `/:id/client-read` | requireAuth | Mark read |
