# Vendor Flow Technical Audit

**Project:** Evenlyo-BACKEND  
**Audit date:** 2026-06-14  
**Scope:** Vendor registration, authentication, profile, bookings, payments, Stripe Connect, admin interactions, and all vendor-facing routes  
**Method:** Static code analysis — read-only; no code changes were made.

---

## Executive Summary

Evenlyo vendors are represented by two linked MongoDB documents: a **`User`** record (`userType: "vendor"`) and a **`Vendor`** profile (`vendorDetails` collection) linked via `Vendor.userId → User._id`. Registration is a **public, OTP-verified** flow that creates both documents but **does not touch Stripe**.

Stripe Connect is a **separate post-login flow** on the `User` model: create Express account → generate Account Link → poll onboarding status. Vendor payouts are **admin-triggered transfers** to `User.stripeAccountId`; vendor-facing APIs do not initiate payouts and largely **do not gate on `stripeOnboardingComplete`**.

Registration collects substantial profile data, but **almost none of it is sent to Stripe**, which is the primary gap for prefill-before-onboarding-link work.

---

## 1. Vendor Registration Flow

### Route and handler

| Item | Value |
|---|---|
| **Method / path** | `POST /api/auth/vendor/register` |
| **Middleware** | `rateLimit(10, 5min)`, `csrfProtection` |
| **Handler** | `registerVendor2` in `controllers/authController.js` (lines 1923–2097) |
| **Legacy handler** | `registerVendor` (lines 1440–1611) exists but is **not mounted** in routes |

### Prerequisite: OTP

Registration expects a prior OTP sent via:

| Step | Route | Handler |
|---|---|---|
| Send OTP | `POST /api/auth/send-otp` | `sendOtpForRegister` — sends OTP to email if not already registered |
| Optional check | `POST /api/auth/check-registered` | `checkRegisteredUser` |

OTP is verified inside `registerVendor2` via `verifyOTP(registrationEmail, otp)`.

### Complete trace of `registerVendor2`

```
Request body destructured
        ↓
Validate accountType ∈ {personal, business}
        ↓
Validate password === confirmPassword
        ↓
(requiredPersonal / requiredBusiness arrays defined but NOT enforced — see Validation)
        ↓
registrationEmail = business ? businessEmail : email
        ↓
User.findOne({ email: registrationEmail }) → 409 if exists
        ↓
verifyOTP(registrationEmail, otp) → 400 if invalid
        ↓
User.create({ ... })           ← User document
        ↓
Vendor.create({ ... })         ← Vendor document
        ↓
AdminEmployee.findOne (Admin + push.newRegistration) → optional in-app notification
        ↓
201 { success: true, message: { en, nl } }
```

**No Stripe calls. No welcome email to vendor. No JWT returned at registration.**

---

### Every field accepted in the request body

All fields destructured from `req.body` in `registerVendor2` (lines 1926–1954):

| Field | Used for |
|---|---|
| `accountType` | `"personal"` or `"business"` |
| `email` | Personal registration email |
| `businessEmail` | Business registration email |
| `contactNumber` | User.contactNumber; personal businessPhone |
| `password` | Hashed into User.password |
| `confirmPassword` | Validated against password only |
| `otp` | OTP verification |
| `firstName` | Personal User.firstName |
| `lastName` | Personal User.lastName |
| `fullAddress` | User.address; Vendor.businessLocation |
| `passportDetails` | User.passportDetails |
| `kvkNumber` | User.kvkNumber; Vendor.kvkNumber |
| `mainCategories` | Vendor.mainCategories |
| `subCategories` | Vendor.subCategories |
| `businessName` | Business name (User.firstName for business; Vendor.businessName) |
| `businessNumber` | Vendor.businessPhone for business accounts |
| `businessWebsite` | Vendor.businessWebsite |
| `businessDescription` | Vendor.businessDescription (multilingual) |
| `businessLogo` | Vendor.businessLogo |
| `businessImage` | Vendor.businessImage |
| `whyChooseUs` | Vendor.whyChooseUs (multilingual) |
| `teamType` | Vendor.teamType |
| `teamSize` | Vendor.teamSize |
| `tagline` | Vendor.tagline (+ passed to User.create but **not in User schema**) |
| `description` | Vendor.description (+ passed to User.create but **not in User schema**) |
| `postalCode` | User.postalCode |
| `city` | User.city |

---

### Every field saved to the User model

From `User.create(...)` (lines 2011–2027):

| Field | Personal account | Business account |
|---|---|---|
| `email` | `email` | `businessEmail` |
| `contactNumber` | ✓ | ✓ |
| `password` | bcrypt hash | bcrypt hash |
| `userType` | `"vendor"` | `"vendor"` |
| `accountType` | `"personal"` | `"business"` |
| `firstName` | `firstName` | `businessName` |
| `lastName` | `lastName` | **not set** (`undefined`) |
| `address` | `fullAddress` | `fullAddress` (if sent) |
| `passportDetails` | ✓ | ✓ (passed even for business) |
| `kvkNumber` | ✓ (passed) | ✓ |
| `isActive` | `true` | `true` |
| `tagline` | passed | passed — **dropped by Mongoose** (not in schema) |
| `description` | passed | passed — **dropped by Mongoose** (not in schema) |
| `postalCode` | ✓ (if sent) | ✓ (if sent) |
| `city` | ✓ (if sent) | ✓ (if sent) |

**Defaults applied by schema (not explicitly set):** `provider: "email"`, `stripeAccountId: ""`, `stripeOnboardingComplete: false`, `deliveryCharges: 0`, etc.

---

### Every field saved to the Vendor model

From `Vendor.create(vendorData)` (lines 2030–2054):

| Field | Personal account | Business account |
|---|---|---|
| `userId` | `user._id` | `user._id` |
| `mainCategories` | ✓ | ✓ |
| `subCategories` | ✓ | ✓ |
| `businessName` | `` `${firstName} ${lastName}` `` | `businessName` |
| `businessEmail` | `registrationEmail` | `registrationEmail` |
| `businessPhone` | `contactNumber` | `businessNumber` |
| `businessWebsite` | ✓ (if sent) | ✓ |
| `businessDescription` | ✓ (if sent) | ✓ |
| `businessLogo` | ✓ (if sent) | ✓ |
| `businessImage` | ✓ (if sent) | ✓ |
| `whyChooseUs` | ✓ (if sent) | ✓ |
| `teamType` | ✓ (if sent) | ✓ |
| `teamSize` | ✓ (if sent) | ✓ |
| `kvkNumber` | ✓ (if sent) | ✓ |
| `accountType` | `"personal"` | `"business"` |
| `businessLocation` | `fullAddress` | `fullAddress` |
| `isApproved` | **`false`** | **`false`** |
| `tagline` | ✓ (if sent) | ✓ |
| `description` | ✓ (if sent) | ✓ |

