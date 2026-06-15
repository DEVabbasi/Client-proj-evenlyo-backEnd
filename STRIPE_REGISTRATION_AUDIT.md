   # Stripe Registration & Connect Technical Audit

   **Project:** Evenlyo-BACKEND  
   **Audit date:** 2026-06-14  
   **Scope:** Backend codebase only (no frontend repository present in this workspace)  
   **Method:** Static code analysis — read-only; no code changes were made.

   ---

   ## Executive Summary

   Evenlyo uses **Stripe Connect Express** accounts for vendors, combined with **Stripe PaymentIntents** (client-secret / Elements-style flow) on the **platform account**. Customer payments are collected by the platform; vendor earnings are paid out later via **`stripe.transfers.create`** to the vendor’s connected account (separate charges and transfers).

   Vendor registration (`POST /api/auth/vendor/register`) creates **User** and **Vendor** records only. **No Stripe API calls occur during registration.** Stripe integration happens in a **separate post-login flow**: connect account → onboarding link → hosted Stripe onboarding UI → manual status poll.

   Registration collects substantial business/personal profile data, but **almost none of it is sent to Stripe**. Only the vendor’s **email** is passed when creating the Express account. The hosted onboarding step therefore remains mandatory for identity, tax, bank, and compliance fields.

   ---

   ## 1. Stripe Onboarding / Connect Overview

   ### Integration type

   | Capability | Used? | Notes |
   |---|---|---|
   | **Stripe Connect** | Yes | Express connected accounts for vendors |
   | **Standard Connect** | No | Not found |
   | **Custom Connect** | No | Not found |
   | **PaymentIntents** | Yes | Primary client payment mechanism |
   | **Stripe Elements / client secret** | Implied | Endpoints return `client_secret`; no Checkout Session usage found |
   | **Stripe Checkout** | No | Not found |
   | **Subscriptions (Billing)** | Partial | `createSubscription` exists; Vendor schema lacks `stripeCustomerId` / `subscription` fields |
   | **Transfers** | Yes | Admin-initiated payouts to connected accounts |
   | **Refunds** | Yes | Admin refunds against platform PaymentIntents |

   **Connect account type for vendors:** **Express** (`type: "express"`).

   **Connect charge model:** **Separate charges and transfers** — PaymentIntents are created on the platform with no `transfer_data`, `on_behalf_of`, or `application_fee_amount`. Vendor funds are moved via `stripe.transfers.create` after booking completion / escrow rules.

   **Requested capabilities at account creation:** Only `transfers` (not `card_payments`), which matches the separate-charges-and-transfers model.

   ### References to `account_links`, onboarding, and `stripe.accounts.create`

   #### `stripe.accounts.create`

   | File | Line(s) | Context |
   |---|---|---|
   | `controllers/authController.js` | 2113–2119 | `connectVendorStripe` — creates Express account |

   #### `stripe.accountLinks.create` (Stripe SDK name for Account Links API)

   | File | Line(s) | Context |
   |---|---|---|
   | `controllers/authController.js` | 2150–2155 | `getStripeOnboardingLink` — creates onboarding URL |

   #### `stripe.accounts.retrieve`

   | File | Line(s) | Context |
   |---|---|---|
   | `controllers/authController.js` | 2174–2176 | `checkStripeOnboardingStatus` — reads account state from Stripe |

   #### Onboarding-related routes and handlers

   | File | Line(s) | Context |
   |---|---|---|
   | `routes/auth.js` | 128–130 | Routes for connect, onboarding-link, onboarding-status |
   | `controllers/authController.js` | 2139–2263 | `getStripeOnboardingLink`, `checkStripeOnboardingStatus` |
   | `controllers/authController.js` | 2154 | `type: "account_onboarding"` |
   | `controllers/authController.js` | 2185 | Sets `vendor.stripeOnboardingComplete` |
   | `controllers/authController.js` | 2193–2196 | User-facing onboarding incomplete messages |
   | `models/User.js` | 132–135 | `stripeOnboardingComplete` field |
   | `controllers/admin/PaymentController.js` | 23, 171–172, 212, 375, 415–420, 626–631 | Admin payout gating on onboarding status |
   | `controllers/vendor/profileController.js` | 62 | Returns `stripeOnboardingComplete` in business profile |

   #### String `account_links`

   **Not found** as a literal identifier. The codebase uses the Node SDK method `stripe.accountLinks.create`.

   #### Legacy / unused registration handler

   | File | Line(s) | Notes |
   |---|---|---|
   | `controllers/authController.js` | 1440–1611 | `registerVendor` (v1) — **not mounted** in `routes/auth.js`; active handler is `registerVendor2` |

   ---

   ## 2. Vendor Registration Flow

   ### End-to-end flow (backend API trace)

   > **Frontend:** Not found in this repository. Flow below is inferred from API routes and controllers only.

   ```
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │ 1. OTP (pre-registration)                                                   │
   │    POST /api/auth/send-otp                                                  │
   │    → sendOtpForRegister (authController)                                      │
   └─────────────────────────────────────────────────────────────────────────────┘
                                       ↓
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │ 2. Vendor registration (public)                                             │
   │    POST /api/auth/vendor/register                                             │
   │    → registerVendor2 (authController.js:1916–2090)                            │
   │    → User.create(...) + Vendor.create(...)                                    │
   │    → Admin notification                                                       │
   │    → NO Stripe calls                                                          │
   └─────────────────────────────────────────────────────────────────────────────┘
                                       ↓
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │ 3. Vendor login (public)                                                    │
   │    POST /api/auth/vendor/login                                                │
   │    → JWT/session for authenticated vendor routes                              │
   └─────────────────────────────────────────────────────────────────────────────┘
                                       ↓
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │ 4. Create Stripe Connect account (authenticated, separate step)             │
   │    POST /api/auth/vendor/stripe/connect                                       │
   │    → connectVendorStripe (authController.js:2092–2137)                      │
   │    → stripe.accounts.create({ type: "express", email, capabilities })       │
   │    → Saves stripeAccountId on User                                            │
   └─────────────────────────────────────────────────────────────────────────────┘
                                       ↓
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │ 5. Get hosted onboarding URL (authenticated)                                │
   │    GET /api/auth/vendor/stripe/onboarding-link                                │
   │    → getStripeOnboardingLink (authController.js:2139–2168)                    │
   │    → stripe.accountLinks.create(...)                                          │
   │    → Returns { url } for redirect to Stripe hosted UI                         │
   └─────────────────────────────────────────────────────────────────────────────┘
                                       ↓
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │ 6. Vendor completes Stripe hosted onboarding (external — Stripe UI)         │
   └─────────────────────────────────────────────────────────────────────────────┘
                                       ↓
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │ 7. Poll onboarding status (authenticated)                                   │
   │    GET /api/auth/vendor/stripe/onboarding-status                              │
   │    → checkStripeOnboardingStatus (authController.js:2170–2263)              │
   │    → stripe.accounts.retrieve(...)                                          │
   │    → Updates User.stripeOnboardingComplete                                    │
   └─────────────────────────────────────────────────────────────────────────────┘
                                       ↓
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │ 8. Admin vendor payouts (requires onboarding complete)                      │
   │    POST /api/admin/payments/:vendorId/disburse-payments                       │
   │    → stripe.transfers.create({ destination: vendor.stripeAccountId })       │
   └─────────────────────────────────────────────────────────────────────────────┘
   ```

   **Database models touched at registration:** `User` (collection: users), `Vendor` (collection: `vendorDetails`).

   **Stripe account creation / linking location:** `controllers/authController.js` → `connectVendorStripe` → `stripe.accounts.create` at line **2113**. Account ID stored on **`User.stripeAccountId`**, not on `Vendor`.

   ### Fields collected at registration

   Source: `registerVendor2` request body destructuring and `User.create` / `Vendor.create` (authController.js:1919–2047), plus Mongoose schemas (`models/User.js`, `models/Vendor.js`).

   #### Common (all vendor account types)

   | Field (request body) | Stored on | DB field(s) |
   |---|---|---|
   | `accountType` | User, Vendor | `accountType` |
   | `password` | User | `password` (hashed) |
   | `confirmPassword` | — | Validated only |
   | `otp` | — | Verified only |
   | `contactNumber` | User | `contactNumber` |
   | `mainCategories` | Vendor | `mainCategories` |
   | `subCategories` | Vendor | `subCategories` |
   | `tagline` | User*, Vendor | `tagline` (multilingual) |
   | `description` | User*, Vendor | `description` (multilingual) |
   | `postalCode` | User | `postalCode` |
   | `city` | User | `city` |

   \*Note: `registerVendor2` passes `tagline` and `description` to `User.create`, but **`User` schema has no `tagline` or `description` fields** — Mongoose strict mode will drop these unless schema is extended elsewhere.

   #### Personal account (`accountType === "personal"`)

   | Field | Stored on | DB field(s) |
   |---|---|---|
   | `email` | User | `email` (registration email) |
   | `firstName` | User | `firstName` |
   | `lastName` | User | `lastName` |
   | `fullAddress` | User | `address` |
   | `passportDetails` | User | `passportDetails` |
   | — | Vendor | `businessName` = ``${firstName} ${lastName}`` |
   | — | Vendor | `businessEmail` = registration email |
   | — | Vendor | `businessPhone` = `contactNumber` |
   | — | Vendor | `businessLocation` = `fullAddress` |

   #### Business account (`accountType === "business"`)

   | Field | Stored on | DB field(s) |
   |---|---|---|
   | `businessEmail` | User | `email` |
   | `businessName` | User, Vendor | User `firstName` = businessName; Vendor `businessName` |
   | `businessNumber` | Vendor | `businessPhone` |
   | `businessWebsite` | Vendor | `businessWebsite` |
   | `businessDescription` | Vendor | `businessDescription` |
   | `businessLogo` | Vendor | `businessLogo` |
   | `businessImage` | Vendor | `businessImage` |
   | `whyChooseUs` | Vendor | `whyChooseUs` |
   | `teamType` | Vendor | `teamType` |
   | `teamSize` | Vendor | `teamSize` |
   | `kvkNumber` | User, Vendor | `kvkNumber` |
   | `fullAddress` | User, Vendor | User `address`; Vendor `businessLocation` |

   #### Auto-set at registration

   | Field | Value |
   |---|---|
   | `userType` | `"vendor"` |
   | `isActive` | `true` |
   | `isApproved` (Vendor) | `false` |

   #### Validation gaps (audit finding)

   `registerVendor2` defines `requiredPersonal` and `requiredBusiness` arrays (lines 1962–1979) but **never validates them**. Unlike legacy `registerVendor` (lines 1492–1523), many “required” fields are not enforced server-side in the active handler.

   ### Fields sent to Stripe during or after registration

   #### During registration (`registerVendor2`)

   **None.** No Stripe SDK usage in registration.

   #### At Connect account creation (`POST /api/auth/vendor/stripe/connect`)

   | Stripe parameter | Value source |
   |---|---|
   | `type` | `"express"` (hardcoded) |
   | `email` | `req.user.email` (from JWT auth context) |
   | `capabilities.transfers.requested` | `true` |

   **Not sent:** name, phone, address, DOB, business type, KVK, passport, bank details, MCC, business URL, etc.

   #### At Account Link creation (`GET /api/auth/vendor/stripe/onboarding-link`)

   | Stripe parameter | Value |
   |---|---|
   | `account` | `vendor.stripeAccountId` |
   | `type` | `"account_onboarding"` |
   | `return_url` | `https://leverancier.evenlyo.nl/leverancier/succes` |
   | `refresh_url` | `https://leverancier.evenlyo.nl/leverancier/profielbeheer/succes` |

   **No prefill / `collection_options` / account update before link creation.**

   #### At onboarding status check

   Read-only: `stripe.accounts.retrieve(stripeAccountId)`.

   #### Subscription flow (separate from Connect onboarding)

   `POST /api/payments/create-subscription` may call:

   - `stripe.customers.create({ email: vendor.businessEmail, name: vendor.businessName, metadata })`
   - `stripe.paymentMethods.attach`, `stripe.customers.update`
   - `stripe.subscriptions.create({ items: [{ price: plan.stripePriceId }] })`

   This uses the **`Vendor`** model and is unrelated to Connect Express onboarding. **`Vendor` schema does not define `stripeCustomerId` or `subscription`**, so persistence of subscription data may fail under Mongoose strict mode.

   ---

   ## 3. The Onboarding Link / Account Link

   ### Where `stripe.accountLinks.create` is called

   **Single location:** `controllers/authController.js`, function `getStripeOnboardingLink`, lines **2150–2155**.

   ```javascript
   const accountLink = await stripe.accountLinks.create({
   account: vendor.stripeAccountId,
   refresh_url: "https://leverancier.evenlyo.nl/leverancier/profielbeheer/succes",
   return_url: "https://leverancier.evenlyo.nl/leverancier/succes",
   type: "account_onboarding",
   });
   ```

   ### Fields pre-filled or passed

   Only the **connected account ID** and **redirect URLs** are passed. No account holder data, business profile, or `collection_options` are supplied.

   The Express account itself was created with **email only** (see Section 2). Stripe may pre-fill the email in hosted onboarding from the account record.

   ### Fields Stripe still asks the user to fill manually

   Because the app does not call `stripe.accounts.update` (or equivalent) before generating the link, **all standard Express onboarding requirements not already on the Stripe account object must be collected in Stripe’s hosted UI**, including but not limited to:

   - Business type (individual vs company)
   - Legal name / representative name
   - Date of birth (individuals)
   - Home or business address (structured: line1, city, postal code, country)
   - Phone number
   - Tax / identity information (e.g. BSN for NL individuals, KVK-related company details where applicable)
   - Bank account (IBAN) for payouts
   - Business profile details (MCC, product description, support phone, URL) if required by Stripe for the account country
   - Terms of service acceptance (handled in hosted flow for Express)
   - Identity document verification when triggered by Stripe

   **Nothing from registration** (KVK, passport, address, phone, business name, etc.) is programmatically mapped into the Stripe Account before onboarding.

   ### Account link type

   **`account_onboarding`** only.

   **`account_update`:** Not found anywhere in the codebase.

   ### Return and refresh URLs

   | Parameter | URL |
   |---|---|
   | `return_url` | `https://leverancier.evenlyo.nl/leverancier/succes` |
   | `refresh_url` | `https://leverancier.evenlyo.nl/leverancier/profielbeheer/succes` |

   Both are **hardcoded production URLs** (not environment-driven).

   ---

   ## 4. Fields Gap Analysis

   Cross-reference of **Stripe Connect Express onboarding requirements** (typical NL/EU marketplace seller) vs **what Evenlyo collects at registration**.

   ### Collected at registration AND usable for Stripe (but currently NOT sent to Stripe)

   | Registration field | Stripe mapping (if implemented) | Currently sent? |
   |---|---|---|
   | `email` / `businessEmail` | Account `email` | Yes (at account create only) |
   | `firstName`, `lastName` | `individual.first_name`, `individual.last_name` | No |
   | `businessName` | `company.name` or `business_profile.name` | No |
   | `contactNumber` / `businessNumber` | `individual.phone` / `company.phone` | No |
   | `fullAddress`, `postalCode`, `city` | `individual.address` / `company.address` | No |
   | `kvkNumber` | `company.tax_id` (NL KVK — verify Stripe format rules) | No |
   | `passportDetails` | Identity document number (Custom/verified flows); not a direct Express field | No |
   | `businessWebsite` | `business_profile.url` | No |
   | `businessDescription` / `description` | `business_profile.product_description` | No |
   | `accountType` | `business_type`: `individual` vs `company` | No |

   ### Collected at registration but NOT Stripe onboarding fields

   These are marketplace profile fields, not Stripe KYC/payout fields:

   - `mainCategories`, `subCategories`
   - `businessLogo`, `businessImage`, `whyChooseUs`
   - `teamType`, `teamSize`, `tagline`
   - `password`, `otp`

   ### Required by Stripe for full onboarding but NOT collected at registration

   | Stripe requirement | Collected at registration? |
   |---|---|
   | Date of birth | **No** |
   | Structured address (country, line1, postal_code) | Partially (`fullAddress` free text; **no country field**) |
   | Bank account / IBAN (`external_account`) | **No** |
   | SSN / national ID (BSN NL) for individuals | **No** (passport string exists but is not DOB/BSN and not sent to Stripe) |
   | Merchant category code (MCC) | **No** |
   | Terms of service acceptance (date + IP) | **No** (expected in hosted flow or API `tos_acceptance`) |
   | Identity document upload | **No** |
   | Representative / owners (company accounts) | **No** |
   | Phone in E.164 format | Partially (`contactNumber` free-form) |

   ### Summary gap table

   | Category | Status |
   |---|---|
   | Identity (name, DOB, ID) | Mostly missing or not mapped |
   | Address | Partial free-text only; no country |
   | Tax / KVK | KVK collected for business; never sent to Stripe |
   | Bank / payout method | Not collected |
   | Business profile (MCC, URL, description) | Partially collected; never sent to Stripe |
   | TOS acceptance | Not collected in app |

   ---

   ## 5. Webhook Handling

   ### Webhook endpoint

   | Route | Handler |
   |---|---|
   | `POST /api/payments/webhook` | `controllers/stripeWebhookController.js` → `handleWebhook` |

   **Middleware:** `app.js` lines 116–126 preserve `req.rawBody` for signature verification on the webhook path.

   ### Handled events

   | Event type | Handler behavior |
   |---|---|
   | `payment_intent.succeeded` | Calls `paymentController.updateStatus` with status, payment method, amount; may update linked `Booking` payment fields |
   | `payment_intent.payment_failed` | Updates PaymentIntent status to `failed` |
   | `payment_intent.requires_action` | Updates PaymentIntent status to `requires_action` |
   | **All other events** | Logged as unhandled (`default` branch) |

   ### Events NOT handled (relevant to Connect onboarding)

   | Event | Status |
   |---|---|
   | `account.updated` | **Not handled** |
   | `capability.updated` | **Not handled** |
   | `account.application.authorized` | **Not handled** |
   | `account.application.deauthorized` | **Not handled** |
   | `transfer.created` / `transfer.failed` | **Not handled** |
   | `charge.refunded` | **Not handled** (refunds initiated via API in admin controller) |

   ### Is `account.updated` used to track onboarding completion?

   **No.** Onboarding completion is tracked only when the vendor (or frontend) calls:

   `GET /api/auth/vendor/stripe/onboarding-status`

   That endpoint retrieves the account from Stripe and sets `User.stripeOnboardingComplete` locally.

   ### Logic checking `charges_enabled`, `payouts_enabled`, `details_submitted`

   **Yes** — in `checkStripeOnboardingStatus` (`authController.js:2180–2254`):

   ```javascript
   const onboarded =
   account.details_submitted &&
   account.charges_enabled &&
   account.payouts_enabled;
   ```

   These flags are also returned in the API response under `accountDetails`.

   **Admin payout guards** (`PaymentController.js`):

   - Lines 415–422: blocks payout if missing `stripeAccountId` or `!stripeOnboardingComplete`
   - Lines 626–634: same for vendor claim transfers

   **Webhook does not** update these flags.

   ---

   ## 6. Payment Flow

   ### How payments are routed to vendors

   **Model: Separate charges and transfers (platform-first).**

   1. Client pays via **PaymentIntent on the platform Stripe account** (no connected account on the charge).
   2. Funds sit on the platform balance.
   3. Admin triggers **`stripe.transfers.create`** to `destination: vendor.stripeAccountId` when escrow/rules allow.

   **Not used:**

   - Direct charges on connected accounts
   - Destination charges (`transfer_data.destination`)
   - `on_behalf_of`
   - `application_fee_amount` on PaymentIntents

   ### Where `stripe.paymentIntents.create` is called

   | File | Function / context | Connect routing |
   |---|---|---|
   | `controllers/paymentController.js` | `createPaymentIntent` (line 72) | Platform only |
   | `controllers/client/bookingController.js` | `createBookingPaymentIntent` (line 54) | Platform only |
   | `controllers/client/ItemController.js` | `createItemPaymentIntent` (line 76) | Platform only (**route commented out**) |
   | `controllers/vendor/bookingAnalytics.js` | `createPaymentIntent` (line 621) | Platform only |

   ### Where `stripe.charges.create` is called

   **Not found.**

   ### `on_behalf_of` / `transfer_data.destination`

   **Not found** on PaymentIntent creation.

   ### Vendor payout transfers

   | File | Function | API |
   |---|---|---|
   | `controllers/admin/PaymentController.js` | `payoutVendorBookings` (line 441) | `stripe.transfers.create` |
   | `controllers/admin/PaymentController.js` | `payVendorClaim` (line 637) | `stripe.transfers.create` |

   ### Refunds

   | File | Function | API |
   |---|---|---|
   | `controllers/admin/PaymentController.js` | `refundClient` (line 747) | `stripe.refunds.create({ payment_intent, amount })` |

   Refunds go to the **client** from the original platform PaymentIntent, not via connected account charge reversal.

   ---

   ## 7. Database / Models

   ### `User` model (`models/User.js`)

   | Field | Type | Purpose |
   |---|---|---|
   | `stripeAccountId` | String (default `""`) | Stripe Connect Express account ID (`acct_...`) |
   | `stripeOnboardingComplete` | Boolean (default `false`) | Local flag; set by onboarding status poll |

   ### `Vendor` model (`models/Vendor.js`)

   **No Stripe Connect fields** on Vendor document. Stripe Connect state lives on **User**.

   Note: `paymentController.createSubscription` writes `vendor.stripeCustomerId` and `vendor.subscription`, but **these paths are not defined in the Vendor schema**.

   ### `PaymentIntent` model (`models/PaymentIntent.js`)

   | Field | Purpose |
   |---|---|
   | `stripeIntentId` | Stripe PaymentIntent ID |
   | `clientSecret` | Client-side confirmation |
   | `status` | Mirrored Stripe status |
   | `amount`, `currency`, `metadata`, etc. | Local payment tracking |

   ### `Booking` model (`models/Booking.js`)

   | Field | Purpose |
   |---|---|
   | `paymentIntentId` | Legacy/single PI reference |
   | `payments[].paymentIntentId` | Multiple payment records for refunds |
   | `vendorPaid` | Whether admin transferred vendor share |
   | `vendorPaidAt` | Payout timestamp |
   | `stripeTransferId` | Transfer ID from admin payout |
   | `claimDetails.stripeTransferIdToUser` | Reserved for claim-related transfer (commented usage in refunds) |
   | `securityRefundDetails.stripeRefundId` | Refund tracking |

   ### `Plan` model (`models/Plan.js`)

   | Field | Purpose |
   |---|---|
   | `stripeProductId` | Stripe Product for subscription plan |
   | `stripePriceId` | Stripe Price for subscription plan |

   ### Other models

   No additional Stripe-specific schema fields found on other models.

   ---

   ## 8. Environment Variables

   All Stripe-related environment variable **names** referenced in code:

   | Variable | Referenced in |
   |---|---|
   | `STRIPE_SECRET_KEY` | `config/stripe.js` |
   | `STRIPE_WEBHOOK_SECRET` | `controllers/stripeWebhookController.js` |

   Documented in `README_STRIPE.md` only (same two names).

   **Not found:** publishable key env var, Connect client ID, redirect URL overrides, webhook path config.

   ---

   ## 9. Current Problems / Gaps

   ### What registration currently collects

   Registration (`registerVendor2`) collects a **full marketplace vendor profile**:

   - Account type (personal vs business)
   - Credentials (email/businessEmail, password, OTP)
   - Contact info (phone, address, city, postal code)
   - Personal ID proxy (`passportDetails`) or business registry ID (`kvkNumber`)
   - Business branding and operations (name, website, description, logo, images, team info, categories)

   This data is stored in **MongoDB** (`User` + `Vendor`) and used for marketplace operations and admin review (`isApproved: false` at signup).

   ### What registration does NOT collect (but Stripe asks for in hosted onboarding)

   - Date of birth
   - Bank account / IBAN for payouts
   - National tax identifier (BSN) for individuals
   - Country (explicit field)
   - MCC and structured business profile fields for Stripe
   - Terms acceptance metadata (IP + timestamp) for API-based onboarding
   - Identity document images (when Stripe requires verification)

   Even fields **already collected** (name, address, phone, KVK, website) are **never forwarded to Stripe**, so the vendor re-enters them (or equivalent) in Stripe’s UI.

   ### Architectural / operational gaps

   1. **Two-step Connect flow** — Registration and Stripe Connect are completely decoupled; vendors must log in and hit separate endpoints after signup.
   2. **No `stripe.accounts.update` prefill** — Hosted onboarding collects everything Stripe still needs.
   3. **No onboarding webhooks** — `account.updated` / `capability.updated` are ignored; status depends on client polling `onboarding-status`.
   4. **Hardcoded redirect URLs** — Not environment-configurable; risky for staging/local dev.
   5. **Strict onboarding flag** — Requires `details_submitted && charges_enabled && payouts_enabled`; may block vendors who can receive transfers but have asymmetric capability states (worth validating against Stripe dashboard behavior for transfer-only Express accounts).
   6. **Subscription code vs schema mismatch** — `createSubscription` expects Vendor fields that do not exist in schema.
   7. **Incomplete server validation** — `registerVendor2` required-field arrays are unused.
   8. **User schema mismatch** — `tagline` / `description` passed to `User.create` but not in schema.

   ### What needs to change to pre-fill all required Stripe fields and eliminate manual Stripe onboarding

   > **Important:** For **Express** accounts, Stripe may still require **identity verification** (document upload) that cannot be fully replaced by form fields. Eliminating **all** hosted UI may require **Custom** accounts or Stripe’s embedded/onboarding components with explicit compliance review.

   Recommended direction (high level):

   1. **Extend registration (or a dedicated “payout setup” step before Account Link)** to collect Stripe-mandatory fields:
      - DOB, country, structured address, E.164 phone
      - IBAN (external account)
      - Business type mapping from `accountType`
      - Map `kvkNumber` → company tax ID where valid for Stripe NL
      - MCC (from category mapping or explicit selection)
      - TOS acceptance with IP and timestamp

   2. **After `stripe.accounts.create`, call `stripe.accounts.update`** with:
      - `business_type`, `individual` or `company` objects
      - `business_profile` (url, mcc, product_description)
      - `external_account` (IBAN tokenization pattern per Stripe docs)
      - `tos_acceptance`

   3. **Then create Account Link** with appropriate `collection_options` (e.g. `fields: "currently_due"` or `future_requirements`) so Stripe only collects **residual** verification items.

   4. **Add webhooks** for `account.updated` and `capability.updated` to sync `stripeOnboardingComplete` without polling.

   5. **Map existing registration fields automatically** so vendors are not asked twice for name, address, phone, KVK, and website.

   6. **Environment-configure** `return_url` and `refresh_url`.

   7. **Decide product strategy:**
      - **Minimize hosted UI (Express + prefill):** Less duplicate data entry; Stripe may still show verification screens.
      - **Eliminate hosted UI entirely:** Likely requires **Custom Connect** + full compliance ownership, or Stripe Connect embedded components with all KYC handled in your UI under Stripe review.

   ---

   ## 10. File Map

   Every file in this codebase that touches Stripe in any way:

   | File | One-line description |
   |---|---|
   | `config/stripe.js` | Initializes Stripe SDK with `STRIPE_SECRET_KEY` |
   | `controllers/authController.js` | Creates Express Connect accounts, Account Links, onboarding status checks |
   | `controllers/stripeWebhookController.js` | Verifies webhook signatures; handles PaymentIntent lifecycle events |
   | `controllers/paymentController.js` | Creates platform PaymentIntents, vendor subscriptions, webhook status updates |
   | `controllers/admin/PaymentController.js` | Admin vendor transfers, claim payouts, client refunds; gates on onboarding |
   | `controllers/client/bookingController.js` | Creates booking PaymentIntents on platform account |
   | `controllers/client/ItemController.js` | Item purchase PaymentIntent logic (active route currently commented out) |
   | `controllers/vendor/bookingAnalytics.js` | Vendor booking PaymentIntent creation endpoint |
   | `controllers/vendor/profileController.js` | Exposes `stripeOnboardingComplete` in vendor profile API |
   | `models/User.js` | Stores `stripeAccountId` and `stripeOnboardingComplete` |
   | `models/Vendor.js` | Vendor profile (no Stripe fields; subscription fields referenced elsewhere missing) |
   | `models/PaymentIntent.js` | Persists Stripe PaymentIntent IDs and client secrets |
   | `models/Booking.js` | Stores payment intent refs, transfer IDs, refund IDs, vendor paid flags |
   | `models/Plan.js` | Stores `stripeProductId` and `stripePriceId` for subscriptions |
   | `routes/auth.js` | Mounts vendor Stripe connect, onboarding-link, onboarding-status routes |
   | `routes/payments.js` | PaymentIntent, subscription, and webhook routes |
   | `routes/admin/Payment.js` | Admin payout and refund routes using Stripe transfers/refunds |
   | `routes/client/bookings.js` | Client booking PaymentIntent route |
   | `routes/vendor/booking.js` | Vendor-side PaymentIntent route |
   | `routes/client/Items.js` | Commented-out item PaymentIntent route reference |
   | `app.js` | Raw body capture for webhook; mounts `/api/payments` and auth routes |
   | `README_STRIPE.md` | Human-readable Stripe integration notes and env var documentation |
   | `package.json` | Declares `stripe` npm dependency (^18.5.0) |
   | `yarn.lock` | Lockfile entry for `stripe` package |

   ---

   ## Appendix A — API Route Reference (Stripe-related)

   | Method | Path | Auth | Handler |
   |---|---|---|---|
   | POST | `/api/auth/vendor/register` | Public | `registerVendor2` |
   | POST | `/api/auth/vendor/stripe/connect` | `requireAuth` | `connectVendorStripe` |
   | GET | `/api/auth/vendor/stripe/onboarding-link` | `requireAuth` | `getStripeOnboardingLink` |
   | GET | `/api/auth/vendor/stripe/onboarding-status` | `requireAuth` | `checkStripeOnboardingStatus` |
   | POST | `/api/payments/create-payment-intent` | Not enforced in route | `createPaymentIntent` |
   | GET | `/api/payments/get-payment-intent/:internalId` | Not enforced in route | `getPaymentIntentByInternalId` |
   | POST | `/api/payments/create-subscription` | Not enforced in route | `createSubscription` |
   | POST | `/api/payments/webhook` | Stripe signature | `handleWebhook` |
   | POST | `/api/booking/:id/create-payment-intent` | `requireAuth`, `requireClient` | `createBookingPaymentIntent` |
   | POST | `/api/vendor/bookings/create-payment-intent` | Vendor route middleware | `createPaymentIntent` (bookingAnalytics) |
   | GET | `/api/admin/payments/` | Admin route | Vendor payout dashboard |
   | POST | `/api/admin/payments/:vendorId/disburse-payments` | Admin route | `payoutVendorBookings` |
   | POST | `/api/admin/payments/vendor-claims` | Admin route | `payVendorClaim` |
   | POST | `/api/admin/payments/refund` | Admin route | `refundClient` |

   ---

   ## Appendix B — Items explicitly not found

   | Item | Status |
   |---|---|
   | Frontend vendor registration form | Not found (backend-only repo) |
   | `stripe.checkout.sessions.create` | Not found |
   | `stripe.charges.create` | Not found |
   | `account_update` Account Link type | Not found |
   | `stripe.accounts.update` (prefill) | Not found |
   | `account.updated` webhook handler | Not found |
   | `transfer_data` / `on_behalf_of` on payments | Not found |
   | Stripe publishable key env var | Not found |
   | Stripe Connect during `registerVendor2` | Not found |
   | `account_links` literal string | Not found (SDK uses `accountLinks`) |

   ---

   *End of audit.*


