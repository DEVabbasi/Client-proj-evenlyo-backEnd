# Flow: Vendor Team and RBAC

Vendors can create **employees** with designations and permission pages — but server-side enforcement is weak.

---

## Models (parallel systems)

| Model | Purpose |
|-------|---------|
| `VendorDesignation` | Permission templates per vendor |
| `Employee` | Sub-login (email/password) linked to vendor |
| `Designation` | Richer vendor-scoped RBAC (alternate system) |
| `Role` | Linked from `User.role` — platform-level |

Three systems coexist — easy to confuse which is active.

---

## Vendor designation CRUD

**Unauthenticated routes** at `/api/vendor/create-designation`, etc. (`vendorDesignationsROute.js`)

**Authenticated routes** at `/api/vendor/roles/*` (`requireAuth`, sometimes `requireVendor`)

---

## Create employee

`POST /api/vendor/roles/role-users` — `requireAuth` — `createRoleUser`

Creates `Employee` with hashed password, links `VendorDesignation`.

---

## Employee login

Uses **same** `POST /api/auth/vendor/login` as vendor owner.

JWT `id` = **vendor owner's User `_id`** (not employee id).

Response includes `pages` array from designation permissions — **frontend menu gating only**.

`requireAuth` employee branch checks `emp.status` but Employee model uses **`isActive`**, not `status` — employee path may always fail if token had `userType: vendor` with employee id.

> **Audit — Critical:** Employee token impersonates owner; no server-side page checks. [05-audit-findings.md](../05-audit-findings.md#C-005)

---

## Register vendor from role user

`POST /api/vendor/roles/register-vendor-from-role` — **no auth** — promotes role user to vendor.

---

## Admin designations (platform staff)

`/api/admin/create-designation`, `/api/admin/fetch-employees` — separate from vendor team — **mostly unauthenticated**.

`AdminEmployee` + `AdminDesignation` for admin panel users.

---

## Related

- [auth-and-registration.md](./auth-and-registration.md)
- [01-roles-and-permissions.md](../01-roles-and-permissions.md)
- [vendor-api.md](../04-api-reference/vendor-api.md)