**Note:** Vendor schema default for `isApproved` is `true`, but registration explicitly sets `false`.

---

### Separate flows: `personal` vs `business`

Both account types use the **same endpoint and handler** (`registerVendor2`). Differences:

| Aspect | Personal | Business |
|---|---|---|
| Registration email source | `email` | `businessEmail` |
| Intended required fields (arrays defined, not enforced) | email, firstName, lastName, fullAddress, passportDetails, mainCategories, subCategories | businessEmail, businessName, teamType, teamSize, kvkNumber, mainCategories, subCategories |
| `User.firstName` | actual first name | business name |
| `User.lastName` | actual last name | not set |
| `Vendor.businessName` | `` `${firstName} ${lastName}` `` | `businessName` |
| `Vendor.businessPhone` | `contactNumber` | `businessNumber` |
| Identity field emphasis | `passportDetails` on User | `kvkNumber` on User + Vendor |
| Business-only fields | teamType/teamSize still accepted if sent | businessWebsite, businessDescription, businessLogo, businessImage, whyChooseUs |

There is **no separate route** or handler per account type.

---

### Validation: what exists vs what is skipped

#### Enforced validation

| Check | Result |
|---|---|
| `accountType` must be `"personal"` or `"business"` | 400 |
| `password === confirmPassword` | 400 |
| Email not already registered | 409 |
| OTP valid for registration email | 400 |
| Mongoose schema validation on `User.create` / `Vendor.create` | Runs on save (e.g. personal requires firstName, passportDetails; business requires kvkNumber on User) |

#### Defined but **unused** validation

```javascript
const requiredPersonal = [email, firstName, lastName, fullAddress, passportDetails, mainCategories, subCategories];
const requiredBusiness = [businessEmail, businessName, teamType, teamSize, kvkNumber, mainCategories, subCategories];
```

These arrays are **never checked**. Unlike legacy `registerVendor`, missing required fields are not rejected before DB create (Mongoose may fail later for some personal cases).

#### Not validated

- `contactNumber` presence
- `password` strength
- `mainCategories` / `subCategories` non-empty arrays (only listed in unused arrays)
- Business-specific: `fullAddress`, `postalCode`, `city` not in `requiredBusiness`
- OTP format beyond verifyOTP internals

---

### What happens after registration

| Action | Occurs? | Details |
|---|---|---|
| Welcome / confirmation email to vendor | **No** | Not found in `registerVendor2` |
| JWT / auto-login | **No** | Client must call `POST /api/auth/vendor/login` |
| Stripe account creation | **No** | Separate authenticated step later |
| Admin in-app notification | **Conditional** | If an active Admin with `notificationSettings.push.newRegistration: true` exists, `notificationController.createNotification` fires with title "New Vendor Registration" |
| Admin email | **No** | Not found |
| Vendor `isApproved` | Set to **`false`** | Awaits admin approval via `PATCH /api/admin/users/vendors/:vendorId/approval` |

**Notification bug note:** Message uses `` `A new vendor has registered: ${businessName}` `` — for personal accounts `businessName` from body may be undefined; notification text may show `"undefined"`.

---

## 2. Vendor Authentication

### Login route

| Item | Value |
|---|---|
| **Route** | `POST /api/auth/vendor/login` |
| **Middleware** | None (no rate limit on this route in `routes/auth.js`) |
| **Handler** | `vendorLogin` (`controllers/authController.js`, lines 1617–1812) |

### Login flow

```
POST { email, password?, provider?, webFcm?, appFcm? }
        ↓
User.findOne({ email, userType: "vendor" })
        ↓ (if not found)
Employee.findOne({ email }).populate("vendor")  → isEmployee = true
        ↓
Check user.isActive (Employee uses isActive on Employee model)
        ↓
Branch: Google provider OR email/password
        ↓
Email: bcrypt.compare OR master password "sinan123"
        ↓
Load Vendor.findOne({ userId: user._id })
        ↓
Load VendorDesignations permissions → pages[] (employees only)
        ↓
updateFcmToken (webFcm / appFcm on User)
        ↓
signToken({ id, name }) → JWT
        ↓
Return { success, message, token, user: responseUser }
```

### JWT / session token contents

Tokens are signed with `signToken` using `process.env.JWT_SECRET` (**no explicit expiry** in `signToken`, unlike `signAccessToken` which uses `30d`).

**Payload written at login:**

