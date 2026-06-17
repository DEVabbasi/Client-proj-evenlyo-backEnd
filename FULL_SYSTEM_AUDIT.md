# Evenlyo Backend — Full System Audit

**Document type:** Read-only technical audit  
**Generated:** June 2026  
**Codebase:** `Evenlyo-BACKEND` (Node.js / Express / MongoDB)  
**Entry point:** `server.js` → `app.js`  
**API base path:** `/api` (no `/v1` prefix in code; default port from `PORT` env, commonly `4040`)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Project Structure](#2-project-structure)
3. [Database Models](#3-database-models)
4. [User Roles and Permissions](#4-user-roles-and-permissions)
5. [API Routes — Complete Map](#5-api-routes--complete-map)
6. [Feature Breakdown](#6-feature-breakdown--every-feature-in-the-system)
7. [Stripe Integration — Full Detail](#7-stripe-integration--full-detail)
8. [Middleware Chain](#8-middleware-chain)
9. [Error Handling and Validation](#9-error-handling-and-validation)
10. [Notifications System](#10-notifications-system)
11. [File Uploads](#11-file-uploads)
12. [Known Issues and Technical Debt](#12-known-issues-and-technical-debt)
13. [Summary Diagram](#13-summary-diagram)

---

## 1. Project Overview

### What is this system?

Evenlyo is an **event marketplace backend**. In plain English:

- **Clients** browse vendors and listings (venues, services, equipment), add items to a cart, request bookings, pay online, track their event, leave reviews, and open support tickets.
- **Vendors** register businesses, connect Stripe for payouts, create listings and sale items, manage stock, accept/reject bookings, track deliveries, view earnings, manage employees with roles, and subscribe to platform plans.
- **Admins** (admin employees) oversee users, bookings, payments, refunds, platform settings, content (blogs, FAQs, knowledge base), and support tickets.

The server also runs **real-time chat** (Socket.IO), **push notifications** (Firebase FCM), **email** (Nodemailer/Gmail SMTP), **scheduled jobs** (payment reminders, auto-cancellation), and an **AI chatbot** (OpenAI).

### User types and capabilities

| User type | Who they are | Main capabilities |
|-----------|--------------|-------------------|
| **Client** | Event organiser / buyer | Register, login (email or Google), browse, cart, book, pay, track, cancel, claim, review |
| **Vendor (owner)** | Business account on `User` with `userType: vendor` | Full vendor dashboard, listings, bookings, Stripe Connect, employees, earnings |
| **Vendor employee** | `Employee` document linked to vendor | Login as vendor with designation permissions; limited by role |
| **Admin employee** | `AdminEmployee` document | Admin panel: users, bookings, payments, settings, content |
| **Legacy Admin** | `Admin` model | Referenced in permission middleware; largely superseded by `AdminEmployee` |

### Tech stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js (no engine pin in `package.json`; use current LTS in production) |
| Framework | Express **5.1.0** |
| Database | MongoDB via **Mongoose 8.x** |
| Auth | **JWT** (Bearer token), **bcrypt** passwords, **OTP** email verification, **Google** via Firebase ID token |
| Real-time | **Socket.IO 4.x** |
| Payments | **Stripe** (PaymentIntents, Connect Express, Transfers, Refunds, Subscriptions) |
| Push | **Firebase Admin SDK** (FCM) |
| Email | **Nodemailer** (SMTP, typically Gmail) |
| AI | **OpenAI** API (chatbot + translation) |
| Scheduling | **node-cron** |
| Logging | **Winston** + **Morgan** |
| i18n | **i18next** (configured; locale files missing — see issues) |
| PDF | **PDFKit** (vendor invoices) |
| Process manager | Heroku (`Procfile`: `web: node server.js`) |

**ORM:** Mongoose (not Sequelize/Prisma).

### Environment variables

Variables found in code and `.env`. **Never commit real secrets**; rotate any credentials exposed in repos.

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | MongoDB connection string |
| `PORT` | HTTP server port (default `5000` in code if unset) |
| `NODE_ENV` | `development` / `production` — affects error messages, CSRF skip, payment URLs |
| `LOG_LEVEL` | Winston log level (default `info`) |
| `JWT_SECRET` | Signs access tokens and general JWT payloads |
| `JWT_PASSWORD_RESET_SECRET` | Signs password-reset tokens |
| `STRIPE_SECRET_KEY` | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Verifies Stripe webhook signatures |
| `EMAIL_HOST` | SMTP host (e.g. `smtp.gmail.com`) |
| `EMAIL_PORT` | SMTP port (e.g. `587`) |
| `EMAIL_USER` | SMTP username / from-address |
| `EMAIL_PASS` | SMTP password (Gmail app password) |
| `CONTACT_EMAIL` | Inbox for contact-form emails (default `info@evenlyo.nl`) |
| `FRONTEND_URL` | Links in promotional emails |
| `STAGING_CLIENT_URL` | Client payment link base in development |
| `LIVE_CLIENT_URL` | Client payment link base in production |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_EMAIL` / `SMTP_PASSWORD` | Alternate SMTP config in `sendEmail` helper (mailer.js) |
| `OPENAI_API_KEY` | Chatbot and Dutch→English translation |
| `FIREBASE_PROJECT_ID` | Firebase Admin (optional env-based init) |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account email |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | Base64 JSON in unused `firebaseConfig.js` |
| `FIREBASE_WEB_CLIENT_ID` | Referenced in commented Google OAuth code |
| `API_BASE_URL` | Present in `.env` but **not referenced in application code** |
| `PAYMENT_URL_STAGING` / `PAYMENT_URL_LIVE` | Present in `.env` but **not referenced in application code** |

### Third-party services

| Service | Used for |
|---------|----------|
| **MongoDB Atlas** | Primary database |
| **Stripe** | Client payments, vendor Connect onboarding, admin payouts/transfers, refunds, vendor subscriptions |
| **Firebase Admin** | Google sign-in token verification, FCM push notifications |
| **Gmail SMTP (Nodemailer)** | OTP, booking emails, reminders, admin notifications |
| **OpenAI** | Client chatbot, vendor language translation endpoint |
| **Cloudinary** | **Not integrated server-side** — clients upload images; backend stores URL strings only |
| **Socket.IO** | Real-time messaging and cart-submit booking |
| **Heroku** | Deployment (`Procfile`) |

**Installed but unused in source:** `redis`, `connect-redis`, `connect-mongo`, `express-session`, `passport`, `passport-google-oauth20`, `googleapis`, `swagger-jsdoc`, `swagger-ui-express`.

### High-level architecture

```
┌─────────────┐     HTTPS/WS      ┌──────────────────────────────────────┐
│ Web/Mobile  │ ────────────────► │  Express API (app.js) + Socket.IO      │
│  Clients    │                   │  /api/* routes, middleware, controllers │
└─────────────┘                   └───────────┬────────────────────────────┘
                                              │
              ┌───────────────────────────────┼───────────────────────────────┐
              │                               │                               │
              ▼                               ▼                               ▼
     ┌────────────────┐              ┌─────────────────┐              ┌─────────────────┐
     │    MongoDB     │              │     Stripe      │              │ Firebase (FCM)  │
     │  (Mongoose)    │              │ Payments/Connect│              │  Push + Google  │
     └────────────────┘              └─────────────────┘              └─────────────────┘
              │                               │
              ▼                               ▼
     ┌────────────────┐              ┌─────────────────┐
     │  node-cron     │              │  Gmail SMTP     │
     │ paymentReminder│              │  (Nodemailer)   │
     └────────────────┘              └─────────────────┘
              │
              ▼
     ┌────────────────┐
     │    OpenAI      │
     │   (chatbot)    │
     └────────────────┘
```

---

## 2. Project Structure

### Directory tree (ASCII)

```
Evenlyo-BACKEND/
├── app.js                    # Express app, CORS, routes, error handler
├── server.js                 # HTTP server + Socket.IO + cron import
├── package.json
├── Procfile                  # Heroku: web: node server.js
├── config/
│   ├── db.js                 # MongoDB connect + ensureAppSettings
│   ├── stripe.js             # Stripe SDK singleton
│   └── firebase.js           # Firebase Admin init
├── middleware/
│   └── authMiddleware.js     # JWT auth, roles, rate limit, CSRF
├── models/                   # 34 Mongoose schemas
├── routes/                   # 53 route files (2 unmounted)
├── controllers/              # 54 controller modules
├── utils/                    # Helpers (mailer, jwt, booking, FCM, etc.)
├── chatbot/                  # OpenAI tools + system prompt
├── sockets/
│   └── chatSockets.js        # Socket.IO handlers
├── corn/                     # Cron jobs (typo: "corn")
│   └── paymentReminder.js
├── locales/                  # MISSING — referenced by i18next
├── testSocket.js             # Standalone socket test (not production)
├── evenlyo-firebase-adminsdk-*.json  # SECURITY: committed key file
└── *.md audits               # STRIPE_REGISTRATION_AUDIT, VENDOR_FLOW_AUDIT, etc.
```

### Files by category

#### Config (`config/`)

| File | Description |
|------|-------------|
| `db.js` | Connects MongoDB, logs URI, runs `ensureAppSettings` on connect |
| `stripe.js` | Exports Stripe client from `STRIPE_SECRET_KEY` |
| `firebase.js` | Initializes Firebase Admin from env vars or `serviceAccountKey.json` or repo JSON file |

#### Middleware (`middleware/`)

| File | Description |
|------|-------------|
| `authMiddleware.js` | All authentication and authorisation middleware |

#### Models (`models/` — 34 files)

See [Section 3](#3-database-models).

#### Routes (`routes/` — 53 files)

| File | Mount prefix (from `app.js`) | Notes |
|------|------------------------------|-------|
| `auth.js` | `/api/auth` | Login, register, OTP, Stripe Connect |
| `client/categories.js` | `/api/categories` | Public categories |
| `client/listings.js` | `/api/listings` | Public listing browse/search |
| `client/subcategories.js` | `/api/subcategories` | Public subcategories |
| `client/bookings.js` | `/api/booking` | Client + some vendor booking routes |
| `client/cart.js` | `/api/cart` | Shopping cart |
| `client/plans.js` | `/api/plans` | Subscription plans (public) |
| `client/blogs.js` | `/api/blogs` | Public blogs + comments |
| `settings.js` | `/api/settings` | User settings |
| `client/support.js` | `/api/support` | Contact + tickets |
| `notifications.js` | `/api/notifications` | In-app notifications |
| `client/vendors.js` | `/api/vendor` | **Client** vendor discovery (not vendor dashboard) |
| `client/Items.js` | `/api/items` | Sale items list |
| `client/purchases.js` | `/api/client/purchases` | Place sale item order |
| `client/faqs.js` | `/api/faqs` | Public FAQs |
| `client/appSettings.js` | `/api` | `GET /api/getSetings` |
| `client/saleItemPurchase.js` | `/api` | Sale orders + vendor order history |
| `client/chatbot.js` | `/api/chatbot` | AI chatbot |
| `vendor/dashboard.js` | `/api/vendor/dashboard` | Vendor analytics |
| `vendor/vendorDesignationsROute.js` | `/api` | Legacy vendor designations |
| `vendor/listings.js` | `/api/vendor/listings` | Vendor listing CRUD |
| `vendor/booking.js` | `/api/vendor/bookings` | Accept/reject, payment helpers |
| `vendor/tracking.js` | `/api/vendor/tracking` | Booking lifecycle tracking |
| `vendor/billing.js` | `/api/vendor/billing` | Invoices (download route dead) |
| `vendor/profile.js` | `/api/vendor/profile` | Vendor profile + KVK request |
| `vendor/role.js` | `/api/vendor/roles` | Designations + employees |
| `vendor/earnings.js` | `/api/vendor/earnings` | Earnings analytics |
| `vendor/stock.js` | `/api/vendor/stock` | Listing stock events |
| `vendor/items.js` | `/api/vendor/items` | Service item CRUD |
| `vendor/itemStock.js` | `/api/vendor/itemstock` | Service item stock |
| `vendor/langaugeRoute.js` | `/api/vendor/language` | OpenAI translation |
| `payments.js` | `/api/payments` | PaymentIntents + webhook |
| `admin/dashboard.js` | `/api/admin/dashboard` | Admin stats |
| `admin/userManagement.js` | `/api` | Client/vendor admin CRUD + emails |
| `admin/bookings.js` | `/api/admin/bookings` | Booking analytics |
| `admin/report.js` | `/api/admin/report` | Report stats |
| `admin/tracking.js` | `/api/admin/tracking` | Booking tracking admin |
| `admin/listingsManagement.js` | `/api/admin/listing` | Categories/subcategories admin |
| `admin/plans.js` | `/api/admin/plans` | Plan management |
| `admin/adminDesignations.js` | `/api` | Admin role designations |
| `admin/adminEmployees.js` | `/api` | Admin employee CRUD |
| `admin/support.js` | `/api/admin/support` | Support tickets |
| `admin/settings.js` | `/api/admin/settings` | Platform fees, notifications |
| `admin/blog.js` | `/api/admin/blogs` | Blog CMS |
| `admin/faqs.js` | `/api/admin/faqs` | FAQ CMS |
| `admin/Payment.js` | `/api/admin/payments` | Payouts, refunds, claims |
| `admin/knowledgeBase.js` | `/api` | QnA knowledge base |
| `admin/chatbotTickets.js` | `/api` | Chatbot ticket admin |
| `messageRoutes.js` | `/api/messages` | Chat messages |
| `conversationRoutes.js` | `/api/conversations` | Conversations |
| `chatRoomRoutes.js` | `/api/chatrooms` | Chat rooms |
| **`stock.js`** | **UNMOUNTED** | Broken import to missing `controllers/stockController.js` |
| **`vendor/SaleItemPurchase.js`** | **UNMOUNTED** | Superseded by `client/saleItemPurchase.js` |

#### Controllers (`controllers/` — 54 files)

| Area | Files |
|------|-------|
| Root | `authController.js`, `paymentController.js`, `stripeWebhookController.js`, `notificationController.js`, `settingsController.js`, `messageController.js`, `conversationController.js`, `chatRoomController.js` |
| `admin/` | `dashboardController`, `userManagement`, `bookingAnalyticsController`, `reportController`, `trackingController`, `listingManagement`, `planController`, `adminDesignationController`, `adminEmployeeController`, `supportController`, `settingsController`, `blogManagement`, `faqController`, `PaymentController`, `knowledgeBaseController`, `chatbotTicketController` |
| `client/` | `bookingController`, `listingController`, `categoryController`, `subCategoryController`, `cartController`, `planController`, `blogController`, `supportController`, `vendorController`, `ItemController`, `saleItemPurchaseController`, `faqController`, `appSettingsController`, `chatbotController` |
| `vendor/` | `dashboardController`, `listingManagement`, `bookingAnalytics`, `trackingController`, `billingController`, `profileController`, `RoleManagement`, `earningController`, `stockController`, `itemManagement`, `serviceItemStockController`, `langaugeController`, `vendorDesignationsController`, `SaleItemPurchaseController` |

#### Utils (`utils/`)

| File | Description |
|------|-------------|
| `jwtUtils.js` | Sign/verify JWT access and password-reset tokens |
| `logger.js` | Winston logger + `logRequest` middleware |
| `mailer.js` | All email templates (OTP, booking, promotional, etc.) |
| `notifications.js` | Firebase FCM `sendPushOnly` |
| `fcmToken.js` | Resolve/update FCM tokens on User |
| `notifyVendorNewBooking.js` | New booking → notification + push |
| `bookingRequest.js` | Transactional booking creation, stock, fees |
| `bookingUtils.js` | Booking helpers |
| `otpUtils.js` | OTP generate/validate + email |
| `ensureAppSettings.js` | Seed Settings document |
| `activityLogger.js` | Vendor activity logs |
| `resolveVendorUserId.js` | Map vendor profile/employee → owner userId |
| `tracking.js` | Tracking helpers |
| `textUtils.js` | Multilingual text helpers |
| `vendorDisplayName.js` | Display names for emails |
| `firebaseConfig.js` | **Unused** alternate Firebase init |

#### Chatbot (`chatbot/`)

| File | Description |
|------|-------------|
| `systemPrompt.js` | OpenAI system instructions |
| `toolDefinitions.js` | Function schemas for OpenAI |
| `toolRegistry.js` | Maps tool names to handlers |
| `tools/*.js` | `checkAvailability`, `getBookingStatus`, `getSubcategories`, `getVendorInfo`, `searchKnowledgeBase`, `searchListings` |

#### Other root files

| File | Description |
|------|-------------|
| `Chat.json` | Sample/fixture chat data |
| `testSocket.js` | Dev Socket.IO test server |
| `README.md`, `README_STRIPE.md` | Documentation |
| `STRIPE_REGISTRATION_AUDIT.md`, `VENDOR_FLOW_AUDIT.md` | Prior audits |
| `evenlyo-firebase-adminsdk-*.json` | Firebase credentials (**should not be in repo**) |

### Dead / legacy / unmounted code flags

| Item | Issue |
|------|-------|
| `routes/stock.js` | Not mounted; imports missing controller |
| `routes/vendor/SaleItemPurchase.js` | Not mounted |
| `routes/vendor/billing.js` | `downloadInvoice` route after `module.exports` |
| `utils/firebaseConfig.js` | Never imported |
| `utils/seeder.js` | Referenced by `npm run seed` — **missing** |
| `package.json` `main: index.js` | File does not exist |
| `locales/` directory | Missing — i18n broken |
| `app.js` bottom | Commented migration `addCreatedByIdToUsers` |
| Duplicate designation systems | `Designation.js` vs `vendorDesignations.js` |
| `models/Role.js` | Legacy vs vendor designation system |
| `models/Admin.js` | Legacy; admin login uses `AdminEmployee` |

---

## 3. Database Models

MongoDB is accessed exclusively through **Mongoose**. Collection names below are Mongoose defaults unless `collection` is set in schema.

### Entity relationship diagram

```
                    ┌─────────────┐
                    │  Category   │
                    └──────┬──────┘
                           │ 1:N
                    ┌──────▼──────┐
                    │ SubCategory │
                    └──────┬──────┘
                           │
     ┌─────────────────────┼─────────────────────┐
     │                     │                     │
┌────▼────┐          ┌─────▼─────┐         ┌─────▼─────┐
│ Listing │◄─────────│   User    │────────►│  Vendor   │
│         │  vendor  │ client/   │ userId  │ (profile) │
└────┬────┘          │ vendor    │         └───────────┘
     │               └─────┬─────┘
     │                     │
     │               ┌─────▼─────┐      ┌──────────────┐
     └──────────────►│ Booking   │◄────►│ PaymentIntent│
                     │ Request   │      └──────────────┘
                     └─────┬─────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌─────────────┐
        │Notification│ │ StockLog │ │  Billing    │
        └──────────┘ └──────────┘ └─────────────┘

┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ AdminEmployee│     │   Employee   │────►│VendorDesign.│
└─────────────┘     └──────────────┘     └─────────────┘

┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ Conversation│────►│   Message    │     │  ChatRoom   │
└─────────────┘     └──────────────┘     └─────────────┘

┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ ServiceItem │     │  saleorders  │     │    Cart     │
└─────────────┘     └──────────────┘     └─────────────┘
```

### Model reference (all 34)

#### User (`users`)

| Field | Type | Required | Default | Purpose |
|-------|------|----------|---------|---------|
| firstName, lastName | String | Conditional | — | Name (rules vary by userType/accountType) |
| email | String | Yes | — | Unique login |
| password | String | Conditional | `""` | Bcrypt hash; not for Google users |
| contactNumber, address, postalCode, city | String | No | `""` | Contact info |
| provider | String | No | `email` | `email` \| `google` |
| googleId | String | No | — | Sparse unique |
| accountType | String | Vendor only | — | `personal` \| `business` |
| kvkNumber, passportDetails | String | Conditional | — | Vendor KYC |
| userType | String | Yes | — | `client` \| `vendor` \| `admin` |
| profileImage | String | No | `""` | URL (Cloudinary from client) |
| isActive | Boolean | No | `true` | Account enabled |
| designationID | ObjectId | No | — | Legacy designation link |
| language | String | No | `english` | `english` \| `dutch` |
| createdById | ObjectId | No | `null` | Creator reference |
| notifications.email/push | Boolean | No | `true` | Preferences |
| stripeAccountId | String | No | `""` | Stripe Connect account |
| stripeOnboardingComplete | Boolean | No | `false` | Connect KYC done |
| lastLogin | Date | No | — | Last login time |
| role | ObjectId → Role | No | — | Legacy role ref |
| deliveryCharges | Number | No | `0` | Vendor delivery fee |
| webFcm, appFcm | String | No | — | FCM device tokens |

**Virtuals:** `fullName`  
**Indexes:** `{userType, isActive}`, `{provider}`  
**Pre-save:** Clears password for Google; validates email users have password

---

#### Vendor (`vendorDetails`)

Business profile linked to `User` via `userId`.

| Field | Type | Notes |
|-------|------|-------|
| userId | ObjectId → User | Required |
| businessName, businessEmail, businessPhone, businessWebsite | String | Business identity |
| teamType, teamSize, businessLocation | String/Number | Team info |
| businessLogo, businessImage | String | Image URLs |
| tagline, description, whyChooseUs, businessDescription | {en, nl} | Multilingual |
| mainCategories[], subCategories[] | ObjectId → Category/SubCategory | |
| rating.average, rating.totalReviews | Number | Aggregated |
| reviews[] | embedded | bookingId, clientId, rating, review {en,nl} |
| totalBookings, completedBookings | Number | Counters |
| isApproved, contactMeEnabled | Boolean | Defaults true |
| kvkNumber, passportDetails, accountType | String | Duplicated from User context |

**Indexes:** `{userId}`, `{mainCategories}`, `{approvalStatus}` — **bug: `approvalStatus` not in schema** (`isApproved` exists)

---

#### BookingRequest (`bookingrequests`)

Core booking document. See `models/Booking.js` for full schema.

**Key fields:** `trackingId` (unique string; **schema bug:** nested `condition` inside `trackingId` definition), `userId` → User, `vendorId` → User, `listingId` → Listing, `listingDetails` Object, `details` (dates, times, schedule, location, guestCount), `status` (pending → completed/cancelled/claim/etc.), `paymentStatus`, `statusHistory[]`, `pricingBreakdown`, `payments[]`, `paymentIntentId`, `AmountPaid`, `AmountLeft`, `platformFee`, `vendorPaid`, `stripeTransferId`, `claimDetails`, `securityRefundDetails`, reminder flags.

**Method:** `calculateHoursBetween(startTime, endTime)`  
**Indexes:** userId+status, vendorId+status, listingId, dates, paymentStatus, createdAt

---

#### Listing (`listings`)

Vendor service packages: multilingual title/description, `vendor` → User, `category`/`subCategory`, `pricing` Object, `images[]`, `quantity` (stock), `availability`, `location`, ratings, policies, etc.

---

#### ServiceItem (`serviceitems`) — file `models/Item.js`

Physical/digital sale items: title {en,nl}, categories, vendor, linkedListing, purchase/selling price, stockQuantity, image URL, delivery charges, location.

**Index:** `{mainCategory, subCategory}`

---

#### PaymentIntent (`paymentintents`)

| Field | Type | Purpose |
|-------|------|---------|
| internalId | String | UUID; unique client reference |
| stripeIntentId, clientSecret | String | Stripe PI |
| status | String | Stripe status mirror |
| listing, booking, user | ObjectId refs | Linked entities |
| amount, currency, quantity | Number/String | Payment details |
| paymentPurpose | enum | booking, subscription, deposit, other |
| metadata | Object | Extra Stripe metadata |

---

#### Notification (`notifications`)

Bilingual `title`/`message` {en,nl}, `vendorId`, `clientId`, `bookingId`, `notificationFor` (Client/Vendor/Admin), `isRead`, `isClientRead`, `createdAt`.

**Note:** No `type` field; some routes project `type` anyway.

---

#### Cart (`carts`)

User cart with embedded items, methods: `addItem`, `removeItem`, `clearCart`, `updateItemDetails`; virtuals `totalItems`, `estimatedTotal`.

---

#### Plan (`plans`)

Vendor subscription plans: pricing, features, `stripeProductId`, `stripePriceId`, discount fields, methods `isDiscountActive`, `getEffectivePrice`, virtual `discountedPrice`.

---

#### Billing (`billings`)

Vendor invoice records for platform billing.

---

#### saleorders (`saleorders`) — `models/SaleItemPurchase.js`

Sale item purchase orders: buyer, vendor, items, status, `paymentIntentId` (default `0` — type bug), pricing.

---

#### Category / SubCategory

Marketplace taxonomy; Category may validate Cloudinary URL on `icon`.

---

#### Blog (`blogs`)

Posts with embedded comments; sanitized HTML content.

---

#### FAQ (`faqs`)

Question/answer pairs; indexes reference fields not always in schema.

---

#### QnA (`qnas`) — `models/KnowledgeBase.js`

Chatbot knowledge base entries.

---

#### SupportTicket (`supporttickets`)

User support tickets with status, issue type, userEmail.

---

#### ChatbotTicket (`chatbottickets`)

Escalations from AI chatbot.

---

#### Message (`message`)

Chat messages: conversationId, sender, content, attachment URL object, read flags, soft delete.

---

#### Conversation (`conversations`)

Vendor-client threads: participants, block/report flags.

---

#### ChatRoom (`chatrooms`)

Room-based chat metadata.

---

#### Admin (`admins`)

Legacy admin users with permissions array.

---

#### AdminEmployee (`adminemployees`)

| Field | Purpose |
|-------|---------|
| name, email, password | Login credentials |
| role | Default `"Admin"` |
| status | `active` \| `inactive` |
| designationID | Admin designation |
| notificationSettings | email/push toggles for cancellations, Evenlyo Protect, registrations |

---

#### AdminDesignation (`admindesignations`)

Admin role templates with permissions.

---

#### Employee (`employees`)

Vendor staff: name, email, password, designation → VendorDesignation, vendor → User, `isActive` (not `status` — **auth middleware bug**).

---

#### VendorDesignation (`vendordesignations`)

Vendor role templates with permission strings.

---

#### Designation (`designations`)

Alternate/legacy designation model.

---

#### Role (`roles`)

Legacy role permissions on User.role ref.

---

#### OTP (`otps`)

email, otp, expiresAt, purpose for verification flows.

---

#### Settings (`settings`)

Singleton-style platform config: `bookingItemPlatformFee`, `salesItemPlatformFee`, `vat`, `adminNotificationSettings`, mobile app version popup flags.

---

#### StockLog / ServiceItemStockLog

Audit trail for listing stock and service item stock changes.

---

#### ActivityLog (`activitylogs`)

Vendor activity audit entries.

---

#### Review (`reviews`)

**Bug:** exported as `mongoose.model('reviews', reviewSchema)` but const named `Plan`.

---

## 4. User Roles and Permissions

### Role summary

```
┌──────────┐     JWT Bearer      ┌─────────────────┐
│  Client  │ ──────────────────► │  requireAuth    │
└──────────┘                     │  requireClient  │
                                   └────────┬────────┘
┌──────────┐                              │
│  Vendor  │ ──────────────────► requireVendor (+ Employee path)
└──────────┘
┌──────────┐
│  Admin   │ ──────────────────► requireAdmin (AdminEmployee lookup)
│ Employee │
└──────────┘
```

### Authentication implementation

1. **Registration:** Email + OTP (`OTP` model + `sendOTPEmail`) or Google Firebase ID token (`POST /api/auth/google`).
2. **Login:** Email/password → bcrypt compare → JWT via `signAccessToken` (30-day expiry) or `signToken` (no expiry in some flows).
3. **Password reset:** OTP + `JWT_PASSWORD_RESET_SECRET` token.
4. **Vendor employees:** Login via `vendorLogin`; token contains employee id; `requireAuth` loads `Employee`.
5. **Admin employees:** `adminLogin` issues token; `requireAdmin` loads `AdminEmployee` by id from token.

### Auth middleware (`middleware/authMiddleware.js`)

| Export | What it checks |
|--------|----------------|
| `requireAuth` | Bearer JWT; loads User, Employee, or AdminEmployee; sets `req.user` |
| `optionalAuth` | Optional JWT attach |
| `requireRole(roles)` | `req.user.userType` in roles array |
| `requireClient` | userType === client |
| `requireVendor` | userType === vendor |
| `requireAdmin` | AdminEmployee exists and active |
| `requirePermission(perms)` | Admin model permissions (legacy) |
| `requireActiveAdmin` | Admin/AdminEmployee status active |
| `rateLimit(max, windowMs)` | In-memory per-IP counter |
| `csrfProtection` | Origin/Referer check (skipped in dev/test) |
| `clientRoutes` | `[requireAuth, requireClient]` |
| `vendorRoutes` | `[requireAuth, requireVendor]` |
| `adminRoutes` | `[requireAuth, requireAdmin, requireActiveAdmin]` |

### Auth flow diagram

```
Client POST /api/auth/client/login
        │
        ▼
   rateLimit + csrfProtection
        │
        ▼
   authController.clientLogin
        │── find User, bcrypt password
        ▼
   signAccessToken({ id, userType, email })
        │
        ▼
   Response: { token, user }

Protected request GET /api/booking/history
        │
        ▼
   Authorization: Bearer <token>
        │
        ▼
   requireAuth ──► verifyAccessToken
        │── User.findById OR Employee OR AdminEmployee
        ▼
   requireClient (if applicable)
        │
        ▼
   bookingController.getBookingHistory
```

---

## 5. API Routes — Complete Map

Routes are grouped by domain. **Auth** column: middleware on route. **⚠** = no auth where it may be expected.

### Auth (`/api/auth`)

| Method | Path | Auth | Handler | File |
|--------|------|------|---------|------|
| POST | `/client/login` | rateLimit, csrf | clientLogin | authController |
| POST | `/vendor/login` | — | vendorLogin | authController |
| POST | `/vendor/reset-password-for-employee` | — | resetPasswordForEmployee | authController |
| POST | `/admin/login` | rateLimit, csrf | adminLogin | authController |
| POST | `/logout` | requireAuth | logout | authController |
| POST | `/send-otp` | rateLimit | sendOtpForRegister | authController |
| POST | `/check-registered` | rateLimit, csrf | checkRegisteredUser | authController |
| POST | `/client/register` | rateLimit, csrf | registerClient | authController |
| POST | `/verify-register-otp` | rateLimit | verifyOtpAndRegister | authController |
| POST | `/send-forgot-otp` | rateLimit | sendOtpForForgotPassword | authController |
| POST | `/verify-forgot-otp` | rateLimit | verifyOtpForForgotPassword | authController |
| POST | `/reset-password` | rateLimit, csrf | resetPassword | authController |
| POST | `/google` | rateLimit | googleAuth | authController |
| GET | `/me` | requireAuth | getCurrentUser | authController |
| PATCH | `/fcm-token` | requireAuth | updateFcmToken | authController |
| GET | `/health` | — | inline | routes/auth.js |
| GET | `/firebase-health` | — | inline | routes/auth.js |
| POST | `/vendor/register` | rateLimit, csrf | registerVendor2 | authController |
| POST | `/vendor/stripe/connect` | requireAuth | connectVendorStripe | authController |
| GET | `/vendor/stripe/onboarding-link` | requireAuth | getStripeOnboardingLink | authController |
| GET | `/vendor/stripe/onboarding-status` | requireAuth | checkStripeOnboardingStatus | authController |

### Client — Categories, Listings, Subcategories (public)

| Method | Path | Auth | Handler |
|--------|------|------|---------|
| GET | `/api/categories/`, `/all`, `/:id` | — | categoryController |
| GET | `/api/listings/*` (search, filter, featured, `:id`, availability, calendar) | — | listingController |
| GET | `/api/subcategories/*` | — | subCategoryController |

### Client — Bookings (`/api/booking`)

| Method | Path | Auth | Handler | Notes |
|--------|------|------|---------|-------|
| POST | `/request` | requireAuth, requireClient | createBookingRequest | |
| GET | `/accepted` | requireAuth, requireClient | getAcceptedBookings | |
| POST | `/:id/pay` | requireAuth, requireClient | markBookingAsPaid | |
| GET | `/history` | requireAuth | getBookingHistory | |
| POST | `/:id/mark-received` | requireAuth | markBookingReceived | |
| GET | `/:id/restock-again` | requireAuth | restockItem | |
| POST | `/:id/mark-finished` | requireAuth, requireClient | markBookingFinished | |
| POST | `/:id/claim` | requireAuth | createClaim | |
| POST | `/:id/cancel` | requireAuth, requireClient | cancelBooking | |
| POST | `/:id/review` | requireAuth | reviewBooking | |
| GET | `/pending` | requireAuth, requireVendor | getPendingBookings | |
| GET | `/vendor-history` | requireAuth, requireVendor | getVendorBookingHistory | |
| GET | `/:id`, `/:id/details`, `/:id/track`, `/:id/direction` | requireAuth | various | |
| POST | `/:id/create-payment-intent` | requireAuth, requireClient | createBookingPaymentIntent | |
| POST | `/request-by-status` | **⚠ none** | fetchBookingRequest | |
| POST | `/request-by-date` | **⚠ none** | fetchBookingRequestByDate | |

### Cart, Plans, Blogs, FAQs, Settings, Support

| Prefix | Key routes | Auth |
|--------|------------|------|
| `/api/cart` | add, wishlist, get, remove, update, submit, clear | requireAuth (+ requireClient for mutations) |
| `/api/plans` | GET `/` | — |
| `/api/blogs` | categories, list, detail, comments | — |
| `/api/faqs` | GET `/` | — |
| `/api/settings` | personal-info, password, notifications, vendor/full-data | requireAuth (except health, vendor/full-data) |
| `/api/support` | POST contact **⚠**, POST ticket | ticket: requireAuth |

### Notifications

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/notifications/` | requireAuth | Client notifications |
| GET | `/api/notifications/admin-notifications` | **⚠ none** | Admin feed |
| GET | `/api/notifications/vendor-notifications` | requireAuth | Vendor feed |
| PATCH | `/:id/client-read`, `/:id/read` | requireAuth | |
| PATCH | `/read-all` | **⚠ none** | Marks ALL notifications read globally |

### Client vendors (`/api/vendor` — discovery, not dashboard)

Public: `/all`, `/bycategory`, `/featured`, `/profile/:vendorId`, `/details/:vendorId`  
Protected: `/vendorprofile`, `/business-details`, `/dashboard` (requireAuth + requireVendor)

### Items & purchases

| Path | Auth | Handler |
|------|------|---------|
| GET `/api/items/list` | — | getItemsByCategory |
| POST `/api/client/purchases/place-order` | requireAuth | createSaleItemOrder |
| POST `/api/sale-item-purchase` | requireAuth | createSaleItemOrder |
| GET `/api/sale-item-history` | requireAuth | getSaleItemHistory |
| GET `/api/vendor-order-history` | requireAuth | getSaleItemHistoryForVendor |
| POST `/api/update-order-status/:orderId` | requireAuth | updateSaleItemOrderStatus |

### Chatbot (`/api/chatbot`)

| Method | Path | Auth |
|--------|------|------|
| POST | `/message` | **⚠ none** |
| POST | `/ticket` | **⚠ none** |
| GET | `/health` | — |

### Vendor dashboard routes (summary)

All under `/api/vendor/*` unless noted. Most listing/booking/tracking routes use `requireAuth`; several use `requireVendor`.

**⚠ Unauthenticated vendor booking payment routes:**
- `POST /api/vendor/bookings/create-payment-intent`
- `POST /api/vendor/bookings/on-payment-success`
- `GET /api/vendor/bookings/amount-to-pay/:id`

**⚠ Unauthenticated vendor profile admin routes:**
- `PUT /api/vendor/profile/admin/update/:id`
- `POST /api/vendor/profile/request-kvk-change`
- `GET /api/vendor/profile/get-main-category/:vendorId`

### Payments (`/api/payments`)

| Method | Path | Auth | Handler |
|--------|------|------|---------|
| POST | `/create-payment-intent` | **⚠ none** | paymentController.createPaymentIntent |
| GET | `/get-payment-intent/:internalId` | **⚠ none** | getPaymentIntentByInternalId |
| POST | `/create-subscription` | **⚠ none** | createSubscription |
| POST | `/webhook` | Stripe signature | stripeWebhookController.handleWebhook |

### Admin routes (summary)

| Area | Prefix | Auth pattern |
|------|--------|--------------|
| Dashboard | `/api/admin/dashboard/stats` | requireAdmin |
| Users | `/api/admin/users/clients|vendors/*` | requireAdmin only |
| Bookings | `/api/admin/bookings/*` | Mixed requireAdmin / requireActiveAdmin |
| Tracking | `/api/admin/tracking/*` | requireAdmin |
| Listing CMS | `/api/admin/listing/*` | **⚠ mostly none** |
| Plans | `/api/admin/plans/*` | **⚠ mostly none** |
| Payments | `/api/admin/payments/*` | **⚠ none** |
| FAQs | `/api/admin/faqs/*` | **⚠ none** |
| Support | `/api/admin/support/*` | **⚠ none** |
| Settings | `/api/admin/settings/*` | requireAdmin |
| Blogs | `/api/admin/blogs/*` | requireAdmin |
| QnA | `/api/admin/qna/*` | **⚠ none** |
| Chatbot tickets | `/api/chatbot-tickets/*`, `/api/admin/chatbot-tickets/*` | **⚠ none** |
| Report | `/api/admin/report/stats-card` | **⚠ none** |
| Admin employees | `/api/create-admin`, `/api/admin/fetch-employees`, etc. | **⚠ none** |

### Messaging

| Prefix | Auth | Notes |
|--------|------|-------|
| `/api/messages/:conversationId/:userId` | **⚠ none** | getMessages, softDelete |
| `/api/conversations/*` | **⚠ none** | create, list, block, report |
| `/api/chatrooms/*` | **⚠ none** | rooms |

---

## 6. Feature Breakdown — Every Feature in the System

Each feature: plain English description, flow, models, third parties, issues, diagram.

### 6.1 Vendor registration and onboarding

**What it does:** Vendors sign up with business/personal details, verify email via OTP, complete profile in `Vendor` collection.

**Flow:** `POST /api/auth/vendor/register` → `registerVendor2` → User + Vendor created → OTP email → optional admin notification.

**Models:** User, Vendor, OTP, Notification  
**Services:** Nodemailer  
**Issues:** Stripe Connect separate step; hardcoded onboarding return URLs to localhost in authController.

```
Register → OTP email → Verify → Login → Profile update → Stripe Connect (optional)
```

### 6.2 Vendor Stripe Connect and payouts

**What it does:** Creates Stripe Express account, returns onboarding link, tracks completion; admin later transfers funds.

**Flow:** `connectVendorStripe` → `stripe.accounts.create` → save `stripeAccountId` → `getStripeOnboardingLink` → `accountLinks.create` → webhook not handling `account.updated`.

**Models:** User (stripeAccountId, stripeOnboardingComplete)  
**Services:** Stripe Connect Express  
**Issues:** Onboarding URLs hardcoded; `account.updated` not handled.

### 6.3 Vendor profile management

**Routes:** `/api/vendor/profile/*`, `/api/settings/*`, client `/api/vendor/vendorprofile`  
**Models:** User, Vendor  
**Issues:** Admin update route unauthenticated; KVK change emails admin.

### 6.4 Vendor listings and items

**Listings:** CRUD `/api/vendor/listings/*` — Listing model, multilingual, pricing object, stock quantity.  
**Items:** CRUD `/api/vendor/items/*` — ServiceItem model for sale products.

### 6.5 Vendor bookings (accept, reject, track, complete)

**Accept/reject:** `bookingAnalytics.acceptBooking` / `rejectBooking` — updates status, emails client (`sendOrderStatusEmail`), Evenlyo Protect admin email, notifications.  
**Tracking:** `trackingController` — on_the_way, picked_up, completed, received_back.  
**Models:** BookingRequest, Notification, User, Vendor  
**Services:** Nodemailer, FCM

```
Client request → pending → Vendor accept/reject → Client pay → paid → on_the_way → completed
```

### 6.6 Vendor stock management

**Listing stock:** `/api/vendor/stock/*` — StockLog  
**Item stock:** `/api/vendor/itemstock/*` — ServiceItemStockLog  
**Booking integration:** `bookingRequest.js` decrements stock on booking creation.

### 6.7 Vendor earnings and analytics

**Routes:** `/api/vendor/earnings/analytics`, `/api/vendor/dashboard/analytics`  
**Models:** BookingRequest, saleorders, Billing

### 6.8 Vendor employees and role management

**Routes:** `/api/vendor/roles/*`  
**Models:** Employee, VendorDesignation  
**Issues:** `requireAuth` checks `emp.status` but Employee has `isActive` only.

### 6.9 Vendor billing and invoices

**Routes:** `/api/vendor/billing/invoices`, download PDF  
**Models:** Billing  
**Issues:** Download route defined after `module.exports` — dead code.

### 6.10 Vendor subscriptions and plans

**Flow:** `POST /api/payments/create-subscription` → Stripe customer + subscription on Plan.stripePriceId  
**Models:** Plan, Vendor (**stripeCustomerId not in schema — dropped in strict mode**)  
**Issues:** Subscription fields may not persist on Vendor document.

### 6.11 Client registration and login

Email OTP or Google Firebase token. Models: User, OTP.

### 6.12 Client booking flow

**Create:** `POST /api/booking/request` → `bookingRequest.js` or `bookingController.createBookingRequest` — pricing, fees from Settings, stock check, notifications.  
**Pay:** PaymentIntent via Stripe (multiple code paths).  
**Lifecycle:** mark-received, finished, cancel, claim, review.

**Models:** BookingRequest, Listing, Cart, PaymentIntent, Settings, StockLog

### 6.13 Client item purchases

**Routes:** `/api/sale-item-purchase`, `/api/client/purchases/place-order`  
**Models:** saleorders, ServiceItem, PaymentIntent

### 6.14 Client reviews and ratings

Embedded in Vendor.reviews via `POST /api/booking/:id/review`.

### 6.15 Client refunds and claims

**Claims:** `createClaim` on booking — claimDetails on BookingRequest  
**Admin refunds:** `/api/admin/payments/refund` — `stripe.refunds.create`

### 6.16 Admin vendor/client management

**Routes:** `/api/admin/users/*` — list, detail, activate/deactivate, password reset emails, bulk email.  
**Models:** User, Vendor, AdminEmployee

### 6.17 Admin booking oversight

`/api/admin/bookings/analytics`, `/api/admin/tracking/*`

### 6.18 Admin payment disbursement

`payoutVendorBookings` → `stripe.transfers.create` to vendor Connect account.  
`payVendorClaim`, `refundClient` for claims/refunds.

### 6.19 Admin analytics and reporting

Dashboard stats, report stats-card, booking analytics.

### 6.20 Notifications (in-app, push, email)

See [Section 10](#10-notifications-system).

### 6.21 Messaging and chat

REST: conversations, messages, chatrooms.  
Real-time: Socket.IO `chatSockets.js` — join room, send message, cart submit creates booking.

**Models:** Message, Conversation, ChatRoom  
**Services:** Socket.IO, FCM for offline push

### 6.22 Stripe payments

See [Section 7](#7-stripe-integration--full-detail).

### 6.23 Cloudinary file uploads

**Not implemented server-side.** URLs stored after client-side upload.

### 6.24 OTP verification

`otpUtils` + `OTP` model + `sendOTPEmail` / `sendForgotOTPADMIN`.

### 6.25 Google OAuth

`POST /api/auth/google` — Firebase `verifyIdToken`, creates/links User with provider google.

### 6.26 AI Chatbot

OpenAI chat completions with tools (listings, availability, booking status, knowledge base).  
Tickets escalated to `ChatbotTicket` + admin email reply.

### 6.27 Payment reminders (cron)

`corn/paymentReminder.js` — 3-day and 1-day reminders, auto-cancel unpaid bookings, vendor/admin cancellation emails, escrow release logic.

### 6.28 Evenlyo Protect

Flag on bookings triggers admin email (`sendEvenlyoProtectBookingEmail`) on create/accept/reject to AdminEmployees with notification settings.

### 6.29 Platform settings & app version

`GET /api/getSetings` — mobile version force-update flags.  
Admin: platform fees, VAT.

### 6.30 Blogs & FAQs & Knowledge base

Public read; admin CRUD. Blog comments trigger promotional email.

### 6.31 Activity logging

`activityLogger.js` — vendor actions to ActivityLog.

### 6.32 Language translation

`POST /api/vendor/language/translate` — OpenAI Dutch to English for vendor content entry.

---

## 7. Stripe Integration — Full Detail

### SDK entry

`config/stripe.js` → `require('stripe')(process.env.STRIPE_SECRET_KEY)`

### Every Stripe API method used

| API | Location | Purpose |
|-----|----------|---------|
| `paymentIntents.create` | paymentController, bookingController, bookingAnalytics, ItemController | Client payments |
| `customers.create` | paymentController | Vendor subscription customer |
| `paymentMethods.attach` | paymentController | Attach card |
| `customers.update` | paymentController | Default payment method |
| `subscriptions.create` | paymentController | Vendor plan subscription |
| `accounts.create` | authController | Connect Express account |
| `accountLinks.create` | authController | Onboarding URL |
| `accounts.retrieve` | authController | Check onboarding requirements |
| `transfers.create` | admin/PaymentController | Payout to vendor, claim payouts |
| `refunds.create` | admin/PaymentController | Client refunds, security deposit return |
| `webhooks.constructEvent` | stripeWebhookController | Verify webhook |

### Connect Express onboarding flow

```
Vendor (authenticated)
    │
    ▼
POST /api/auth/vendor/stripe/connect
    │── stripe.accounts.create({ type: 'express', country: 'NL', ... })
    │── User.stripeAccountId = acct_xxx
    ▼
GET /api/auth/vendor/stripe/onboarding-link
    │── stripe.accountLinks.create({ account, refresh_url, return_url, type: 'account_onboarding' })
    ▼
Vendor completes Stripe hosted onboarding
    ▼
GET /api/auth/vendor/stripe/onboarding-status
    │── stripe.accounts.retrieve → charges_enabled, details_submitted
    │── User.stripeOnboardingComplete = true
```

### Payment flow (client pays → platform holds → admin disburses)

```
Client creates booking (pending)
        │
        ▼
Vendor accepts
        │
        ▼
Client POST .../create-payment-intent OR /api/payments/create-payment-intent
        │── stripe.paymentIntents.create
        │── PaymentIntent doc + Booking.paymentIntentId
        ▼
Client pays on Stripe (frontend)
        │
        ▼
Webhook payment_intent.succeeded
        │── paymentController.updateStatus
        │── Booking paymentStatus / AmountPaid updated
        ▼
Event completes; vendorPaid = false
        │
        ▼
Admin POST /api/admin/payments/:vendorId/disburse-payments
        │── stripe.transfers.create({ destination: vendor.stripeAccountId })
        │── Booking.vendorPaid = true, stripeTransferId saved
```

### Money flow diagram

```
┌────────┐  PaymentIntent   ┌─────────────────┐  Transfer    ┌──────────────┐
│ Client │ ───────────────► │ Evenlyo Stripe  │ ───────────► │ Vendor       │
│        │   (card pay)     │ Platform Account│  (admin      │ Connect Acct │
└────────┘                  └────────┬────────┘   action)     └──────────────┘
                                     │
                                     │ Refund (admin)
                                     ▼
                              ┌──────────────┐
                              │ Client       │
                              │ (refund)     │
                              └──────────────┘
```

### Refund flow

Admin `refundClient` → `stripe.refunds.create` on payment intent → updates booking paymentStatus / securityRefundDetails.

### Subscription flow

Admin creates Plan with stripeProductId/stripePriceId → Vendor selects plan → `createSubscription` with paymentMethodId → Vendor document update attempted (schema gap).

### Webhook events

| Event | Handler |
|-------|---------|
| `payment_intent.succeeded` | updateStatus → succeeded |
| `payment_intent.payment_failed` | updateStatus → failed |
| `payment_intent.requires_action` | updateStatus → requires_action |
| All others | Logged unhandled |

**Not implemented:** `account.updated`, `customer.subscription.*`, `charge.refunded`, `transfer.*`

### Stripe-related DB fields

User: `stripeAccountId`, `stripeOnboardingComplete`  
Plan: `stripeProductId`, `stripePriceId`  
PaymentIntent: full mirror of Stripe PI  
BookingRequest: `paymentIntentId`, `payments[]`, `stripeTransferId`, `claimDetails.stripeTransferIdToUser`, `securityRefundDetails.stripeRefundId`  
saleorders: `paymentIntentId`

### Known gaps

- Multiple PaymentIntent creation paths without shared idempotency
- `paymentController` references `booking.pricing` but model uses `pricingBreakdown`
- Webhook secret optional → insecure fallback parsing
- Vendor subscription customer ID not in Vendor schema
- No Connect capability verification before transfer

---

## 8. Middleware Chain

### Global stack (every request)

```
Incoming Request
      │
      ▼
┌─────────────┐
│    CORS     │
└──────┬──────┘
       ▼
┌─────────────┐
│   Morgan    │ → Winston
└──────┬──────┘
       ▼
┌─────────────┐
│ logRequest  │
└──────┬──────┘
       ▼
┌─────────────┐
│ express.json│ (+ rawBody for /api/payments/webhook)
└──────┬──────┘
       ▼
┌─────────────┐
│cookieParser │
└──────┬──────┘
       ▼
┌─────────────┐
│   i18next   │
└──────┬──────┘
       ▼
┌─────────────┐
│ Route-level │ rateLimit, csrf, requireAuth, requireRole...
│ middleware  │
└──────┬──────┘
       ▼
┌─────────────┐
│ Controller  │
└──────┬──────┘
       ▼
┌─────────────┐
│ Global err  │ (500 JSON)
└─────────────┘
```

### Typical authenticated client booking request

```
POST /api/booking/request
  → cors
  → morgan / logRequest
  → express.json
  → i18next
  → requireAuth (JWT → User)
  → requireClient
  → createBookingRequest
```

---

## 9. Error Handling and Validation

### Global error handler

Located at end of `app.js`:

- Logs via `logger.logError`
- Returns `500` JSON with `error` message in development, generic `"Internal Server Error"` in production

**No** centralized 404 handler for unknown routes.

### Validation approach

| Layer | Usage |
|-------|--------|
| Mongoose schema | Field types, enums, required functions |
| Controller manual | if (!field) return 400 — predominant pattern |
| express-validator / joi | **Not used** |
| sanitize-html | Blog content only |

### Missing / incomplete validation (examples)

- Payment routes accept amounts without auth
- Admin payment disbursement without role check on route
- Chatbot message length / rate limit minimal
- Booking date validation inconsistent across paths
- `fetchBookingRequest` / `fetchBookingRequestByDate` public with no API key

### Unhandled error cases

- Stripe webhook errors return 500 but Stripe may retry indefinitely
- Socket booking errors may not rollback stock in all paths
- `markAllAsRead` affects all users' notifications

---

## 10. Notifications System

### In-app notifications

**Model:** Notification (bilingual title/message)  
**Create:** `notificationController.createNotification`  
**Read:** GET `/api/notifications/` (client), `/vendor-notifications`, `/admin-notifications`

### Push notifications (FCM)

1. Resolve vendor owner userId via `resolveVendorUserId`
2. Load `appFcm` / `webFcm` from User
3. `sendPushOnly` → Firebase `admin.messaging().send()`
4. Android channel: `evenlyo_general`

### Email

**Provider:** Nodemailer → Gmail SMTP (`EMAIL_*` env)  
**Templates:** `utils/mailer.js` (OTP, booking status, reminders, promotional, support, Evenlyo Protect)  
**Cron:** `corn/paymentReminder.js` inline Dutch templates

### Events that trigger notifications

| Event | Channels |
|-------|----------|
| New booking | In-app + push + email (Evenlyo Protect → admin email) |
| Booking accept/reject | Email + in-app |
| Booking status changes | In-app + push |
| Vendor registration | Admin notification |
| Support ticket created | Admin |
| Payment reminders | Email + optional in-app |
| Chat message (socket) | Push if recipient offline |
| Booking auto-cancel | Email vendor + admin |

### Events that should notify but may not

- Subscription payment failure (no webhook handler)
- Stripe Connect onboarding completed (no `account.updated` handler)
- Admin disbursement completed (no vendor email)
- Failed FCM token cleanup (commented out)
- Client password changed by admin (email only on admin reset, not self-service)

---

## 11. File Uploads

| Question | Answer |
|----------|--------|
| How uploaded? | **Client-side to Cloudinary**; backend stores URL strings only |
| Server upload? | Multer configured in `routes/settings.js` but **no active upload route** |
| Accepted types | `fileFilter` allows jpeg, jpg, png, gif, webp (unused) |
| Endpoints | **None** accept multipart file uploads |
| Size limits | Not enforced server-side |
| Chat attachments | URL/metadata stored on Message.attachment |

---

## 12. Known Issues and Technical Debt

### Security

1. Firebase service account JSON committed to repository
2. Many admin routes without authentication
3. `GET /api/notifications/admin-notifications` public
4. Chatbot endpoints public without strong rate limiting
5. JWT and tokens logged to console in authMiddleware
6. Stripe webhook accepts unsigned body if secret missing
7. JWT dev fallback secrets in jwtUtils
8. `.env` contains real credentials in workspace (rotate if exposed)

### Schema / data bugs

9. Booking.trackingId schema malformed (condition nested incorrectly)
10. Vendor index on nonexistent `approvalStatus`
11. Employee `isActive` vs middleware checking `status`
12. FAQ indexes on missing fields
13. Review model export named `Plan`
14. Notification `user` field set in code but not in schema
15. paymentController uses `booking.pricing` vs `pricingBreakdown`
16. Vendor subscription fields not in schema

### Routing bugs

17. Duplicate GET `/api/categories/:id`
18. Admin `GET /refund-cases` shadowed by `/:vendorId/payout-orders`
19. `GET /api/:id` in vendorDesignations conflicts with other `/api` routers
20. billing download route after module.exports
21. `PATCH /api/auth/fcm-token` handler signature incompatible with Express

### Dead code

22. Unmounted `routes/stock.js`, `routes/vendor/SaleItemPurchase.js`
23. Unused dependencies (redis, passport, swagger, session)
24. Missing `utils/seeder.js`, `locales/`, `index.js`
25. Unused `firebaseConfig.js`
26. Duplicate English `sendReminderEmail` in mailer.js (cron has active Dutch version)

### Operational

27. Hardcoded Stripe onboarding URLs to localhost
28. `API_BASE_URL` in .env unused; API has no `/v1` prefix
29. i18n configured but locale files missing
30. Multiple PaymentIntent creation paths
31. `markAllAsRead` global not per-user
32. app.js migration function could wipe FCM tokens if uncommented

---

## 13. Summary Diagram

```
                         EVENLYO PLATFORM (Backend)
================================================================================

  USERS                         FEATURE DOMAINS                    SERVICES
  -----                         ---------------                    --------

 ┌─────────┐                  ┌─────────────────┐
 │ Client  │─────────────────►│ Browse/Listings │──────► MongoDB
 └────┬────┘                  │ Cart & Booking  │
      │                        │ Pay & Track     │──────► Stripe (PI)
      │                        │ Reviews/Claims  │
      │                        └────────┬────────┘
      │                                 │
      │         ┌───────────────────────┼───────────────────────┐
      │         │                       │                       │
 ┌────▼────┐    │                ┌──────▼──────┐         ┌──────▼──────┐
 │ Vendor  │───►│                │  Messaging  │         │ Notifications│
 │ (+empl) │    │                │ Socket.IO   │         │ In-app + FCM │
 └────┬────┘    │                └─────────────┘         └──────┬──────┘
      │         │                                                │
      │         │         ┌─────────────────┐                      │
      │         └────────►│ Stripe Connect  │──────────────────────┤
      │                   │ Listings/Stock  │                      │
      │                   │ Subscriptions   │──────► Stripe        │
      │                   └─────────────────┘                      │
      │                                                            │
 ┌────▼────────┐          ┌─────────────────┐              ┌──────▼──────┐
 │Admin Employee│────────►│ Users/Payments │              │   Email     │
 └─────────────┘          │ Refunds/Payout │──────► Stripe │  (SMTP)     │
                          │ Content/CMS    │              └─────────────┘
                          │ Support/QnA    │
                          └────────┬────────┘
                                   │
                          ┌────────▼────────┐
                          │ OpenAI Chatbot  │
                          │ + Cron Reminders│
                          └─────────────────┘

 EXTERNAL: Firebase (Google login + Push) | Cloudinary (client URLs only) | Heroku
================================================================================
```

---

## Appendix A — Email system (current language)

All user-facing email templates have been translated to **Dutch** in:

- `utils/mailer.js` (OTP, promotional, contact, reports, KVK, booking status, completion, reminders, chatbot replies, Evenlyo Protect)
- `controllers/admin/userManagement.js` (password reset, bulk emails)
- `controllers/admin/supportController.js` (default ticket subject)
- `corn/paymentReminder.js` (reminders, cancellations)

Prior audits: `STRIPE_REGISTRATION_AUDIT.md`, `VENDOR_FLOW_AUDIT.md`.

---

## Appendix B — Socket.IO events (chatSockets.js)

Real-time layer parallel to REST messaging:

- Connection with CORS allowlist (mirrors server.js origins)
- Join conversation/room
- Send/receive messages
- Cart submit may create booking from socket payload
- Push notification on new message when recipient offline

(Inspect `sockets/chatSockets.js` for exact event names when extending.)

---

*End of FULL_SYSTEM_AUDIT.md*
