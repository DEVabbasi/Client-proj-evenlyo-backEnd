# API Reference — Public and Auth

Base URL: `/api`. No `/v1` prefix.

See flows: [auth-and-registration.md](../03-flows/auth-and-registration.md), [listing-lifecycle.md](../03-flows/listing-lifecycle.md)

---

## Auth (`/api/auth`)

| Method | Path | Auth | Body / params | Response | Notes |
|--------|------|------|---------------|----------|-------|
| POST | `/client/login` | Public + rateLimit + csrf | `email`, `password`, optional FCM fields | `{ token, user }` | [auth flow](../03-flows/auth-and-registration.md) |
| POST | `/vendor/login` | Public | `email`, `password` | `{ token, user, pages? }` | No csrf; master password in code |
| POST | `/admin/login` | Public + rateLimit + csrf | `email`, `password` | **Broken** — no response | Use `/api/login-admin` instead |
| POST | `/logout` | requireAuth | — | success message | Stateless |
| POST | `/send-otp` | Public + rateLimit | `email` | OTP sent | Registration/forgot |
| POST | `/check-registered` | Public + rateLimit + csrf | `email`, `contactNumber?`, `userType?` | `{ exists, provider }` | |
| POST | `/client/register` | Public + rateLimit + csrf | `firstName`, `lastName`, `email`, `contactNumber`, `address`, `password`, `confirmPassword`, `otp` | `201` user | No token returned |
| POST | `/verify-register-otp` | Public + rateLimit | Same as register | `201` | Alt register path |
| POST | `/send-forgot-otp` | Public + rateLimit | `email` | — | |
| POST | `/verify-forgot-otp` | Public + rateLimit | `email`, `otp` | `resetToken` | |
| POST | `/reset-password` | Public + rateLimit + csrf | `email`, `password`, `confirmPassword`, `resetToken` | — | |
| POST | `/google` | Public + rateLimit | `idToken` or `type: "App"`, `userData` | `{ tokens, user }` | Client only |
| GET | `/me` | requireAuth | — | User profile | |
| PATCH | `/fcm-token` | requireAuth | FCM fields | — | Handler may be broken |
| POST | `/vendor/register` | Public + rateLimit + csrf | Large vendor payload + `otp` | `201` | [vendor onboarding](../03-flows/vendor-onboarding.md) |
| POST | `/vendor/reset-password-for-employee` | Public | `email`, `password` | — | Unauthenticated reset |
| POST | `/vendor/stripe/connect` | requireAuth | — | `{ stripeAccountId }` | |
| GET | `/vendor/stripe/onboarding-link` | requireAuth | — | `{ url }` | |
| GET | `/vendor/stripe/onboarding-status` | requireAuth | — | onboarding flags + account | |
| GET | `/health` | Public | — | health | |
| GET | `/firebase-health` | Public | — | Firebase status | |

---

## Public marketplace

### Categories `/api/categories`

| GET | `/` | List categories |
| GET | `/all` | All categories |
| GET | `/:id` | Category by id (duplicate handler registered) |

### Listings `/api/listings`

| GET | `/`, `/all`, `/filter`, `/search`, `/featured`, `/popular` | Browse |
| POST | `/homeData` | Home bundle |
| GET | `/vendor/:vendorId` | By vendor |
| GET | `/:id`, `/:id/availability`, `/calendar/:id` | Detail + availability |

### Subcategories `/api/subcategories`

| GET | `/`, `/category/:categoryId`, `/:id` | Taxonomy |

### Plans `/api/plans`

| GET | `/` | Public plan list |

### Blogs `/api/blogs`

| GET | `/categories`, `/`, `/:id` | Read |
| POST | `/:id/comments` | Add comment (public) |

### FAQs `/api/faqs`

| GET | `/` | List FAQs |

### Items `/api/items`

| GET | `/list` | ServiceItems by category |

### Vendors (discovery) `/api/vendor`

| GET | `/all`, `/bycategory`, `/featured`, `/profile/:vendorId` | Public |
| POST | `/bycategory/:categoryId`, `/details/:vendorId` | Public |

### App settings

| GET | `/api/getSetings` | App version / settings singleton |

### Support

| POST | `/api/support/contact` | Public contact form |

### Chatbot `/api/chatbot`

| POST | `/message` | `{ message, userId?, sessionId? }` |
| POST | `/ticket` | Create chatbot ticket |
| GET | `/health` | Health |

### Booking filters (public)

| POST | `/api/booking/request-by-status` | Filter bookings |
| POST | `/api/booking/request-by-date` | Filter by date |

### Settings

| POST | `/api/settings/vendor/full-data` | Vendor full data lookup |

### Vendor (public misc)

| POST | `/api/vendor/language/translate` | Dutch→English |
| GET | `/api/vendor/profile/get-main-category/:vendorId` | Categories |

---

## Admin auth (not under `/api/auth`)

| POST | `/api/login-admin` | AdminEmployee login |
| POST | `/api/admin/login-employee` | Duplicate login |
| POST | `/api/admin/forgot-password` | OTP |
| POST | `/api/admin/verify-otp` | Verify |
| POST | `/api/admin/reset-password` | Reset |

See [admin-api.md](./admin-api.md) for unauthenticated employee CRUD.

---

## Root

| GET | `/` | i18n health string |