the stripe research for feasability Prefilling Stripe Express Connect Vendor Data
Yes – you can use the Stripe Connect API (stripe.accounts.update) to prefill all of the vendor’s data on the Express account before onboarding. Stripe’s docs explicitly say you can “prefill any account information, including personal and business information, external account information, and so on” on the Account object. In practice this means you can set fields like individual.first_name, individual.last_name, individual.dob, individual.address (line1, line2, city, postal code, country), and company fields (company.name, company.address.*) on an Express account via accounts.update prior to onboarding. You can also set business profile info (e.g. business_profile.url or business_profile.product_description) and add a bank account via the external_account parameter. In short, any field collected on your side (first/last name, address, dob, phone, business profile, etc.) can be pushed to the Stripe account via the Update API, as long as you do it before creating the Account Link.

Hosted Onboarding Behavior
Stripe’s hosted onboarding will skip any fields you have already set on the account. In other words, if you call accounts.update with the vendor’s name, DOB, address, IBAN, etc., the Stripe Express UI will not ask the user to re-enter them – they will only need to confirm those values. In Stripe’s own words: “Connect Onboarding doesn’t ask for the prefilled information. However, it does ask the account holder to confirm the prefilled information before accepting the Connect service agreement.”. Thus once you prefill fields, the hosted flow will proceed directly to any remaining requirements. By default, Stripe’s account-link flow only collects currently_due fields (skipping any that aren’t required or already filled). (If you want to override that, the account_links.create API now supports a collection_options parameter – e.g. collection_options.fields = "currently_due" vs "eventually_due" – to explicitly include or omit additional requirements. By default it only collects currently-due requirements.)

