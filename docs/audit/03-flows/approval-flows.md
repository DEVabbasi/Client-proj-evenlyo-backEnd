# Flow: Vendor & Listing Approval (incl. Edit Re-Approval)

How vendor activation and listing review work end-to-end between the backend
(`Evenlyo-BACKEND`) and the admin dashboard (`Evenlyo-Admin-Dashboard`).

Verified against the current backend source and the admin frontend wiring.

---

## 1. The two toggles (single source of truth)

Only **two** online/offline switches exist. There is **no** third
`editReapprovalRequired` toggle — edit re-approval is deliberately covered by
`itemApprovalRequired`.

| Toggle | Where | Effect when ON |
|--------|-------|----------------|
| `vendorActivationRequired` | `Settings.approvalSettings.vendorActivationRequired` | New vendor accounts stay hidden until an admin approves (`User.approvalStatus`) |
| `itemApprovalRequired` | `Settings.approvalSettings.itemApprovalRequired` | Submitted **and** live-edited listings require admin review before being publicly visible |

**Backend:**
- `models/Settings.js` — schema default
  `{ vendorActivationRequired: true, itemApprovalRequired: true }`
- `utils/getApprovalSettings.js` — `DEFAULT_APPROVAL_SETTINGS`
- `controllers/admin/adminApprovalController.js` —
  `updateAdminApprovalSettings` accepts only these two field names and only
  booleans; rejects unknown fields via `allowedFields` whitelist.

**Frontend:**
- `src/components/admin/approval/ApprovalSettings.jsx` — `TOGGLES` array has
  exactly these two switches. Copy explicitly mentions edited listings:
  "Require review for **submitted or edited** listings before going live."
- Toggle click → `updateApprovalSettingsAction` (Redux) →
  `adminApprovalService.updateApprovalSettings` → PATCH `/api/admin/approvals/settings`
  with `{ approvalSettings: { <key>: <bool> } }` (backend also accepts flat body).
- On failure the local switch rolls back (`previousValue`) and a toast is shown.

---

## 2. Data model states

| Entity | Field | States |
|--------|-------|--------|
| `Listing` | `approvalStatus` | `pending` → `approved` → `rejected` / `edited` (4-state, `models/Listing.js`) |
| `Listing` | `approvalHistory[]` | entries with `status`, `reason`, `changedBy`, `changedAt` (same 4-state enum) |
| `User` (vendor) | `approvalStatus` | `pending` / `approved` / `rejected` only — **vendor has no `edited` state** (`models/User.js`) |
| `Settings` | `approvalSettings` | exactly the two booleans |

`Listing.vendor` references the vendor **User** `_id` (not `Vendor._id`). The
admin endpoints resolve `Vendor._id → User._id` when filtering by vendor.

---

## 3. Listing creation flow

`POST /api/vendor/listings/create` (`controllers/vendor/listingManagement.js`)

1. Vendor authenticated (`requireAuth`), owner userId resolved.
2. `itemApprovalRequired` ON → `approvalStatus = "pending"`,
   `submittedForReviewAt = now`. OFF → `approvalStatus = "approved"`,
   `submittedForReviewAt = null`.
3. `isFirstListing` = no existing listings for the owner.
4. If **first listing** → vendor activation side-effect on the `User`:
   - `vendorActivationRequired` ON → `approvalStatus = "pending"` (+ clears
     old rejection/review metadata).
   - OFF → `approvalStatus = "approved"` (auto-approved).
5. If `itemApprovalRequired` → `notifyAdminListingSubmitted` (admin
   notification; on first listing + vendor activation required also the Dutch
   admin **email**).
6. Response bundles `approval` info so the client can show the correct
   pending/live messaging.

---

## 4. Listing edit flow — the edit re-approval matrix

`PUT /api/vendor/listings/update/:id` (`controllers/vendor/listingManagement.js`)

Vendor cannot set `approvalStatus` (deleted from body). Next status is derived:

| Previous `approvalStatus` | `itemApprovalRequired` | New status | Admin notification? |
|---------------------------|------------------------|------------|---------------------|
| `approved` (live)         | ON                      | `edited`   | Yes — re-approval |
| `approved` (live)         | OFF                     | `approved` | No (stays live) |
| `rejected`                | ON                      | `pending`  | Yes — resubmission |
| `pending`                 | ON                      | `pending`  | No (already queued) |
| `edited`                  | ON                      | `edited`   | No (already queued) |
| any                       | OFF                     | `approved` | No (auto-approve) |

Notes:
- `approved → edited` also resets `submittedForReviewAt = now`,
  `reviewedAt = null`, `reviewedBy = null`.
- `rejected → pending` also clears `rejectionReason`.
- `approvalHistory` is appended only when the status actually changes
  (`previous !== next`); `changedBy` is the owner user.
- Admin notification condition (fire-and-forget):

  ```js
  shouldNotifyAdmin =
    nextApprovalStatus === "edited" ||
    (previousApprovalStatus === "rejected" && nextApprovalStatus === "pending");
  ```

