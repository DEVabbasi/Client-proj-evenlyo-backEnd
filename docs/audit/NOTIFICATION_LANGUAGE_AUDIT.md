# Notification & Email Language Audit

**Date:** 2026-08-12
**Scope:** All in-app notifications (FCM push + in-app DB notifications) and all emails sent by the Evenlyo backend.
**Purpose:** Identify which notifications/emails are sent in English vs Dutch, and document the root cause of the user receiving an English "booking accepted" notification.

---

## 1. Executive Summary

A user reported receiving an **in-app notification in English** for a **booking accepted** event. Investigation found the root cause:

### Root Cause: `pickBestText` prefers English

In `controllers/notificationController.js` (lines 99–103), the `pickBestText` function used by `sendPushOnly` to select the FCM push title/body is:

```js
const pickBestText = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.en || value.nl || "";   // ⚠️ English is preferred over Dutch
};
```

This means **every** push notification that stores a bilingual `{ en, nl }` object will always display in **English** to the end user, regardless of the user's language preference. The same English-preference logic exists in `utils/notifications.js` (lines 4–8) and `utils/notifyVendorNewBooking.js` (lines 3–7).

### Emails
**All emails are in Dutch.** No English emails were found. The email templates in `utils/mailer.js` and `corn/paymentReminder.js` are fully written in Dutch.

---

## 2. In-App Notifications (FCM Push + In-App DB)

### 2.1 Bilingual Notifications (have both `en` and `nl`)

These notifications store a `{ en, nl }` object. **However, due to `pickBestText` preferring `en`, the push notification always displays in English.** The in-app DB notification stores both languages.

| # | File | Function / Event | Title (EN) | Title (NL) | Recipient |
|---|------|------------------|------------|------------|-----------|
| 1 | `controllers/vendor/bookingAnalytics.js` | `acceptBooking` | "Booking Status" | "Boekingstatus" | Client |
| 2 | `controllers/vendor/bookingAnalytics.js` | `rejectBooking` | "Booking Status" | "Boekingstatus" | Client |
| 3 | `controllers/vendor/bookingAnalytics.js` | `acceptBooking` (Evenlyo Protect) | "Evenlyo protected booking accepted" | "Door Evenlyo beschermde boeking geaccepteerd" | Admin |
| 4 | `controllers/vendor/bookingAnalytics.js` | `rejectBooking` (Evenlyo Protect) | "Evenlyo protected booking rejected" | "Door Evenlyo beschermde boeking geweigerd" | Admin |
| 5 | `controllers/vendor/bookingAnalytics.js` | `paymentConfirmation` (full) | "Payment Status" | "Betalingstatus" | Vendor |
| 6 | `controllers/vendor/bookingAnalytics.js` | `paymentConfirmation` (partial) | "Payment Status" | "Betalingstatus" | Vendor |
| 7 | `controllers/client/bookingController.js` | `createBookingRequest` | "New Booking Request" | "Nieuwe boekingsaanvraag" | Vendor |
| 8 | `controllers/client/bookingController.js` | `createBookingRequest` (Evenlyo Protect) | "Evenlyo protected booking" | "Door Evenlyo beschermde boeking" | Admin |
| 9 | `controllers/client/bookingController.js` | `markBookingReceived` | "Booking Received by Client" | "Boeking ontvangen door klant" | Vendor |
| 10 | `controllers/client/bookingController.js` | `markBookingFinished` | "Booking Completed By the client" | "Boeking voltooid door de klant" | Vendor |
| 11 | `controllers/client/bookingController.js` | `createClaim` (Admin) | "New Support Ticket Created, Against Tracking ID ..." | "Nieuw supportticket aangemaakt, met betrekking tot tracking-ID ..." | Admin |
| 12 | `controllers/client/bookingController.js` | `createClaim` (Vendor) | "New Support Ticket Created By Client" | "Nieuw supportticket aangemaakt door de klant" | Vendor |
| 13 | `controllers/vendor/trackingController.js` | `markBookingOnTheWay` | "Your booking is on the way!" | "Uw boeking is onderweg!" | Client |
| 14 | `controllers/vendor/trackingController.js` | `markBookingPickedUp` (claim) | "Claim Request" | "Uw claimaanvraag is ontvangen" | Admin |
| 15 | `controllers/vendor/trackingController.js` | `markBookingPickedUp` | "Booking Status" | "Boekingstatus" | Vendor |
| 16 | `controllers/vendor/trackingController.js` | `markBookingCompleted` | "Tracking Status" | "Trackingstatus" | Vendor |
| 17 | `controllers/vendor/trackingController.js` | `markAsReceivedBack` | "Tracking Status" | "Trackingstatus" | Vendor |
| 18 | `corn/paymentReminder.js` | Auto-cancel (non-payment) | "Booking Cancelled Due to Non-Payment" | "Boeking geannuleerd vanwege niet-betaling" | Vendor |
| 19 | `controllers/authController.js` | `verifyOtpAndRegister` (client) | "New User Registration" | "Nieuwe gebruikersregistratie" | Admin |
| 20 | `controllers/authController.js` | `registerVendor2` | "New Vendor Registration" | "Nieuwe leveranciersregistratie" | Admin |
| 21 | `controllers/client/supportController.js` | `createSupportTicket` | "New Support Ticket" | "Nieuw supportticket" | Admin |
| 22 | `sockets/chatSockets.js` | `send_message` | "New message" | "Nieuw bericht" | Vendor/Client |
| 23 | `utils/bookingRequest.js` | `createBookingRequest` (Evenlyo Protect) | "Evenlyo protected booking" | "Door Evenlyo beschermde boeking" | Admin |
| 24 | `utils/notifyVendorNewBooking.js` | `notifyVendorNewBooking` | "New Booking Request" | "Nieuwe boekingsaanvraag" | Vendor |