Adding a Bank Account (IBAN)
To attach an IBAN for a NL/EUR account, you can use the external_account parameter on accounts.update. Stripe supports two methods:

Using Stripe.js token (recommended): On the client, call stripe.tokens.create({bank_account: {country: 'NL', currency: 'eur', account_holder_name: '…', account_holder_type: 'individual', account_number: 'NLxx...'}}). Send the returned token ID to your backend and run:

js
Copy
await stripe.accounts.update(accountId, {
  external_account: token.id
});
This tells Stripe to attach the bank-account token to the connected account (making it the default account for EUR).

Direct raw upload (backend): Alternatively, you can pass the IBAN directly in the API call without tokenizing. For example:

js
Copy
await stripe.accounts.update(accountId, {
  external_account: {
    object: 'bank_account',
    country: 'NL',
    currency: 'eur',
    account_number: 'NL02ABNA0123456789',
    account_holder_name: 'Vendor Name',
    account_holder_type: 'individual'
  }
});
Here external_account.account_number is the full IBAN. The required fields are object='bank_account', country='NL', currency='eur' (lowercase) and the account_number string, per Stripe’s API. (For IBAN uploads, you do not need to provide a routing number.) Using Stripe.js tokens is more secure since you don’t handle raw IBAN data, but sending the hash from your server also works exactly as above.

