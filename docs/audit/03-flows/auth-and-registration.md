# Flow: Auth and Registration

How users get into the system — clients, vendors, and admin employees use **different login paths**.

---

## Client registration (OTP)

**Trigger:** User submits signup form on client app.

### Step 1 — Optional duplicate check

`POST /api/auth/check-registered`  
Middleware: `rateLimit`, `csrfProtection`

Looks up `User` by email/phone. Returns whether account exists and provider type. No side effects.

### Step 2 — Send OTP

`POST /api/auth/send-otp`  
Middleware: `rateLimit`

`authController.sendOtpForRegister`:
1. Lowercases email
2. If `User` exists → `409`
3. `generateAndSendOTPonRegister` (`utils/otpUtils.js`) — 6-digit code, **5 min** TTL, stored in `OTP` collection
4. Email via `sendOTPEmail`

### Step 3 — Register

`POST /api/auth/client/register` (or `POST /api/auth/verify-register-otp`)  
Middleware: `rateLimit`, `csrfProtection`

`verifyOtpAndRegister` with `userType: "client"`:
1. Validates `firstName`, `lastName`, `email`, `contactNumber`, `address`, `password`, `confirmPassword`, `otp`
2. `verifyOTP` — marks OTP used
3. `bcrypt.hash(password, 10)`
4. Creates `User` with `userType: "client"`, `isActive: true`
5. Notifies first active `AdminEmployee` (role `Admin`) if `notificationSettings.push.newRegistration`
6. Returns `201` — **no JWT**; user must log in separately

**Models written:** `User`, `OTP` (verified flag), optionally `Notification`

---

## Client login

`POST /api/auth/client/login`  
Middleware: `rateLimit`, `csrfProtection`

1. Find `User` where `email`, `isActive: true`, `userType: "client"`
2. **Google branch:** if `provider === "google"`, skip password; save FCM tokens
3. **Email branch:** `bcrypt.compare`; block if account is Google-only
4. Issue `signToken({ id: user._id, name: user.name })` — **no expiry, no userType in token**
5. Response: `{ token, user: { id, firstName, lastName, email, profileImage, userType: "client" } }`

---

## Google auth (client only)

`POST /api/auth/google`  
Middleware: `rateLimit`

Two paths:

**App (`type === "App"`):** Trusts client-sent `userData` — **no Firebase verification**.

> **Audit — Critical:** Account spoofing risk. [05-audit-findings.md](../05-audit-findings.md#C-002)

**Web (default):** Verifies `idToken` via Firebase Admin `auth.verifyIdToken`.

Both paths find/create `User` with `userType: "client"`, `provider: "google"`, issue `signAccessToken` (30-day expiry, includes `userType`).

---

## Vendor registration

`POST /api/auth/vendor/register` → `registerVendor2`  
Middleware: `rateLimit`, `csrfProtection`

**Prerequisite:** OTP sent to registration email via same `send-otp` endpoint.

1. Validates `accountType` (`personal` | `business`), password match
2. **`requiredPersonal` / `requiredBusiness` arrays are defined but never checked** — incomplete data can slip through

> **Audit — High:** [05-audit-findings.md](../05-audit-findings.md#H-002)

3. `verifyOTP(registrationEmail, otp)`
4. Creates `User` (`userType: "vendor"`) + `Vendor` profile (`isApproved: false`)
5. `tagline`/`description` passed to `User.create` but **not in User schema** — silently dropped
6. Admin push notification (same pattern as client)
7. `201` — no JWT, no Stripe setup

Legacy `registerVendor` exists in controller but is **not mounted**.

---

## Vendor login

`POST /api/auth/vendor/login` — **no rateLimit, no csrf**

1. Try `User` with `userType: "vendor"`
2. Else `Employee.findOne({ email }).populate("vendor")` — sub-user login
3. **Master password bypass:** hardcoded `"sinan123"` skips bcrypt

> **Audit — Critical:** [05-audit-findings.md](../05-audit-findings.md#C-001)

4. Employee token `id` = **vendor owner's User `_id`** — full owner API access
5. Response `userType`: `"Employee"` or `"vendor"` (Google branch returns `"customer"` typo)

Designation `pages` returned for employees but **not enforced** on subsequent requests.

---

## Admin login (working path)

**Do not use** `POST /api/auth/admin/login` — `performLogin` never sends a response (broken).

**Use instead:**
- `POST /api/login-admin`
- `POST /api/admin/login-employee`

Both call `loginEmployee` in `adminEmployeeController.js`:
1. `AdminEmployee.findOne({ email })`
2. `bcrypt.compare`; reject if `status === "inactive"`
3. Load `AdminDesignation.permissions` → `pages` for Employees
4. `signToken({ id, name })` — no expiry
5. Updates `lastLogin`

Admin routes protected by `requireAdmin` (looks up `AdminEmployee` by token `id`).

---

## Password reset

| Step | Endpoint |
|------|----------|
| Send OTP | `POST /api/auth/send-forgot-otp` |
| Verify OTP | `POST /api/auth/verify-forgot-otp` → returns `resetToken` |
| Reset | `POST /api/auth/reset-password` |

Uses `JWT_PASSWORD_RESET_SECRET`, 10-minute reset tokens.

Vendor employee reset: `POST /api/auth/vendor/reset-password-for-employee` — **unauthenticated**.

> **Audit — High:** [05-audit-findings.md](../05-audit-findings.md#H-003)

---

## Session maintenance

| Endpoint | Middleware | Purpose |
|----------|------------|---------|
| `GET /api/auth/me` | `requireAuth` | Current user profile |
| `POST /api/auth/logout` | `requireAuth` | Stateless — client drops token |
| `PATCH /api/auth/fcm-token` | `requireAuth` | Update push tokens — **handler signature broken** |

> **Audit — Medium:** [05-audit-findings.md](../05-audit-findings.md#M-004)

---

## JWT reference (`utils/jwtUtils.js`)

| Function | Expiry | Payload |
|----------|--------|---------|
| `signToken` | None | `{ id, name }` |
| `signAccessToken` | 30d | `{ id, email, userType, firstName, lastName }` |
| `signPasswordResetToken` | 10m | `{ email }` |

All use `JWT_SECRET` (with insecure dev fallback if unset).

---

## Related

- [vendor-onboarding.md](./vendor-onboarding.md) — post-registration Stripe + profile
- [01-roles-and-permissions.md](../01-roles-and-permissions.md)
- [public-and-auth-api.md](../04-api-reference/public-and-auth-api.md)