### 2.2 English-Only Notifications (plain strings — BUGS)

These notifications pass a **plain English string** (not a `{ en, nl }` object). They will always display in English and have no Dutch translation.

| # | File | Line | Function / Event | Message (English only) | Recipient |
|---|------|------|------------------|------------------------|-----------|
| 1 | `controllers/client/bookingController.js` | ~779 | `markBookingAsPaid` | `A client has paid for a booking.` | Vendor |
| 2 | `controllers/vendor/trackingController.js` | ~457 | `markBookingCompleted` | `A booking has been marked as completed by the vendor.` | Admin |
| 3 | `controllers/authController.js` | ~1611 | `registerVendor` | `A new vendor has registered: {name}` | Admin |

> **Note:** These use `createAdminNotification` or `createNotification` with a plain string. The `toMultilingualText` util (used by `createAdminNotification`) will copy the same English string into both `en` and `nl`, so the Dutch user sees English.

---

## 3. Emails

**All emails are in Dutch.** No English email templates were found.

### 3.1 Emails in `utils/mailer.js`

| # | Function | Subject (Dutch) | Recipient | Purpose |
|---|----------|-----------------|-----------|---------|
| 1 | `sendOTPEmail` | "Evenlyo - E-mail Verificatie code" | Client | OTP verification code |
| 2 | `sendForgotOTPADMIN` | "Evenlyo - Wachtwoord Reset" | Admin | Admin password reset OTP |
| 3 | `sendPromotionalEmail` | "Welkom bij Evenlyo - Ontdek geweldige evenementen!" | Client | Promotional welcome email |
| 4 | `sendContactEmail` | "Bericht via contactformulier van {name}" | info@evenlyo.nl | Contact form submission |
| 5 | `sendReportEmail` | "Nieuwe gebruikersmelding - Gesprek gerapporteerd" | Admin | User report notification |
| 6 | `sendKvkUpdateEmail` | "Verzoek om KVK-nummer bij te werken" | info@evenlyo.nl | KVK number update request |
| 7 | `sendOrderStatusEmail` | "Boeking geaccepteerd – Boekings-ID: {id}" / "Boeking afgewezen – Boekings-ID: {id}" | Client | Booking accepted/rejected |
| 8 | `sendBookingCompletionEmail` | "Boeking voltooid – Boekings-ID: {id}" | Client | Booking completed |
| 9 | `sendVendorCancellationEmail` | "Kennisgeving: Boeking Geannuleerd" | Vendor | Booking cancelled |
| 10 | `sendEvenlyoProtectBookingEmail` | "Evenlyo Protect boeking geaccepteerd/afgewezen/ontvangen" | Admin | Evenlyo Protect status updates |
| 11 | `sendReminderEmail` | "Je evenement is over {n} dag(en) – Betalingsherinnering" | Client | Payment reminder |
| 12 | `sendChatbotTicketReply` | "Re: {subject} — Ticket #{id}" | Client | Chatbot support reply |
| 13 | `sendSecurityRefundEmail` | "Uw waarborgsom is terugbetaald" | Client | Security deposit refund |
| 14 | `sendClientClaimRefundEmail` | "Uw claim is goedgekeurd" | Client | Claim approved refund |

