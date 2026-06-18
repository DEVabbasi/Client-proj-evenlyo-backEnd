# 00 — Overview

## What this is

Evenlyo is an **event-services marketplace** backend: clients book vendors (decorations, catering, etc.), pay through Stripe (often partial upfront), and track fulfillment. Vendors manage listings, bookings, stock, and earnings. Admins operate a separate panel for users, payouts, tracking overrides, and CMS content.

This repo is **API-only** — three frontends (client, vendor, admin) consume `/api/*` over HTTPS and Socket.IO.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js (no `engines` pin in `package.json`) |
| Framework | Express **5.1** |
| Database | MongoDB via Mongoose **8** |
| Auth | JWT (`jsonwebtoken`) — sessions removed |
| Real-time | Socket.IO **4** (`sockets/chatSockets.js`) |
| Payments | Stripe **18** (PaymentIntents, Connect Express, subscriptions) |
| Push | Firebase Admin SDK (FCM) |
| Email | Nodemailer → SMTP (`EMAIL_*` env vars) |
| AI | OpenAI (chatbot function calling + translation) |
| Scheduling | `node-cron` in `corn/paymentReminder.js` |
| Logging | Winston + Morgan |
| i18n | i18next configured but **barely used** — content is mostly inline `{ en, nl }` objects |
| Deploy | Heroku (`Procfile`: `web: node server.js`) |

**Installed but largely unused:** `redis`, `passport`, `swagger-jsdoc`, `express-session`, `connect-mongo`.

---

## Architecture pattern

**Express MVC without a service layer.**

```
HTTP request
  → app.js (CORS, JSON, i18n, logging)
  → route file (method + path + middleware)
  → controller (business logic)
  → model / utils (DB, Stripe, mail, FCM)
  → JSON response
```

There is no `services/` folder. Controllers call Mongoose models and `utils/*` directly. Some logic also lives **inside route files** (notably `routes/notifications.js`).

Socket.IO runs alongside Express in `server.js`; `app.set('socketio', io)` exposes the instance to controllers.

---

## Entry points

### `server.js`

1. Loads `app.js`
2. Creates HTTP server + Socket.IO with CORS allowlist
3. Attaches `chatSocket(io)`
4. **`require('./corn/paymentReminder')`** — cron starts on boot (not HTTP)
5. Listens on `PORT` (default **5000**)

### `app.js`

1. `connectDB()` → MongoDB Atlas
2. Middleware: CORS, Morgan → Winston, `express.json` (with `rawBody` capture for Stripe webhook), cookies, i18next
3. Mounts ~50 route modules under `/api/*`
4. `GET /` — health-ish i18n string
5. Global error handler → 500 JSON (message exposed only in `development`)

**No API versioning** — all routes are `/api/...`, not `/api/v1/...`.

---

## Folder structure

| Folder | Responsibility |
|--------|----------------|
| `routes/` | HTTP routing — `client/`, `vendor/`, `admin/`, plus shared (`auth.js`, `payments.js`, chat) |
| `controllers/` | Request handlers — same role split |
| `models/` | 34 Mongoose schemas |
| `middleware/` | `authMiddleware.js` — almost all auth/role logic |
| `utils/` | Mailer, notifications, JWT, OTP, booking math, logging |
| `config/` | `db.js`, `stripe.js`, `firebase.js` |
| `corn/` | Cron jobs (typo: not `cron/`) |
| `chatbot/` | OpenAI tool definitions + DB tool implementations |
| `sockets/` | Socket.IO handlers |
| `logs/` | Winston rotated log files |

---

## Request lifecycle (example)

`POST /api/booking/request` (client creates booking):

1. **CORS** — origin must be in allowlist or localhost/devtunnels/vercel
2. **`express.json`** — parses body
3. **`logger.logRequest`** — logs on response finish
4. **Route** — `routes/client/bookings.js` → `requireAuth`, `requireClient`
5. **`requireAuth`** — Bearer JWT → `User.findById` (or Employee/AdminEmployee fallback)
6. **`requireClient`** — `req.user.userType === 'client'`
7. **`createBookingRequest`** — validate dates, pricing, stock; write `BookingRequest`; notify vendor
8. **Response** — `{ success, message: {en,nl}, data: { bookingRequest, paymentPolicy } }`

---

## Environment variables

No `.env.example` in repo. Names inferred from code:

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | MongoDB connection string |
| `PORT` | HTTP port (default 5000) |
| `NODE_ENV` | `development` / `production` |
| `JWT_SECRET` | Access token signing |
| `JWT_PASSWORD_RESET_SECRET` | Password-reset token (10m) |
| `STRIPE_SECRET_KEY` | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS` | Primary SMTP (active path) |
| `CONTACT_EMAIL` | Contact form recipient |
| `FRONTEND_URL`, `STAGING_CLIENT_URL`, `LIVE_CLIENT_URL` | Links in emails |
| `OPENAI_API_KEY` | Chatbot + translation |
| `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL` | Firebase Admin (or `serviceAccountKey.json`) |
| `LOG_LEVEL` | Winston level |

**Dead path:** `SMTP_*` vars used only in an unused helper inside `utils/mailer.js`.

---

## How to run locally

```bash
cd Evenlyo-BACKEND
npm install
# Create .env with MONGODB_URI, JWT_SECRET, EMAIL_*, STRIPE_*, FIREBASE_* or serviceAccountKey.json
npm run dev    # nodemon server.js
# or
npm start      # node server.js
```

Default: `http://localhost:5000`. Cron runs automatically in dev — be careful with shared DBs.

`npm run seed` points to **missing** `utils/seeder.js`.

---

## Third-party integrations

| Service | Integration point | Notes |
|---------|-------------------|-------|
| MongoDB Atlas | `config/db.js` | `ensureAppSettings()` seeds Settings singleton on connect |
| Stripe | `config/stripe.js`, payment/booking controllers | 3 parallel payment paths — see [payments-and-stripe flow](./03-flows/payments-and-stripe.md) |
| Firebase | `config/firebase.js` | Google token verify + FCM push |
| SMTP | `utils/mailer.js`, `corn/paymentReminder.js` | Cron duplicates email logic locally |
| OpenAI | `controllers/client/chatbotController.js` | Function calling with DB tools |
| Cloudinary | URL storage only | No server upload SDK |
| Socket.IO | `server.js`, `sockets/chatSockets.js` | Chat + cart booking events |

---

## Existing root audit docs (reference only)

| File | Note |
|------|------|
| `FULL_SYSTEM_AUDIT.md` | Broad system notes — verify against code |
| `PARTIAL_PAYMENT_FLOW_AUDIT.md` | Payment/cron detail — cron schedule confirmed as `0 */5 * * *` in code |
| `VENDOR_FLOW_AUDIT.md` | Vendor flows |
| `STRIPE_REGISTRATION_AUDIT.md` | Stripe Connect |

Discrepancies between those docs and current code are logged in [05-audit-findings.md](./05-audit-findings.md).

---

## Related docs

- [01-roles-and-permissions.md](./01-roles-and-permissions.md)
- [02-data-models.md](./02-data-models.md)
- [05-audit-findings.md](./05-audit-findings.md)