- An item remains visible while live until an admin acts (see §8 visibility for
  the toggles' effect on public exposure).

---

## 5. Vendor approval flow

Vendor approval state lives on the `User`; it is **not** on the `Vendor`
document (the `Vendor` schema only has the field commented out).

### Trigger points
- **First listing** creation with `vendorActivationRequired` ON →
  `User.approvalStatus = "pending"` (goes into the admin review queue).
- **Manual** approve/reject from the admin panel.
- **First-listing approval** (`approveListing`) also activates the vendor
  (`vendorUser.approvalStatus = "approved"`) when
  `vendorActivationRequired` is ON and the vendor isn't approved yet — this is
  the "vendor activation through listing approval" path.

### Editing a vendor profile
No code path resets an approved vendor back to `pending`/`edited` on profile
edits (the `User` enum has no `edited`). Vendor profile changes do **not**
trigger re-review — edit re-approval only applies to listings.

---

## 6. Admin routes & frontend wiring

Backend mount: `/api/admin` (`routes/admin/adminApprovalRoutes.js`, behind
`requireAdmin`).

| Operation | Method | Endpoint | Frontend const / service |
|-----------|--------|----------|--------------------------|
| List vendors | GET | `/approvals/vendors?page&limit&status&search` | `adminApproval.vendors` |
| Vendor detail | GET | `/approvals/vendors/:vendorId` | `adminApproval.vendorDetails` |
| Approve vendor | PATCH | `/approvals/vendors/:vendorId/approve` | `adminApproval.approveVendor` |
| Reject vendor | PATCH | `/approvals/vendors/:vendorId/reject` | `adminApproval.rejectVendor` |
| List listings | GET | `/approvals/listings?page&limit&status&search&vendorId&categoryId&subCategoryId` | `adminApproval.listings` |
| Listing detail | GET | `/approvals/listings/:listingId` | `adminApproval.listingDetails` |
| Approve listing | PATCH | `/approvals/listings/:listingId/approve` | `adminApproval.approveListing` |
| Reject listing | PATCH | `/approvals/listings/:listingId/reject` | `adminApproval.rejectListing` |
| Get settings | GET | `/approvals/settings` | `adminApproval.settings` |
| Update settings | PATCH | `/approvals/settings` | `adminApproval.updateSettings` |

Validation:
- Vendor list `status` whitelist: `all, pending, approved, rejected` (no
  `edited` — vendors don't have it).
- Listing list `status` whitelist: `all, pending, approved, rejected, edited`.
- Approve/Reject return `400` when the respective toggle is OFF
  (`VENDOR_APPROVAL_DISABLED` / `ITEM_APPROVAL_DISABLED`), plus
  `LISTING_ALREADY_APPROVED` etc.
- Rejection requires a reason (string or `{en, nl}`); normalized via
  `toMultilingualText`.

### Frontend chain (verified)
`Component → Redux thunk (adminApprovalSlice) → adminApprovalService → axios (src/service/index.js, base VITE_API_URL) → backend`

- Page: `src/pages/admin/VendorListingApprovals/index.jsx` (tabs vendors /
  listings, debounced search, pagination, URL `page` param, AbortController,
  settings fetched once via `settingsFetchedRef`).
- Components: `VendorTable`, `ListingTable`, `ReviewDrawer`,
  `ApprovalStatusBadge`, `RejectionDialog`, `ApprovalConfirmation`,
  `ApprovalSettings`, `ActionButton`.
- Redux: `src/store/slices/adminApprovalSlice.js` — per-row
  `actionLoading.{approvingVendorId,rejectingVendorId,approvingListingId,rejectingListingId,updatingSettings}`;
  `success === false` → `rejectWithValue`; detail state `selectedVendor` /
  `selectedListing`.
- HTTP contract locked by MSW tests (`src/test/server.js`): approve/reject are
  **PATCH** (this was a past bug — the service used to POST).

---

## 7. Notifications & email mapping

All notification/email calls are **fire-and-forget** via
`utils/approvalNotifications.js` (`safeNotify` / `safeEmail`); failures are
logged and never block the approval operation.

| Event | In-app notification | Email |
|-------|---------------------|-------|
| Listing submitted / edited-to-`edited` / rejected-resubmitted | `notificationFor: "Admin"` — "New listing submitted for review" | Dutch `sendVendorReviewEmail` **only** on first listing + `vendorActivationRequired` (goes to `CONTACT_EMAIL`) |
| Listing approved | `notificationFor: "Vendor"` — "Listing approved" | Dutch `sendVendorApprovalEmail` **only** when `vendorJustActivated` (first-listing approval that also activates the vendor) |
| Listing rejected | `notificationFor: "Vendor"` — includes reason | none |
| Vendor approved (manual) | `notificationFor: "Vendor"` — "Vendor account approved" | none (email reserved for activation path) |
| Vendor rejected | `notificationFor: "Vendor"` — includes reason | none |

Storage/display:
- Notifications are `Notification` docs (`controllers/notificationController.js`
  `createNotification`).
- Admin fetch: `GET /api/notifications/admin-notifications`
  (`routes/notifications.js`) — aggregates `notificationFor: "Admin"`.
  Displayed in `DashboardHeader` and the admin `Notifications` page
  (`notificationsService.getAllNotifications`).
- Vendor fetch: `GET /api/notifications/vendor-notifications`
  (`notificationFor: "Vendor"` + `vendorId` match).

---

## 8. Public visibility (client side)

### Listings (`controllers/client/listingController.js`)
- `itemApprovalRequired === true` → every public query adds
  `approvalStatus: "approved"`; non-approved items are invisible.
- **`itemApprovalRequired === false` → no `approvalStatus` filter is added.**
  Consequence: `pending`, `rejected`, and `edited` listings become publicly
  visible whenever the toggle is OFF.

### Vendors (`controllers/client/vendorController.js`)
- `vendorActivationRequired === true` → vendors are public only when
  `userId.approvalStatus === "approved"`.
- `false` → no approval filter → pending/rejected vendors are public.

---

## 9. Test status (verified this session)

### Backend (`Evenlyo-BACKEND`, Jest + mongodb-memory-server)
Command: `npx jest tests/adminApproval`
Result: **79 passed, 0 failed** (5 suites) — run with `--runInBand` for
stability (the in-memory mongod can flake under parallel workers).

The previous single failure was a stale test
(`approvalNotifications.test.js` "Update flow admin notifications › No admin
notification when edit reapproval is disabled") that set a third, non-existent
`editReapprovalRequired` toggle. It was rewritten to assert the real 2-toggle
behaviour: with `itemApprovalRequired: false`, editing a live listing keeps it
`approved` and no admin notification is created.

Sandbox helper: `tests/adminApproval/helpers/db.js` pins a local
`mongod` binary (win32 8.2.6) via `systemBinary`.

### Frontend (`Evenlyo-Admin-Dashboard`, Vitest)
Command: `npx vitest run src/components/admin/approval src/test/adminApprovalService.test.js src/test/adminApprovalSlice.test.js`
Result: **all approval suites pass** (service contract, slice thunks,
tables/dialog/badge, plus the new "approve/reject enabled for edited listings"
regression test). Note: `RejectionDialog.test.jsx` can time out at 5000ms when
run inside the full suite — it passes reliably in isolation (typing the long
reason string is slow under parallel load).

---

## 10. Edge cases / known gaps

1. **`edited` listings are now actionable in the admin UI (fixed).**
   - `ListingTable.jsx`: Approve/Reject buttons render for
     `approvalStatus === "pending"` **or** `"edited"` (`isActionable`).
   - `ReviewDrawer.jsx`: approve/reject enabled for `pending` **or** `edited`
     (`listingApproveDisabled`); still disabled when `itemApprovalRequired` is
     OFF or the status is outside the actionable set.
   - Backend supports it: `approveListing` only rejects already-`approved`
     listings; `rejectListing` only rejects already-`rejected`. So
     `edited → approved` / `edited → rejected` both work via the UI now.
   - Edit-reapproval loop now closes: vendor edits live listing → `edited` →
     admin notified → admin approves (item goes live again with fresh
     `reviewedAt`/`reviewedBy`) or rejects (vendor can resubmit → `pending`).

2. **`itemApprovalRequired: false` publicly exposes non-approved listings.**
   All public listing queries drop the `approvalStatus: "approved"` filter, so
   `pending`/`rejected`/`edited` items are indexable/visible. If unintended,
   client queries should always filter `approved` regardless of the toggle.

3. **`GET /api/notifications/admin-notifications` is unauthenticated**
   (no `requireAuth`). It only returns `notificationFor: "Admin"` (which are
   approval + booking notifications), but the endpoint itself is public.

4. **Vendor has no `edited` state** (`User.approvalStatus` enum has no
   `edited`), and vendor profile edits do not trigger re-review. Only listing
   edits do.

5. **Listing edit of an already-`edited`/`pending` item does not re-notify**
   the admin (stays same state, `shouldNotifyAdmin` only true on transition
   into `edited` or `pending`-from-`rejected`). Admin already has the queued
   item, so this is by design.

6. **Approval email copies are Dutch-only** and are intentionally limited to
   the activation/first-listing review paths (reserved tone); approve/reject
   of later listings notify in-app only.

---

## 11. Related docs

- [listing-lifecycle.md](./listing-lifecycle.md)
- [vendor-onboarding.md](./vendor-onboarding.md)
- [admin-moderation.md](./admin-moderation.md)
- [05-audit-findings.md](../05-audit-findings.md)
- Admin dashboard audit: `Evenlyo-Admin-Dashboard/ADMIN_APPROVAL_AUDIT_REPORT.md`