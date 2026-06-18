# Flow: Sale Item Orders

**Separate from rental bookings.** Clients buy physical/service inventory (`ServiceItem`) with immediate payment — no accept/reject, no tracking statuses like `on_the_way`.

Model: `saleorders` (file `SaleItemPurchase.js`).

---

## Browse items

`GET /api/items/list` — public — `getItemsByCategory` — lists `ServiceItem` by category.

Vendor manages items: `/api/vendor/items/*`

---

## Place order

`POST /api/client/purchases/place-order` — `requireAuth`  
Also: `POST /api/sale-item-purchase` — `requireAuth` (duplicate mount)

`createSaleItemOrder` in purchase controller:
1. Validates items, stock
2. Creates `saleorders` document with `trackingId`, `items[]`, `totalAmount`
3. Decrements `ServiceItem.stockQuantity`
4. `ServiceItemStockLog` checkout
5. Vendor notification + activity log

Payment may use Stripe PI from `ItemController.createItemPaymentIntent` (commented routes in `Items.js` — verify active path in controller).

---

## Vendor fulfillment

`POST /api/update-order-status/:orderId` — `requireAuth`

Statuses: `Order Placed` → `On the way` → `Delivered`

`GET /api/vendor-order-history` — vendor view  
`GET /api/sale-item-history` — client view

Admin: `GET /api/admin/tracking/sale`

---

## vs Booking flow

| | Booking (rental) | Sale item |
|--|------------------|-----------|
| Model | `BookingRequest` | `saleorders` |
| Vendor accept | Required | No |
| Partial pay | Common | Full pay typical |
| Tracking | Rich status machine | 3 order statuses |
| Stock model | `Listing.quantity` | `ServiceItem.stockQuantity` |

---

## Related

- [listing-lifecycle.md](./listing-lifecycle.md)
- [payments-and-stripe.md](./payments-and-stripe.md)
- [client-api.md](../04-api-reference/client-api.md)