Always-Required Onboarding Fields
Some items cannot be prefilled or bypassed for Express accounts. In particular, the connected account holder must accept Stripe’s Terms of Service and complete any required identity checks in the hosted flow. These steps correspond to fields like tos_acceptance.date and tos_acceptance.ip (which Stripe requires in its requirements list). You cannot set those via the API, because they must record the user’s action and IP in the UI. Likewise, if Stripe deems identity verification necessary (passport/ID or proof of address), those document uploads are done through Stripe’s UI. In summary, after you skip the prefilled fields, the onboarding flow will still require the user to confirm and accept the prefilled info and then handle TOS acceptance and any KYC documents. For example, an account’s requirements object will typically list "tos_acceptance.date", "tos_acceptance.ip" as due items if they haven’t been completed. These cannot be filled in advance.

Example API Call for NL Individual
Below is a concrete Node.js example of updating a Netherlands-based individual account with all the vendor data at once (assuming stripeAccountId is the Express account ID). This sets business_type='individual', the person’s name, DOB, address, phone, business profile, and IBAN as the external account.

js
Copy
await stripe.accounts.update(stripeAccountId, {
  business_type: 'individual',
  individual: {
    first_name: 'Alice',
    last_name: 'Bakker',
    dob: { day: 15, month: 6, year: 1985 },
    address: {
      line1: 'Hoofdstraat 123',
      line2: 'Apt 45',
      city: 'Amsterdam',
      postal_code: '1234AB',
      country: 'NL'
    },
    phone: '+31201234567'
  },
  business_profile: {
    url: 'https://www.voorbeeld.nl',
    product_description: 'Wedding planning and event services'
  },
  external_account: {
    object: 'bank_account',
    country: 'NL',
    currency: 'eur',
    account_number: 'NL02ABNA0123456789',
    account_holder_name: 'Alice Bakker',
    account_holder_type: 'individual'
  }
});
All field names above match Stripe’s API. For instance, individual.first_name/last_name/dob/address/phone and business_profile.url/product_description come directly from the Accounts API reference. The external_account object keys (object, country, currency, account_number, etc.) follow the bank-account schema. By making this single call before creating the account link, Stripe will have already received all those KYC details for the onboarding session.

Express vs Custom Accounts
This approach is fully supported on Express Connect accounts. Stripe’s docs confirm that Express (and Standard) connected accounts let you update all of the above information via API until you start the onboarding flow. In other words, doing stripe.accounts.update with all collected data prior to creating the Account Link is the intended pattern. You do not need Custom accounts just to prefill; Custom accounts are only required if you want to collect requirements completely on your side after onboarding. The only restriction is that once you create an Express account link (or session) to start onboarding, you can no longer update these fields via API – at that point Stripe takes over collection. But since we update everything before generating the link, Express works fine. (By contrast, Custom accounts would allow post-onboarding updates, but that is unnecessary here.)

References: Stripe Connect API docs (Accounts Update, Account Links) and Express onboarding guides. These outline which fields can be set and how the hosted flow behaves.