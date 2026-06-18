# Flow: Reviews and Claims

Post-booking feedback and dispute handling.

---

## Reviews

`POST /api/booking/:id/review` — `requireAuth`

Creates `Review` document linked to `bookingId`, `vendorId`, rating + bilingual text.

**Gaps verified in code:**
- No duplicate-review check
- No requirement for `status: completed`
- No strict booking ownership validation

> **Audit — Medium:** [05-audit-findings.md](../05-audit-findings.md#M-013)

Reviews also embedded in `Listing.reviews[]` and `Vendor.reviews[]` — three storage locations can drift.

---

## Claims / complaints

`POST /api/booking/:id/claim` — `requireAuth`

Body: `reason`, `claimType`

Requires `status` in `["received", "finished", "paid"]`.

Sets `status: "complain"`, populates `claimDetails`.

Creates `SupportTicket`. Notifies admin + vendor.

**Email:** TODO in code — claim email **not implemented**.

---

## Evenlyo Protect

Enabled per SubCategory (`isEvenlyoProtectEnabled`). Fee in `pricingBreakdown.evenyloProtectFee`.

**Admin notifications:**
- Booking create → `sendEvenlyoProtectBookingEmail` `NEW`
- Accept/reject → `ACCEPTED` / `REJECTED`
- Client marks received → `RECEIVED`

Checks `AdminEmployee.notificationSettings.email.evenlyoProtect` and push toggle.

---

## Vendor pickup with claim condition

`POST /api/vendor/tracking/:id/mark-picked-up`

Body `condition`: `good` | `fair` | `claim`

If `claim` → may set booking to claim flow + admin support ticket.

---

## Related

- [booking-lifecycle.md](./booking-lifecycle.md)
- [support-and-chatbot.md](./support-and-chatbot.md)
- [notifications-and-email.md](./notifications-and-email.md)