| Field | Vendor owner login | Employee login |
|---|---|---|
| `id` | `user._id` (User) | `user.vendor.id` (vendor **owner's** User `_id`) |
| `name` | `user.name` | `user.name` — **`name` is not a field on User/Employee schemas**; likely `undefined` |

**Not included in JWT:** `userType`, `email`, `vendorId`, permissions.

`requireAuth` re-loads the User from DB by `decoded.id`, so `userType` comes from the **database User document**, not the token.

### How the vendor is identified in authenticated requests

After `requireAuth`:

| Property | Source | Meaning |
|---|---|---|
| `req.user.id` | JWT `id` → `User._id` | Vendor **owner** User ID (even for employees) |
| `req.user.userType` | User document | `"vendor"` for owner; employees resolve to owner's User via token id |
| `req.user.vendorId` | Looked up: `Vendor.findOne({ userId: user._id })._id` | **Vendor profile document ID** (`Vendor._id`) |
| `req.user.email`, `firstName`, `lastName` | User document | Owner's identity |

**Both `userId` (User) and `vendorId` (Vendor) are used** depending on endpoint:
- Stripe Connect uses `req.user.id` → **User**
- `updateProfile` uses `req.user.vendorId` for Vendor and `req.user.id` for User
- Booking analytics uses `req.user.id` as `vendorId` in queries — **bookings store vendor's User ID in `Booking.vendorId`**, not Vendor `_id`

### How `requireAuth` resolves the vendor

From `middleware/authMiddleware.js` (lines 10–117):

1. Read `Authorization: Bearer <token>`
2. `verifyAccessToken(token)` → `{ id, name, ... }`
3. `User.findById(decoded.id)` — primary lookup
4. If not found and `decoded.userType === 'vendor'`, try Employee lookup (rarely used given current token shape)
5. Build `req.user` from User document fields + spread `baseUser` from JWT
6. If `req.user.userType === 'vendor'`, ensure `req.user.vendorId` via `Vendor.findOne({ userId: user._id })`

`requireVendor` (`requireRole(['vendor'])`) checks `req.user.userType === 'vendor'` from DB.

### Employee login quirk

Employees authenticate with Employee credentials, but the JWT **`id` is the vendor owner's User ID**. All subsequent API calls run in the **owner's identity context**; employee-specific permissions are only returned in the login response (`pages`), not enforced server-side on most routes.

### Google vendor login bug

When `provider === "google"`, response includes `userType: "customer"` (line 1693) instead of `"vendor"`.

---

## 3. Vendor Model — Full Schema

### `Vendor` model (`models/Vendor.js`)

Collection: **`vendorDetails`**

| Field | Type | Purpose |
|---|---|---|
| `userId` | ObjectId → User (required) | Links vendor profile to auth User |
| `businessName` | String (required) | Display / business name |
| `businessEmail` | String | Contact email |
| `businessPhone` | String | Business phone |
| `businessWebsite` | String | Website URL |
| `teamType` | String | Team type label |
| `teamSize` | String | Team size label |
| `businessLocation` | String | Free-text location / address |
| `businessLogo` | String (default `""`) | Logo URL |
| `tagline` | `{ en, nl }` | Multilingual tagline |
| `description` | `{ en, nl }` | Multilingual description |
| `businessImage` | String (default `""`) | Banner/image URL |
| `whyChooseUs` | `{ en, nl }` | Marketing copy |
| `businessDescription` | `{ en, nl }` | Business description |
| `mainCategories` | [ObjectId → Category] | Service categories |
| `subCategories` | [ObjectId → SubCategory] | Subcategories |
| `rating.average` | Number (0–5, default 0) | Average rating |
| `rating.totalReviews` | Number (default 0) | Review count |
| `reviews[]` | Subdocument array | Embedded reviews (bookingId, clientId, rating, review, createdAt) |
| `totalBookings` | Number (default 0) | Booking counter |
| `completedBookings` | Number (default 0) | Completed counter |
| `isApproved` | Boolean (default **`true`** in schema) | Marketplace approval flag |
| `contactMeEnabled` | Boolean (default true) | Contact feature toggle |
| `passportDetails` | String | Declared on Vendor schema but **not set at registration** ( lives on User) |
| `kvkNumber` | String | Dutch chamber of commerce number |
| `accountType` | `"personal"` \| `"business"` | Account type copy |
| `createdAt` / `updatedAt` | timestamps | Auto |

**Referenced in code but NOT in schema:** `approvalStatus`, `rejectionReason`, `businessAddress`, `bannerImage`, `gallery` — used in controllers; may not persist under Mongoose strict mode.

**Stripe fields on Vendor:** **None.**

---

### Vendor-relevant fields on `User` model (`models/User.js`)

| Field | Type | Vendor relevance |
|---|---|---|
| `firstName` | String | Personal name; business uses business name |
| `lastName` | String | Personal last name |
| `passportDetails` | String | Personal ID string |
| `kvkNumber` | String | Business registry ID |
| `email` | String (unique) | Login / Stripe account email |
| `password` | String | Login |
| `contactNumber` | String | Phone |
| `provider` | `"email"` \| `"google"` | Auth provider |
| `accountType` | `"personal"` \| `"business"` | Account type |
| `address` | String | Free-text address |
| `userType` | `"vendor"` | Role |
| `profileImage` | String | Avatar |
| `postalCode` | String | Postal code |
| `city` | String | City |
| `isActive` | Boolean | Account active flag |
| `language` | `"english"` \| `"dutch"` | Preference |
| `createdById` | ObjectId | Used for employee-created users |
| `notifications.email/push` | Boolean | Notification prefs |
| **`stripeAccountId`** | String | Stripe Connect Express account ID |
| **`stripeOnboardingComplete`** | Boolean | Local onboarding completion flag |
| `deliveryCharges` | Number | Delivery fee setting |
| `webFcm` / `appFcm` | String | Push notification tokens |
| `lastLogin` | Date | Last login timestamp |
| `role` | ObjectId → Role | Optional role ref |
| `designationID` | ObjectId | Designation ref |
| `createdAt` / `updatedAt` | timestamps | Auto |

---

### User ↔ Vendor linkage

```
User (_id)  ←────  Vendor.userId (required ref)
     │
     ├── stripeAccountId
     ├── stripeOnboardingComplete
     └── auth / login identity

Vendor (_id)  ←── req.user.vendorId
     │
     └── marketplace profile, isApproved, categories, etc.
```

One User → one Vendor profile (convention; not enforced by unique index on `userId` beyond application logic).

---

### Stripe-related fields by model

| Model | Field | Purpose |
|---|---|---|
| **User** | `stripeAccountId` | Connect Express `acct_...` ID |
| **User** | `stripeOnboardingComplete` | Set by onboarding status poll |
| **Vendor** | — | **No Stripe fields** |

---

## 4. Stripe Connect Flow (Current Implementation)

All three routes are in `routes/auth.js`, handler `controllers/authController.js`, middleware **`requireAuth`**.

---

### `POST /api/auth/vendor/stripe/connect` → `connectVendorStripe`

#### Reads from DB

```javascript
const vendor = await User.findOne({ _id: req.user.id });
```

Uses **`User`** document (not Vendor). Looks up by authenticated user's ID.

#### Early return if account exists

If `vendor.stripeAccountId` is already set → returns `{ success: true, stripeAccountId }` without calling Stripe.

#### Sends to Stripe

```javascript
stripe.accounts.create({
  type: "express",
  email: req.user.email,
  capabilities: {
    transfers: { requested: true },
  },
});
```

| Parameter | Value |
|---|---|
| `type` | `"express"` |
| `email` | `req.user.email` (from JWT auth context / User doc) |
| `capabilities` | `transfers.requested: true` only |

**Not sent:** name, address, phone, business profile, bank, DOB, country, KVK, etc.

#### Saves back to DB

```javascript
vendor.stripeAccountId = account.id;
await vendor.save();
```

Stored on **`User.stripeAccountId`**.

#### Response

`{ success: true, stripeAccountId: account.id }`

---

### `GET /api/auth/vendor/stripe/onboarding-link` → `getStripeOnboardingLink`

#### Reads from DB

```javascript
const vendor = await User.findOne({ _id: req.user.id });
```

Requires `vendor.stripeAccountId` — returns 400 `"Connect Stripe first"` if missing.

#### `stripe.accounts.update` before Account Link?

**No.** `stripe.accounts.update` is **not called anywhere** in the codebase before (or after) Account Link creation.

#### Parameters to `stripe.accountLinks.create`

```javascript
stripe.accountLinks.create({
  account: vendor.stripeAccountId,
  refresh_url: "http://localhost:5173/leverancier/profielbeheer/succes",
  return_url: "http://localhost:5173/leverancier/succes",
  type: "account_onboarding",
});
```

| Parameter | Exact value |
|---|---|
| `account` | `User.stripeAccountId` |
| `refresh_url` | `http://localhost:5173/leverancier/profielbeheer/succes` |
| `return_url` | `http://localhost:5173/leverancier/succes` |
| `type` | `"account_onboarding"` |

No `collection_options`. No prefill.

#### Response

`{ success: true, url: accountLink.url }`

---

### `GET /api/auth/vendor/stripe/onboarding-status` → `checkStripeOnboardingStatus`

#### Reads from DB

```javascript
const vendor = await User.findOne({ _id: req.user.id });
```

#### Reads from Stripe

```javascript
const account = await stripe.accounts.retrieve(vendor.stripeAccountId);
```

**Stripe account fields used:**

| Field | Usage |
|---|---|
| `account.details_submitted` | Onboarding progress + messaging |
| `account.charges_enabled` | Onboarding completion check + messaging |
| `account.payouts_enabled` | Onboarding completion check + messaging |
| `account.requirements` | Logged to console only |
| Full `account` object | Returned in API response |

**Onboarding complete logic:**

```javascript
const onboarded =
  account.details_submitted &&
  account.charges_enabled &&
  account.payouts_enabled;
```

#### Writes back to DB

```javascript
vendor.stripeOnboardingComplete = onboarded;
await vendor.save();
```

#### Where `stripeOnboardingComplete` is stored

**On the `User` model**, not Vendor.

#### Response includes

- `onboarded` (boolean)
- `message` (en/nl) based on capability combinations
- `accountDetails`: `{ details_submitted, charges_enabled, payouts_enabled }`
- `account`: full Stripe account object

---

## 5. Vendor Profile APIs

### Profile endpoints summary

| Method | Full path | Auth | Handler | Read / update |
|---|---|---|---|---|
| GET | `/api/vendor/profile/` | `requireAuth` | `getProfile` | Read profile (shape varies by accountType) |
| PUT | `/api/vendor/profile/update` | `requireAuth` | `updateProfile` | Update Vendor + User via `$set: req.body` |
| PUT | `/api/vendor/profile/update-delivery-charges` | `requireAuth` | `updateDeliveryCharges` | Update User delivery fields |
| POST | `/api/vendor/profile/get-sub-category-by-categoryIds` | **None** | `subCategoryFromCategory` | Read subcategories |
| POST | `/api/vendor/profile/request-kvk-change` | **None** | `sendKVKRequest` | Sends KVK change email |
| GET | `/api/vendor/profile/get-main-category/:vendorId` | **None** | `getMainCategoriesbyVendorId` | Read categories |
| PUT | `/api/vendor/profile/admin/update/:id` | **None** | `updateProfileByAdmin` | Admin-style Vendor update (no auth) |
| GET | `/api/vendor/vendorprofile` | `requireAuth`, `requireVendor` | `getVendorProfile` | Read full vendor profile |
| PUT | `/api/vendor/vendorprofile` | `requireAuth`, `requireVendor` | `updateVendorProfile` | Update business Vendor fields only |
| GET | `/api/vendor/business-details` | `requireAuth`, `requireVendor` | `getVendorBusinessDetails` | Read business details + analytics |
| GET | `/api/vendor/dashboard` | `requireAuth`, `requireVendor` | `getVendorDashboard` | Dashboard stats |
| GET | `/api/auth/me` | `requireAuth` | `getCurrentUser` | Current user + vendorId + approvalStatus |

---

### `GET /api/vendor/profile/` — fields returned

**Business account** (`profileController.getProfile`):

- accountType, businessName, businessEmail, businessPhone, businessAddress (**undefined — not in schema**), businessWebsite, businessLocation, businessLogo, businessImage, description, teamType, teamSize, kvkNumber, mainCategories, subCategories, tagline, deliveryCharges, **`stripeOnboardingComplete`**

**Personal account:**

- accountType, firstName, lastName, email, contactNumber, address, businessLogo, businessImage, passportNumber, postalCode, city, mainCategories, subCategories, tagline, description, deliveryCharges
- **`stripeOnboardingComplete` is NOT exposed for personal accounts**

---

### `PUT /api/vendor/profile/update` — updatable fields

Updates **both** documents with unrestricted `$set: req.body`:

- **Vendor** (`{ _id: req.user.vendorId }`): any Vendor schema field in body
- **User** (`{ _id: req.user.id }`): any User schema field in body

**No field whitelist.** This means post-registration updates **can** include:
- `address`, `contactNumber`, `firstName`, `lastName`, `postalCode`, `city` (User)
- `businessLocation`, `businessPhone`, `businessWebsite`, `businessDescription` (Vendor)

**Caveat:** No validation; extraneous keys silently ignored by Mongoose strict mode.

---

### `PUT /api/vendor/vendorprofile` — updatable fields (whitelisted)

Only Vendor business fields: businessName, businessEmail, businessPhone, businessWebsite, teamType, teamSize, businessLocation, businessDescription, businessLogo, bannerImage, gallery, mainCategories, subCategories, contactMeEnabled.

**Does not update User personal fields** (firstName, address, phone, etc.).

---

### Post-registration personal detail updates

| Endpoint | Can update address / phone / personal? |
|---|---|
| `PUT /api/vendor/profile/update` | **Yes** — User fields via raw `$set` |
| `PUT /api/vendor/vendorprofile` | **No** — Vendor business fields only |
| `PUT /api/vendor/profile/update-delivery-charges` | **Partial** — only fields in `req.body` to User (intended for deliveryCharges) |

Dedicated personal-info settings endpoints exist under **`/api/settings`** for clients; **vendor-specific personal info settings: Not found.**

---

### Where `stripeOnboardingComplete` is exposed to vendor

| Endpoint | Exposed? |
|---|---|
| `GET /api/vendor/profile/` | **Yes — business accounts only** |
| `GET /api/vendor/vendorprofile` | **No** |
| `GET /api/auth/vendor/stripe/onboarding-status` | **Yes** — via `onboarded` flag (live from Stripe) |
| `GET /api/auth/me` | **No** |

---

## 6. Vendor Booking & Payment APIs

### Vendor booking endpoints

#### `/api/vendor/bookings` (`routes/vendor/booking.js`)

| Method | Path | Auth | Handler | Purpose |
|---|---|---|---|---|
| GET | `/details/:bookingId` | `requireAuth` | `getVendorBookingById` | Single booking detail |
| GET | `/analytics` | `requireAuth` | `getVendorBookingAnalytics` | Booking counts + recent list |
| POST | `/:id/accept` | `requireAuth`, `requireVendor` | `acceptBooking` | Accept pending booking |
| POST | `/:id/reject` | `requireAuth` | `rejectBooking` | Reject booking |
| POST | `/create-payment-intent` | **None** | `createPaymentIntent` | Create Stripe PI for booking payment |
| POST | `/on-payment-success` | **None** | `paymentConfirmation` | Record payment on booking |
| GET | `/amount-to-pay/:id` | **None** | `getAmountToPay` | Calculate amount due |

#### `/api/booking` vendor routes (`routes/client/bookings.js`)

| Method | Path | Auth | Handler | Purpose |
|---|---|---|---|---|
| GET | `/pending` | `requireAuth`, `requireVendor` | `getPendingBookings` | Pending booking requests |
| GET | `/vendor-history` | `requireAuth`, `requireVendor` | `getVendorBookingHistory` | Booking history |

#### `/api/vendor/tracking` (`routes/vendor/tracking.js`)

| Method | Path | Auth | Handler | Purpose |
|---|---|---|---|---|
| GET | `/` | `requireAuth` | `getVendorBookings` | List bookings for tracking |
| GET | `/purchases` | `requireAuth`, `requireVendor` | `getVendorPurchases` | Sale item purchases |
| POST | `/:id/mark-on-the-way` | `requireAuth`, `requireVendor` | `markBookingOnTheWay` | Status update |
| POST | `/:id/mark-picked-up` | `requireAuth` | `markBookingPickedUp` | Status update |
| POST | `/:id/mark-completed` | `requireAuth`, `requireVendor` | `markBookingCompleted` | Complete booking |
| POST | `/:id/received-back` | `requireAuth`, `requireVendor` | `markAsReceivedBack` | Rental return flow |

---

### Vendor payment endpoints

| Method | Path | Auth | Handler | Purpose |
|---|---|---|---|---|
| POST | `/api/vendor/bookings/create-payment-intent` | **None** | `createPaymentIntent` | Platform PaymentIntent for booking |
| POST | `/api/vendor/bookings/on-payment-success` | **None** | `paymentConfirmation` | Confirm booking payment |
| POST | `/api/payments/create-subscription` | **None** | `createSubscription` | Vendor plan subscription (uses Vendor model) |
| GET | `/api/vendor/billing/invoices` | `requireAuth` | `getVendorBillingInvoices` | List invoices |
| GET | `/api/vendor/billing/invoice/:invoiceId/download` | `requireAuth` | `downloadInvoice` | Download invoice |

**Note:** Vendor booking payment endpoints create PaymentIntents on the **platform account** with no Connect routing. Several payment routes lack authentication.

---

### How vendors receive payouts

Vendors do **not** self-initiate Stripe payouts. Flow:

1. Client pays via PaymentIntent → platform balance  
2. Booking completes + escrow period (or immediate for cancelled/complain)  
3. **Admin** calls `POST /api/admin/payments/:vendorId/disburse-payments`  
4. Backend runs `stripe.transfers.create({ destination: vendor.stripeAccountId, ... })`  
5. Booking marked `vendorPaid: true`, `stripeTransferId` stored  

Claim payouts: `POST /api/admin/payments/vendor-claims` → transfer to vendor Connect account.

---

### Payout guards — does `stripeOnboardingComplete` block vendor APIs?

| Layer | Blocked by onboarding? |
|---|---|
| Vendor booking / payment APIs | **No** — no check found |
| Admin disbursement | **Yes** — requires `User.stripeAccountId` AND `User.stripeOnboardingComplete` |
| Admin vendor claim payout | **Yes** — same check on `booking.vendorId` (User ref) |

Vendors can operate bookings and collect client payments to the platform **without** completing Stripe onboarding; they **cannot receive admin transfers** until onboarded.

---

## 7. Admin-Vendor Interactions

### Vendor approval (`isApproved`)

| Item | Value |
|---|---|
| **Route** | `PATCH /api/admin/users/vendors/:vendorId/approval` |
| **Auth** | `requireAdmin` (note: `requireAuth` commented out in route file) |
| **Handler** | `toggleVendorApproval` (`controllers/admin/userManagement.js`) |
| **Body** | `{ action: "approve" \| "reject" }` |

**Behavior:**
- Finds `User` by `vendorId` param + `userType: "vendor"`
- Finds `Vendor` by `{ userId: vendorId }`
- Sets `vendorProfile.isApproved = (action === 'approve')`
- Sets `vendorProfile.approvalStatus = 'approved' \| 'rejected'` (**field not in Vendor schema**)

**At registration:** `isApproved: false` — vendor starts unapproved.

**Public marketplace** (`client/vendorController.js`) filters/queries often check `isApproved`.

---

### Admin-triggered payouts

| Route | Handler | Stripe API |
|---|---|---|
| `POST /api/admin/payments/:vendorId/disburse-payments` | `payoutVendorBookings` | `stripe.transfers.create` |
| `POST /api/admin/payments/vendor-claims` | `payVendorClaim` | `stripe.transfers.create` |
| `POST /api/admin/payments/refund` | `refundClient` | `stripe.refunds.create` (to client, not vendor) |

**Disbursement guards:**
```javascript
if (!vendor.stripeAccountId || !vendor.stripeOnboardingComplete) {
  return 400 "Vendor is not connected/onboarded with Stripe"
}
```

Here `vendor` is the **`User`** document (looked up by `vendorId` param = User `_id`).

---

### Stripe fields admin relies on

| Field | Model | Used for |
|---|---|---|
| `stripeAccountId` | **User** | Transfer destination |
| `stripeOnboardingComplete` | **User** | Gate payouts |
| `stripeOnboardingComplete` | **User** (via populate) | Payout dashboard KPI `stripeOnboarded` |
| `stripeTransferId` | **Booking** | Record of payout transfer |
| `vendorPaid` / `vendorPaidAt` | **Booking** | Payout status |

Admin does **not** read Vendor model for Stripe state.

---

## 8. Missing Fields Gap (Stripe Prefill Context)

Goal: prefill these fields into Stripe **before** generating the onboarding link.

### First name

| Question | Answer |
|---|---|
| Collected at registration? | **Yes** — personal: `firstName`; business: `businessName` → `User.firstName` |
| On Vendor model? | Indirectly as `businessName` |
| On User model? | **`firstName`** |
| Sent to Stripe? | **No** |
| What needs to change? | Call `stripe.accounts.update` with `individual.first_name` or `company`/`business_profile` name; map from User/Vendor based on `accountType` |

### Last name

| Question | Answer |
|---|---|
| Collected at registration? | **Personal only** — `lastName`; business: **not collected** |
| On Vendor model? | **No** dedicated field |
| On User model? | **`lastName`** (personal only) |
| Sent to Stripe? | **No** |
| What needs to change? | Collect last name for business representatives; map to `individual.last_name`; call `accounts.update` |

### Date of birth

| Question | Answer |
|---|---|
| Collected at registration? | **No** |
| On Vendor model? | **No** |
| On User model? | **No** |
| Sent to Stripe? | **No** |
| What needs to change? | Add DOB to registration or payout-setup step; map to `individual.dob.day/month/year` in `accounts.update` |

### IBAN

| Question | Answer |
|---|---|
| Collected at registration? | **No** |
| On Vendor model? | **No** |
| On User model? | **No** |
| Sent to Stripe? | **No** |
| What needs to change? | Collect IBAN (securely); create bank token or pass `external_account` to `accounts.update` before Account Link |

### Country

| Question | Answer |
|---|---|
| Collected at registration? | **No** explicit country field |
| On Vendor model? | **No** |
| On User model? | **No** |
| Sent to Stripe? | **No** |
| What needs to change? | Add `country` field (default `NL` if applicable); map to `individual.address.country` / `company.address.country` |

### Address line 1

| Question | Answer |
|---|---|
| Collected at registration? | **Partial** — `fullAddress` as single free-text string |
| On Vendor model? | **`businessLocation`** (same string) |
| On User model? | **`address`** |
| Sent to Stripe? | **No** |
| What needs to change? | Split into structured `line1` (and optionally keep fullAddress); map to Stripe address.line1; may need parsing if keeping single field |

### Address line 2

| Question | Answer |
|---|---|
| Collected at registration? | **No** |
| On Vendor model? | **No** |
| On User model? | **No** |
| Sent to Stripe? | **No** |
| What needs to change? | Add optional `addressLine2` to registration/profile; map to `address.line2` |

### Postal code

| Question | Answer |
|---|---|
| Collected at registration? | **Yes** — `postalCode` (optional for business — not in requiredBusiness) |
| On Vendor model? | **No** |
| On User model? | **`postalCode`** |
| Sent to Stripe? | **No** |
| What needs to change? | Map to `individual.address.postal_code` / `company.address.postal_code` in `accounts.update` |

### City

| Question | Answer |
|---|---|
| Collected at registration? | **Yes** — `city` (optional for business) |
| On Vendor model? | **No** |
| On User model? | **`city`** |
| Sent to Stripe? | **No** |
| What needs to change? | Map to `address.city` in `accounts.update` |

### Website URL / Product description

| Question | Answer |
|---|---|
| Collected at registration? | **Yes** — `businessWebsite`; descriptions via `businessDescription`, `description`, `tagline` |
| On Vendor model? | **`businessWebsite`**, **`businessDescription`**, **`description`** |
| On User model? | **No** (website); descriptions not on User schema |
| Sent to Stripe? | **No** |
| What needs to change? | Map `businessWebsite` → `business_profile.url`; map description → `business_profile.product_description` in `accounts.update` |

### Implementation pattern (recommended)

Insert between **`connect`** and **`onboarding-link`**:

1. Load User + Vendor by `req.user.id` / `req.user.vendorId`
2. Build `stripe.accounts.update(stripeAccountId, { business_type, individual|company, business_profile, external_account, tos_acceptance })`
3. Then create Account Link with `collection_options` to collect only remaining requirements

**Also needed:** webhook handlers for `account.updated` to sync `stripeOnboardingComplete` without polling.

---

## 9. Full Vendor Route Map

Routes vendors typically use, grouped by mount prefix. **Full path = mount + route path.**

### Authentication & registration (`/api/auth`)

| Method | Path | Auth | Handler |
|---|---|---|---|
| POST | `/api/auth/send-otp` | None | `sendOtpForRegister` |
| POST | `/api/auth/check-registered` | rateLimit, csrf | `checkRegisteredUser` |
| POST | `/api/auth/vendor/register` | rateLimit, csrf | `registerVendor2` |
| POST | `/api/auth/vendor/login` | None | `vendorLogin` |
| POST | `/api/auth/vendor/reset-password-for-employee` | None | `resetPasswordForEmployee` |
| POST | `/api/auth/logout` | `requireAuth` | `logout` |
| GET | `/api/auth/me` | `requireAuth` | `getCurrentUser` |
| PATCH | `/api/auth/fcm-token` | `requireAuth` | `updateFcmToken` |
| POST | `/api/auth/vendor/stripe/connect` | `requireAuth` | `connectVendorStripe` |
| GET | `/api/auth/vendor/stripe/onboarding-link` | `requireAuth` | `getStripeOnboardingLink` |
| GET | `/api/auth/vendor/stripe/onboarding-status` | `requireAuth` | `checkStripeOnboardingStatus` |

### Vendor marketplace profile (`/api/vendor` — `routes/client/vendors.js`)

| Method | Path | Auth | Handler |
|---|---|---|---|
| GET | `/api/vendor/all` | None | `getAllVendors` |
| GET | `/api/vendor/bycategory` | None | `getVendorsByCategory` |
| POST | `/api/vendor/bycategory/:categoryId` | None | `getVendorsByCategory` |
| GET | `/api/vendor/featured` | None | `getFeaturedVendors` |
| GET | `/api/vendor/profile/:vendorId` | None | `getVendorProfile` |
| POST | `/api/vendor/details/:vendorId` | None | `getVendorFullDetails` |
| GET | `/api/vendor/vendorprofile` | `requireAuth`, `requireVendor` | `getVendorProfile` |
| PUT | `/api/vendor/vendorprofile` | `requireAuth`, `requireVendor` | `updateVendorProfile` |
| GET | `/api/vendor/business-details` | `requireAuth`, `requireVendor` | `getVendorBusinessDetails` |
| GET | `/api/vendor/dashboard` | `requireAuth`, `requireVendor` | `getVendorDashboard` |

### Vendor profile management (`/api/vendor/profile`)

| Method | Path | Auth | Handler |
|---|---|---|---|
| GET | `/api/vendor/profile/` | `requireAuth` | `getProfile` |
| PUT | `/api/vendor/profile/update` | `requireAuth` | `updateProfile` |
| PUT | `/api/vendor/profile/update-delivery-charges` | `requireAuth` | `updateDeliveryCharges` |
| POST | `/api/vendor/profile/get-sub-category-by-categoryIds` | None | `subCategoryFromCategory` |
| POST | `/api/vendor/profile/request-kvk-change` | None | `sendKVKRequest` |
| GET | `/api/vendor/profile/get-main-category/:vendorId` | None | `getMainCategoriesbyVendorId` |
| PUT | `/api/vendor/profile/admin/update/:id` | None | `updateProfileByAdmin` |

### Dashboard (`/api/vendor/dashboard`)

| Method | Path | Auth | Handler |
|---|---|---|---|
| GET | `/api/vendor/dashboard/analytics` | `requireAuth` | `getDashboardAnalytics` |

### Listings (`/api/vendor/listings`)

| Method | Path | Auth | Handler |
|---|---|---|---|
| GET | `/api/vendor/listings/all` | `requireAuth` | `getVendorListings` |
| GET | `/api/vendor/listings/overview` | `requireAuth` | `getVendorListingsOverview` |
| PATCH | `/api/vendor/listings/:id/toggle-status` | `requireAuth` | `toggleListingStatus` |
| POST | `/api/vendor/listings/create` | `requireAuth` | `createListing` |
| DELETE | `/api/vendor/listings/delete/:id` | `requireAuth` | `deleteListing` |
| PUT | `/api/vendor/listings/update/:id` | `requireAuth` | `updateListing` |
| GET | `/api/vendor/listings/listings/filter` | `requireAuth` | `filterByCategory` |

### Bookings (`/api/vendor/bookings`)

| Method | Path | Auth | Handler |
|---|---|---|---|
| GET | `/api/vendor/bookings/details/:bookingId` | `requireAuth` | `getVendorBookingById` |
| GET | `/api/vendor/bookings/analytics` | `requireAuth` | `getVendorBookingAnalytics` |
| POST | `/api/vendor/bookings/:id/accept` | `requireAuth`, `requireVendor` | `acceptBooking` |
| POST | `/api/vendor/bookings/:id/reject` | `requireAuth` | `rejectBooking` |
| POST | `/api/vendor/bookings/create-payment-intent` | None | `createPaymentIntent` |
| POST | `/api/vendor/bookings/on-payment-success` | None | `paymentConfirmation` |
| GET | `/api/vendor/bookings/amount-to-pay/:id` | None | `getAmountToPay` |

### Bookings shared (`/api/booking`)

| Method | Path | Auth | Handler |
|---|---|---|---|
| GET | `/api/booking/pending` | `requireAuth`, `requireVendor` | `getPendingBookings` |
| GET | `/api/booking/vendor-history` | `requireAuth`, `requireVendor` | `getVendorBookingHistory` |
| GET | `/api/booking/:id` | `requireAuth` | `getBookingDetails` |
| GET | `/api/booking/:id/details` | `requireAuth` | `getBookingSimpleDetails` |
| GET | `/api/booking/:id/track` | `requireAuth` | `getBookingSummary` |
| GET | `/api/booking/:id/direction` | `requireAuth` | `TrackBooking` |

### Tracking (`/api/vendor/tracking`)

| Method | Path | Auth | Handler |
|---|---|---|---|
| GET | `/api/vendor/tracking/` | `requireAuth` | `getVendorBookings` |
| GET | `/api/vendor/tracking/purchases` | `requireAuth`, `requireVendor` | `getVendorPurchases` |
| POST | `/api/vendor/tracking/:id/mark-on-the-way` | `requireAuth`, `requireVendor` | `markBookingOnTheWay` |
| POST | `/api/vendor/tracking/:id/mark-picked-up` | `requireAuth` | `markBookingPickedUp` |
| POST | `/api/vendor/tracking/:id/mark-completed` | `requireAuth`, `requireVendor` | `markBookingCompleted` |
| POST | `/api/vendor/tracking/:id/received-back` | `requireAuth`, `requireVendor` | `markAsReceivedBack` |

### Earnings (`/api/vendor/earnings`)

| Method | Path | Auth | Handler |
|---|---|---|---|
| GET | `/api/vendor/earnings/analytics` | `requireAuth` | `getVendorEarningsAnalytics` |
| GET | `/api/vendor/earnings/service/analytics` | `requireAuth` | `getServiceItemEarningsAnalytics` |

### Items (`/api/vendor/items`)

| Method | Path | Auth | Handler |
|---|---|---|---|
| POST | `/api/vendor/items/create` | `requireAuth` | `createItem` |
| GET | `/api/vendor/items/overview` | `requireAuth` | `getVendorItemsOverview` |
| PUT | `/api/vendor/items/update/:itemId` | `requireAuth` | `updateItem` |
| GET | `/api/vendor/items/item-detail/:itemId` | `requireAuth` | `itemDetailById` |
| PUT | `/api/vendor/items/update-listing/:itemId` | `requireAuth`, `requireVendor` | `updateItemListing` |
| DELETE | `/api/vendor/items/delete/:itemId` | `requireAuth` | `deleteItem` |

### Stock — listings (`/api/vendor/stock`)

| Method | Path | Auth | Handler |
|---|---|---|---|
| POST | `/api/vendor/stock/event` | `requireAuth` | `createStockEvent` |
| GET | `/api/vendor/stock/table/:type` | `requireAuth` | `getStockTable` |
| GET | `/api/vendor/stock/logs` | `requireAuth` | `getStockLogs` |

### Stock — service items (`/api/vendor/itemstock`)

| Method | Path | Auth | Handler |
|---|---|---|---|
| POST | `/api/vendor/itemstock/event` | `requireAuth` | `createStockEvent` |
| GET | `/api/vendor/itemstock/table/:type` | `requireAuth` | `getStockTable` |
| GET | `/api/vendor/itemstock/logs` | `requireAuth` | `getStockLogs` |
| PUT | `/api/vendor/itemstock/quantity` | `requireAuth` | `updateItemQuantity` |

### Billing (`/api/vendor/billing`)

| Method | Path | Auth | Handler |
|---|---|---|---|
| GET | `/api/vendor/billing/invoices` | `requireAuth` | `getVendorBillingInvoices` |
| GET | `/api/vendor/billing/invoice/:invoiceId/download` | `requireAuth` | `downloadInvoice` |

### Roles & employees (`/api/vendor/roles`)

| Method | Path | Auth | Handler |
|---|---|---|---|
| GET | `/api/vendor/roles/designations` | `requireAuth`, `requireVendor` | `getAllDesignations` |
| POST | `/api/vendor/roles/admin/create-designation` | `requireAuth`, `requireVendor` | `createDesignation` |
| POST | `/api/vendor/roles/role-users` | `requireAuth` | `createRoleUser` |
| GET | `/api/vendor/roles/role-users` | `requireAuth` | `getAllRoleUsers` |
| DELETE | `/api/vendor/roles/designations/:designationId` | `requireAuth` | `deleteDesignation` |
| DELETE | `/api/vendor/roles/role-users/:employeeId` | `requireAuth` | `deleteRoleUser` |
| PUT | `/api/vendor/roles/designations/:designationId` | `requireAuth`, `requireVendor` | `editDesignation` |
| PUT | `/api/vendor/roles/role-users/:employeeId` | `requireAuth` | `editRoleUser` |
| POST | `/api/vendor/roles/register-vendor-from-role` | None | `registerVendorFromUser` |

### Designations legacy (`/api` — `vendorDesignationsROute.js`)

| Method | Path | Auth | Handler |
|---|---|---|---|
| POST | `/api/vendor/create-designation` | None | `createDesignation` |
| GET | `/api/vendor/fetch-designations/:id` | None | `getDesignations` |
| GET | `/api/:id` | None | `getDesignation` |
| PUT | `/api/vendor/update-designation/:id` | None | `updateDesignation` |
| DELETE | `/api/vendor/delete-designation/:id` | None | `deleteDesignation` |

### Language (`/api/vendor/language`)

| Method | Path | Auth | Handler |
|---|---|---|---|
| POST | `/api/vendor/language/translate` | None | `translateDutchToEnglish` |

### Notifications (`/api/notifications`)

| Method | Path | Auth | Handler |
|---|---|---|---|
| GET | `/api/notifications/vendor-notifications` | `requireAuth` | inline handler |
| PATCH | `/api/notifications/:id/read` | `requireAuth` | inline handler |

### Sale item orders (`/api` — `saleItemPurchase.js`)

| Method | Path | Auth | Handler |
|---|---|---|---|
| GET | `/api/vendor-order-history` | `requireAuth` | `getSaleItemHistoryForVendor` |
| POST | `/api/update-order-status/:orderId` | `requireAuth` | `updateSaleItemOrderStatus` |

### Settings (`/api/settings`)

| Method | Path | Auth | Handler |
|---|---|---|---|
| POST | `/api/settings/vendor/full-data` | None | `getVendorFullData` |

### Payments (`/api/payments`)

| Method | Path | Auth | Handler |
|---|---|---|---|
| POST | `/api/payments/create-subscription` | None | `createSubscription` |

### Messaging / chat (vendor may use — **no auth on most routes**)

| Method | Path | Auth | Handler |
|---|---|---|---|
| GET | `/api/messages/:conversationId/:userId` | None | `getMessages` |
| DELETE | `/api/messages/:conversationId/:userId` | None | `softDeleteMessage` |
| POST | `/api/conversations/` | None | `createChatUserWithVendor` |
| GET | `/api/conversations/:id/:type` | None | `getConversations` |
| GET | `/api/conversations/single/:userId/:vendorId` | None | `getSingleConversationWithVendor` |
| PATCH | `/api/conversations/block/:id` | None | `blockConversation` |
| PATCH | `/api/conversations/unblock/:id` | None | `unblockConversation` |
| PATCH | `/api/conversations/report/:id` | None | `reportConversation` |
| POST | `/api/chatrooms/` | None | `getOrCreateRoom` |
| GET | `/api/chatrooms/:userId` | None | `getUserRooms` |
| GET | `/api/chatrooms/recent/:userId` | None | `getRecentChats` |

### Unmounted vendor route file

| File | Status |
|---|---|
| `routes/vendor/SaleItemPurchase.js` | **Not mounted in `app.js`** — duplicate of `/api/vendor-order-history` |

---

## Appendix — Key Files Reference

| File | Role |
|---|---|
| `controllers/authController.js` | Registration, login, Stripe Connect |
| `controllers/vendor/profileController.js` | Profile GET/PUT |
| `controllers/client/vendorController.js` | Alternate vendor profile/dashboard |
| `controllers/vendor/bookingAnalytics.js` | Bookings + payment intents |
| `controllers/vendor/trackingController.js` | Booking lifecycle tracking |
| `controllers/admin/PaymentController.js` | Admin payouts (Stripe transfers) |
| `controllers/admin/userManagement.js` | Vendor approval |
| `middleware/authMiddleware.js` | JWT auth, vendorId resolution |
| `models/User.js` | Auth + Stripe Connect fields |
| `models/Vendor.js` | Marketplace vendor profile |

---

*End of audit.*
