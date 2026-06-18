# Flow: Notifications and Email

Two channels: **in-app/FCM push** and **SMTP email**. Toggle behavior differs by role.

---

## In-app notifications

Model: `Notification` — bilingual `title`/`message`, `notificationFor`: `Client` | `Vendor` | `Admin`, read flags.

**Creation:** `notificationController.createNotification` — writes DB record. **FCM is separate** — must call `sendPushOnly` or `notifyVendorNewBooking` to actually push.

### Client endpoints

`GET /api/notifications` — `requireAuth` — lists notifications for `req.user.id` where `notificationFor` matches client.

`PATCH /api/notifications/:id/client-read` — mark read.

### Vendor endpoints

`GET /api/notifications/vendor-notifications` — `requireAuth`

`PATCH /api/notifications/:id/read`

### Admin endpoints

`GET /api/notifications/admin-notifications` — **no auth** — returns admin notifications.

`PATCH /api/notifications/read-all` — **no auth**

> **Audit — High:** Public admin notification endpoints. [05-audit-findings.md](../05-audit-findings.md#H-011)

---

## FCM push (`utils/notifications.js`)

Uses Firebase Admin `messaging().send()`. Tokens from `User.appFcm` / `User.webFcm`.

**Common triggers:**
- New booking → vendor (`notifyVendorNewBooking`)
- Booking accept/reject → client
- Payment received → vendor
- Cron auto-cancel → vendor

Checks `User.notifications.push !== false` before sending.

---

## Email (`utils/mailer.js`)

SMTP via `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`.

| Function | Trigger | Recipient |
|----------|---------|-----------|
| `sendOTPEmail` | Registration/forgot OTP | User |
| `sendOrderStatusEmail` | Accept/reject | Client |
| `sendEvenlyoProtectBookingEmail` | NEW, ACCEPTED, REJECTED, RECEIVED | Admin |
| `sendVendorCancellationEmail` | Client cancel | Vendor |
| `sendBookingCompletionEmail` | Vendor marks completed | Client |
| `sendReminderEmail` | Exported but cron uses **duplicate inline templates** | Client |

**Toggle:** `User.notifications.email !== false` (client/vendor). Admin: `AdminEmployee.notificationSettings.email.orderCancellation`, `.evenlyoProtect`, etc.

---

## Cron emails

`corn/paymentReminder.js` has **its own** `sendEmail`, `sendReminderEmail`, `sendVendorCancellationEmail`, `sendAdminCancellationEmail` — duplicate SMTP config, not imported from `utils/mailer.js`.

Verified working in production testing: vendor `qatesting552@gmail.com`, admin `sinan.lakhani09@gmail.com` on auto-cancel.

---

## User notification settings

`GET/PUT /api/settings/notifications` — `requireAuth` — updates `User.notifications.email` / `.push`.

Admin granular settings: `GET /api/admin/settings/notification`, `PATCH /api/admin/settings/notification/update` — `requireAdmin`.

---

## Related

- [partial-payment-and-reminders.md](./partial-payment-and-reminders.md)
- [booking-lifecycle.md](./booking-lifecycle.md)
- [shared-api.md](../04-api-reference/shared-api.md)