### 3.2 Emails in `corn/paymentReminder.js`

| # | Function | Subject (Dutch) | Recipient | Purpose |
|---|----------|-----------------|-----------|---------|
| 1 | `sendReminderEmail` | "Uw evenement is over {n} dag(en) – Betalingsherinnering" | Client | Payment reminder (3-day & 1-day) |
| 2 | `sendAdminCancellationEmail` | "Admin: Boeking {trackingId} geannuleerd" | Admin | Admin notification of auto-cancel |
| 3 | `sendVendorCancellationEmail` | "Kennisgeving: Boeking Geannuleerd" | Vendor | Vendor notification of cancellation |

---

## 4. The "Booking Accepted" Notification Issue

The user reported receiving an English "booking accepted" in-app notification. This is explained by:

1. **`acceptBooking`** in `controllers/vendor/bookingAnalytics.js` (line ~297) creates a notification with:
   ```js
   title: { en: "Booking Status", nl: "Boekingstatus" },
   message: { en: `Booking against ${booking.trackingId} has been accepted`, nl: `Boeking met betrekking tot ${booking.trackingId} is geaccepteerd.` }
   ```
   This is **bilingual** in the DB.

2. **However**, the push notification (FCM) is sent via `sendPushOnly` → `pickBestText`, which returns `value.en || value.nl` — **English wins**.

3. Additionally, `notifyVendorNewBooking` (line ~345) sends a push with:
   ```js
   title: { en: "Booking Accepted", nl: "Boeking Geaccepteerd" }
   ```
   Again, `pickBestText` in `utils/notifyVendorNewBooking.js` returns `value.en || value.nl` — **English wins**.

**Result:** The user sees "Booking Accepted" / "Booking Status" in English even though a Dutch translation exists.

---

## 5. Recommendations

### 5.1 Fix `pickBestText` to prefer Dutch (or user's locale)

Change the language preference in all three locations to prefer Dutch:

- `controllers/notificationController.js` (line 99–103)
- `utils/notifications.js` (line 4–8)
- `utils/notifyVendorNewBooking.js` (line 3–7)

```js
// Current (English preferred):
return value.en || value.nl || "";

// Recommended (Dutch preferred):
return value.nl || value.en || "";
```

> **Note:** This is a global change. If the app supports multiple languages per-user, a better approach is to pass the user's preferred language into `pickBestText` and select accordingly.

### 5.2 Convert English-only notification strings to bilingual objects

Fix the 3 English-only notifications found in section 2.2:

1. `controllers/client/bookingController.js` (~line 779) — `markBookingAsPaid`
2. `controllers/vendor/trackingController.js` (~line 457) — `markBookingCompleted` (admin)
3. `controllers/authController.js` (~line 1611) — `registerVendor` (admin)

Convert each plain string to `{ en: "...", nl: "..." }`.

### 5.3 Emails
No changes needed — all emails are already in Dutch.

---

## 6. Files Reviewed

| File | Role |
|------|------|
| `controllers/notificationController.js` | Notification creation + FCM push logic |
| `utils/notifications.js` | FCM send utility |
| `utils/notifyVendorNewBooking.js` | Vendor new-booking notification helper |
| `utils/textUtils.js` | Multilingual text utilities |
| `utils/mailer.js` | All email templates |
| `corn/paymentReminder.js` | Cron reminder + cancellation emails |
| `controllers/vendor/bookingAnalytics.js` | Accept/reject booking notifications |
| `controllers/client/bookingController.js` | Client booking flow notifications |
| `controllers/vendor/trackingController.js` | Vendor tracking notifications |
| `controllers/authController.js` | Registration notifications |
| `controllers/client/supportController.js` | Support ticket notifications |
| `sockets/chatSockets.js` | Chat message push notifications |
| `utils/bookingRequest.js` | Booking request + Evenlyo Protect notifications |