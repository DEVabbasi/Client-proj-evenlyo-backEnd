# Flow: Admin Moderation

What the admin panel can do beyond read-only analytics — user management, tracking overrides, payouts, CMS.

**Auth reality:** Only **some** routes use `requireAdmin`. Many critical routes have **no middleware** — see [05-audit-findings.md](../05-audit-findings.md#C-001).

---

## Dashboard

`GET /api/admin/dashboard/stats` — `requireAdmin` — aggregate counts/revenue.

`GET /api/admin/report/stats-card` — **no auth** — report cards.

---

## User management

Mounted at `/api/admin/users/*` — `requireAdmin` throughout (`userManagement.js`):

| Action | Endpoint |
|--------|----------|
| List clients/vendors | `GET .../clients`, `GET .../vendors` |
| Detail | `GET .../:id` |
| Block/unblock | `PATCH .../status` |
| Approve vendor | `PATCH .../vendors/:id/approval` |
| Reset password | `PATCH .../reset-password` |
| Bulk email | `POST .../send-email` |

---

## Tracking override

`/api/admin/tracking/*` — `requireAdmin`

- List all bookings + sale orders
- `GET /:trackingId` — detail
- `PATCH /:trackingId/status` — **manual status change** — bypasses normal lifecycle guards
- Status history endpoints

Useful for support but dangerous without audit logging of who changed what.

---

## Payments and refunds

`/api/admin/payments/*` — **no auth**

- List payments, payout orders per vendor
- `POST /:vendorId/disburse-payments` — Stripe transfer to connected account
- `POST /refund`, `POST /vendor-claims`

> **Audit — Critical:** [05-audit-findings.md](../05-audit-findings.md#C-001)

---

## CMS

| Content | Routes | Auth |
|---------|--------|------|
| Blogs | `/api/admin/blogs/*` | `requireAdmin` |
| FAQs | `/api/admin/faqs/*` | **None** |
| Knowledge base (QnA) | `/api/admin/qna/*` | **None** |
| Plans | `/api/admin/plans/*` | Mixed |

Public read: `/api/blogs`, `/api/faqs`

---

## Settings

`/api/admin/settings/*` — `requireAdmin`

- Platform fees (`Settings` singleton)
- Admin notification toggles

---

## Employee management (separate from user management)

`/api/admin/create-employee`, `/api/admin/fetch-employees`, etc. — **no auth** on CRUD.

Login: `POST /api/login-admin` — public (expected).

---

## Related

- [01-roles-and-permissions.md](../01-roles-and-permissions.md)
- [support-and-chatbot.md](./support-and-chatbot.md)
- [admin-api.md](../04-api-reference/admin-api.md)
