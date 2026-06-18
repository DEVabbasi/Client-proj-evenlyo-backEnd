# API Reference — Vendor

Most routes: `requireAuth`. `requireVendor` on subset.

Flows: [vendor-onboarding](../03-flows/vendor-onboarding.md), [booking-lifecycle](../03-flows/booking-lifecycle.md), [partial-payment](../03-flows/partial-payment-and-reminders.md)

---

## Dashboard `/api/vendor/dashboard`

| GET | `/analytics` | requireAuth | Dashboard metrics |

---

## Listings `/api/vendor/listings`

| GET | `/all`, `/overview`, `/listings/filter` | requireAuth | Vendor listings |
| POST | `/create` | requireAuth | Create listing |
| PUT | `/update/:id` | requireAuth | Update |
| PATCH | `/:id/toggle-status` | requireAuth | Active/inactive |
| DELETE | `/delete/:id` | requireAuth | Delete |

---

## Bookings `/api/vendor/bookings`

| GET | `/details/:bookingId` | requireAuth | Detail |
| GET | `/analytics` | requireAuth | Analytics |
| POST | `/:id/accept` | requireAuth, requireVendor | [Accept](../03-flows/booking-lifecycle.md#2-vendor-accepts) |
| POST | `/:id/reject` | requireAuth | `rejectionReason` |
| POST | `/create-payment-intent` | **Public** | `{ amount, bookingId }` | [Partial pay](../03-flows/partial-payment-and-reminders.md) |
| POST | `/on-payment-success` | **Public** | `{ bookingId, paymentIntent, amount }` |
| GET | `/amount-to-pay/:id` | **Public** | Amount due |

---

## Tracking `/api/vendor/tracking`

| GET | `/` | requireAuth | Vendor bookings list |
| GET | `/purchases` | requireAuth, requireVendor | Sale orders |
| POST | `/:id/mark-on-the-way` | requireAuth, requireVendor | |
| POST | `/:id/mark-picked-up` | requireAuth | `condition`: good/fair/claim |
| POST | `/:id/received-back` | requireAuth, requireVendor | |
| POST | `/:id/mark-completed` | requireAuth, requireVendor | |

---

## Profile `/api/vendor/profile`

| GET | `/` | requireAuth | Full profile |
| PUT | `/update` | requireAuth | Update profile |
| PUT | `/update-delivery-charges` | requireAuth | Delivery fees |
| PUT | `/admin/update/:id` | **Public** | Admin update — no auth |
| POST | `/request-kvk-change` | **Public** | KVK change request |
| POST | `/get-sub-category-by-categoryIds` | **Public** | Subcategories |

---

## Stock `/api/vendor/stock`

| POST | `/event` | requireAuth | Stock event |
| GET | `/table/:type`, `/logs` | requireAuth | Stock views |

---

## Items `/api/vendor/items`

| POST | `/create` | requireAuth | ServiceItem |
| GET | `/overview`, `/item-detail/:itemId` | requireAuth | |
| PUT | `/update/:itemId`, `/update-listing/:itemId` | requireAuth | |
| DELETE | `/delete/:itemId` | requireAuth | |

---

## Item stock `/api/vendor/itemstock`

| POST | `/event` | requireAuth | |
| GET | `/table/:type`, `/logs` | requireAuth | |
| PUT | `/quantity` | requireAuth | |

---

## Earnings `/api/vendor/earnings`

| GET | `/analytics` | requireAuth | Booking earnings |
| GET | `/service/analytics` | requireAuth | Sale item earnings |

---

## Billing `/api/vendor/billing`

| GET | `/invoices` | requireAuth | Invoice list |
| GET | `/invoice/:invoiceId/download` | requireAuth | PDF (may be dead code after module.exports) |

---

## Roles `/api/vendor/roles`

| GET | `/designations` | requireAuth, requireVendor | |
| POST | `/admin/create-designation` | requireAuth, requireVendor | |
| POST | `/role-users` | requireAuth | Create employee |
| GET | `/role-users` | requireAuth | List employees |
| DELETE | `/designations/:id`, `/role-users/:id` | requireAuth | |
| PUT | `/designations/:id`, `/role-users/:id` | requireAuth | |
| POST | `/register-vendor-from-role` | **Public** | |

---

## Designations (alternate mount) `/api`

| POST | `/vendor/create-designation` | **Public** | |
| GET | `/vendor/fetch-designations/:id` | **Public** | |
| PUT | `/vendor/update-designation/:id` | **Public** | |
| DELETE | `/vendor/delete-designation/:id` | **Public** | |

---

## Language `/api/vendor/language`

| POST | `/translate` | **Public** | OpenAI translation |

---

## Booking routes on client mount

| GET | `/api/booking/pending` | requireAuth, requireVendor | Pending list |
| GET | `/api/booking/vendor-history` | requireAuth, requireVendor | History |

---

## Notifications

| GET | `/api/notifications/vendor-notifications` | requireAuth | |
| PATCH | `/api/notifications/:id/read` | requireAuth | |

---

## Sale orders

| GET | `/api/vendor-order-history` | requireAuth | Vendor sale history |
| POST | `/api/update-order-status/:orderId` | requireAuth | Fulfillment status |
