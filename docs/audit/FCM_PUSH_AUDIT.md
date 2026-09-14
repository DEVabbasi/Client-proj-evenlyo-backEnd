# FCM Push Notification Audit

**Date:** 2026-08-12
**Scope:** ONLY Firebase Cloud Messaging (FCM) push notifications — the actual push notifications delivered to devices via `admin.messaging().send()`.
**Excluded:** In-app DB notifications (`Notification.create`), emails, and other non-FCM channels.

---

## 1. FCM Push Architecture

### 1.1 The Push Chain

```
┌─────────────────────────────────────────────────────────────────────┐
│  PRODUCTION CALLERS                                                 │
│                                                                     │
│  sockets/chatSockets.js          utils/notifyVendorNewBooking.js    │
│  (chat messages)                 (booking request/accept/reject)    │
└──────────────┬──────────────────────────────┬───────────────────────┘
               │                              │
               ▼                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  controllers/notificationController.js                              │
│  sendPushOnly({ title, message, notificationFor, receiverDetails }) │
│                                                                     │
│  • Resolves receiver (receiverDetails → resolveTargetUser)          │
│  • Collects tokens: [appFcm, webFcm] → unique                       │
│  • pickBestText(title) → English preferred ⚠️                       │
│  • pickBestText(message) → English preferred ⚠️                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  utils/notifications.js                                             │
│  sendNotification({ token, title, body, data })                     │
│                                                                     │
│  • Builds FCM message (notification + data + android + apns)        │
│  • admin.messaging().send(message)  ← THE ONLY FCM SEND CALL        │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Facts

- **`sendNotification`** (`utils/notifications.js`) is the **only** function in the codebase that calls `admin.messaging().send()`.
- **`sendPushOnly`** (`controllers/notificationController.js`) is the **only** production caller of `sendNotification`.
- **`createNotification`** only creates a DB record — it does **NOT** send FCM push.
- **`sendPushOnly`** is called from only **2 production modules**:
  1. `sockets/chatSockets.js` — chat message push
  2. `utils/notifyVendorNewBooking.js` — booking request / accepted / rejected push

---

## 2. All FCM Push Call Sites (Production)

### 2.1 Via `utils/notifyVendorNewBooking.js`

This helper is the FCM push path for all booking-related vendor notifications.

| # | Caller | Event | Title (EN) | Title (NL) | Recipient |
|---|--------|-------|------------|------------|-----------|
| 1 | `controllers/client/bookingController.js` `createBookingRequest` | New booking request | "New Booking Request" | "Nieuwe boekingsaanvraag" | Vendor |
| 2 | `controllers/vendor/bookingAnalytics.js` `acceptBooking` | Booking accepted | "Booking Accepted" | "Boeking Geaccepteerd" | Vendor |
| 3 | `controllers/vendor/bookingAnalytics.js` `rejectBooking` | Booking rejected | "Booking Rejected" | "Boeking Geweigerd" | Vendor |
| 4 | `controllers/vendor/bookingAnalytics.js` `paymentConfirmation` | ⚠️ **BUG: sends "Booking Rejected"** (copy-paste) | "Booking Rejected" | "Boeking Geweigerd" | Vendor |
| 5 | `utils/bookingRequest.js` `createBookingRequest` | New booking request | ⚠️ **BUG: Dutch-only title + missing receiver** | "Nieuwe boekingsaanvraag" | Vendor (likely never delivered) |

### 2.2 Via `sockets/chatSockets.js` (direct `sendPushOnly`)

| # | Event | Title (EN) | Title (NL) | Recipient |
|---|-------|------------|------------|-----------|
| 6 | Chat message (vendor→user) | "New message" | "Nieuw bericht" | Client |
| 7 | Chat message (user→vendor) | "New message" | "Nieuw bericht" | Vendor |

---

## 3. Language Analysis — Why Users See English

### 3.1 Root Cause: `pickBestText` prefers English

The `pickBestText` function is duplicated in **3 files** and all prefer English:

| File | Lines | Logic |
|------|-------|-------|
| `controllers/notificationController.js` | 99–103 | `return value.en \|\| value.nl \|\| "";` ⚠️ |
| `utils/notifications.js` | 4–8 | `return value.en \|\| value.nl \|\| "";` ⚠️ |
| `utils/notifyVendorNewBooking.js` | 3–7 | `return value.en \|\| value.nl \|\| "";` ⚠️ |

**Impact:** Every FCM push that stores a bilingual `{ en, nl }` object displays in **English** to the end user, regardless of the user's language.

### 3.2 The "Booking Accepted" Push (user's reported issue)

In `controllers/vendor/bookingAnalytics.js` `acceptBooking` (~line 345):

```js
await notifyVendorNewBooking({
  title: { en: "Booking Accepted", nl: "Boeking Geaccepteerd" },
  message: {
    en: `New booking request for your listing "${listingDetails.title.en}" on ${...} is accepted.`,
    nl: `Nieuwe boekingsaanvraag voor uw aanbod "${listingDetails.title.nl}" van ${...} is geaccepteerd.`,
  },
  receiverDetails: user,
  bookingRequest: booking,
});
```

Flow:
1. `notifyVendorNewBooking` → `toBilingual` keeps the `{en, nl}` object
2. `sendPushOnly` → `pickBestText(title)` returns **"Booking Accepted"** (English)
3. `sendPushOnly` → `pickBestText(message)` returns **English message**
4. `sendNotification` sends English title/body to FCM

**Result:** User receives "Booking Accepted" in English even though a Dutch translation exists.

---

## 4. Bugs Found

### 4.1 🔴 BUG: `paymentConfirmation` sends "Booking Rejected" push

**File:** `controllers/vendor/bookingAnalytics.js` (~lines 746–763)
**Function:** `paymentConfirmation`

```js
if (vendorDetails.notifications?.push === true) {
  try {
   await notifyVendorNewBooking({
    title: { en: "Booking Rejected", nl: "Boeking Geweigerd" },   // ⚠️ WRONG
    message: {
      en: `Your booking request for "${listingDetails.title.en}" ... is rejected.`,  // ⚠️ WRONG
      nl: `Nieuwe boekingsaanvraag voor uw aanbod "${listingDetails.title.nl}" ... is geweigerd.`,  // ⚠️ WRONG
    },
    receiverDetails: user,
    bookingRequest: booking,
  });
```

**Problem:** After a successful payment, the vendor receives a push saying the booking was **REJECTED**. This is a copy-paste error from `rejectBooking`. It should send a "Payment received" / "Booking paid" notification instead.

**Additional issue:** This block references `listingDetails` and `user` which are **not defined** in `paymentConfirmation`'s scope — likely causing a runtime error that prevents the push from being sent (or crashes silently in the catch).

### 4.2 🔴 BUG: `utils/bookingRequest.js` push never delivers

**File:** `utils/bookingRequest.js` (~lines 321–333)

```js
await notifyVendorNewBooking({
  title: "Nieuwe boekingsaanvraag",   // Dutch-only string
  vendorUserId,                        // ⚠️ not used by notifyVendorNewBooking
  clientUserId: bookingRequest.userId, // ⚠️ not used
  bookingRequest,
  listing,
  startDate,
  endDate,
});
```

**Problems:**
1. **No `receiverDetails`** — `sendPushOnly` falls back to `resolveTargetUser`, but `notificationFor` and `vendorId` are also not passed → receiver cannot be resolved → push silently fails (`"Receiver not found for push notification"`).
2. **No `message`** — falls back to the default `{en: 'New booking request for "..."', nl: 'Nieuwe boekingsaanvraag voor "..."'}`.
3. **`title` is a Dutch-only string** — `toBilingual` copies it to both `en` and `nl`, so even if delivered, the title would be Dutch in both languages.

### 4.3 🟡 BUG: `pickBestText` English preference (3 files)

All three `pickBestText` implementations prefer `en` over `nl`. This is the root cause of English pushes for Dutch users.

### 4.4 🟡 Unused import: `resolveUserFcmToken`

`controllers/notificationController.js` imports `resolveUserFcmToken` from `utils/fcmToken.js` (line 7) but **never uses it**. `sendPushOnly` reads `receiverDetails.appFcm` / `receiverDetails.webFcm` directly instead.

---

## 5. FCM Token Resolution

### 5.1 `sendPushOnly` token collection

```js
const tokens = [receiverDetails.appFcm, receiverDetails.webFcm].filter(Boolean);
const uniqueTokens = [...new Set(tokens)];
```

- Sends to **both** `appFcm` (mobile) and `webFcm` (web) tokens
- Deduplicates identical tokens
- If no tokens → `"No FCM tokens found"` → returns `false` (silent failure)

### 5.2 Receiver resolution fallback

```js
if (!receiverDetails) {
  receiverDetails = await resolveTargetUser({
    notificationFor: data.notificationFor,
    clientId: data.clientId,
    vendorId: data.vendorId,
    projection: "appFcm webFcm",
  });
}
```

- `resolveTargetUser` looks up `User.findById(clientId)` for clients
- For vendors: tries `User.findById(vendorId)`, then falls back to `Vendor.findById(vendorId).userId`
- **If `notificationFor` is missing** (as in the `utils/bookingRequest.js` bug), resolution fails

### 5.3 Token storage

- `appFcm` — mobile app token (preferred)
- `webFcm` — web token
- `fcm` — legacy field (cleared by `saveUserAppFcm`)
- `resolveUserFcmToken` prefers `appFcm` → `webFcm` → `fcm` (legacy), but is **not used** in the push path

---

## 6. FCM Message Payload (utils/notifications.js)

```js
const message = {
  token,
  notification: { title, body },
  data,
  android: {
    priority: "high",
    notification: {
      channelId: "evenlyo_general",
      sound: "default",
      priority: "high",
    },
  },
  apns: {
    headers: { "apns-priority": "10" },
    payload: { aps: { sound: "default", badge: 1 } },
  },
};
```

- Uses `channelId: "evenlyo_general"` for Android
- High priority for both Android and iOS
- Badge set to 1 on iOS
- `data` payload is stringified (all values converted to strings)

---

## 7. Recommendations (FCM Layer Only)

### 7.1 🔴 Fix `paymentConfirmation` push (highest priority)

In `controllers/vendor/bookingAnalytics.js` `paymentConfirmation`, replace the "Booking Rejected" push with a proper payment notification:

```js
await notifyVendorNewBooking({
  title: { en: "Payment Received", nl: "Betaling Ontvangen" },
  message: {
    en: `Payment received for booking ${booking.trackingId}.`,
    nl: `Betaling ontvangen voor boeking ${booking.trackingId}.`,
  },
  receiverDetails: vendorDetails,
  bookingRequest: booking,
});
```

Also fix the undefined `listingDetails` / `user` references.

### 7.2 🔴 Fix `utils/bookingRequest.js` push

Pass `receiverDetails` (the vendor user) and a proper bilingual title/message:

```js
await notifyVendorNewBooking({
  title: { en: "New Booking Request", nl: "Nieuwe boekingsaanvraag" },
  message: {
    en: `New booking request for "${listing.title.en}" on ${bookingDates}. Tracking ID: ${bookingRequest.trackingId}`,
    nl: `Nieuwe boekingsaanvraag voor "${listing.title.nl}" op ${bookingDates}. Tracking-ID: ${bookingRequest.trackingId}`,
  },
  receiverDetails: vendorUser,   // must be the vendor's User doc with appFcm/webFcm
  bookingRequest,
  listing,
});
```

### 7.3 🟡 Fix `pickBestText` to prefer Dutch

Change all 3 files to prefer `nl`:

```js
return value.nl || value.en || "";
```

Or better: pass the user's preferred language into `pickBestText` and select accordingly.

### 7.4 🟡 Remove unused `resolveUserFcmToken` import

Clean up `controllers/notificationController.js` line 7.

---

## 8. Files Reviewed (FCM Only)

| File | Role in FCM |
|------|-------------|
| `utils/notifications.js` | The only FCM send call (`admin.messaging().send`) |
| `controllers/notificationController.js` | `sendPushOnly` — FCM push orchestration + `pickBestText` |
| `utils/notifyVendorNewBooking.js` | Booking push helper + `pickBestText` |
| `sockets/chatSockets.js` | Chat message FCM push |
| `utils/bookingRequest.js` | Booking request FCM push (buggy) |
| `controllers/client/bookingController.js` | New booking request FCM push |
| `controllers/vendor/bookingAnalytics.js` | Accept/reject/payment FCM pushes |
| `utils/fcmToken.js` | Token resolution (unused in push path) |
| `utils/resolveVendorUserId.js` | Vendor user resolution for push targets |