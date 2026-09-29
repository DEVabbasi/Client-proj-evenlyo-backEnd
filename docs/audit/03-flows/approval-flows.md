# Flow: Listing Approval & Vendor Visibility (incl. Edit Re-Approval)

How listing review and public vendor visibility work end-to-end between the
backend (`Evenlyo-BACKEND`) and the admin dashboard (`Evenlyo-Admin-Dashboard`).

Verified against the current backend source and the admin frontend wiring.

---

## 1. The single toggle (source of truth)

Only **one** online/offline switch exists: `itemApprovalRequired`. There is no
`vendorActivationRequired` toggle and no `editReapprovalRequired` toggle — edit
re-approval is deliberately covered by `itemApprovalRequired`.

| Toggle | Where | Effect when ON |
|--------|-------|----------------|
| `itemApprovalRequired` | `Settings.approvalSettings.itemApprovalRequired` | Submitted **and** live-edited listings require admin review before being publicly visible, and a vendor only becomes publicly visible once one of its listings is approved |

**Backend:**
- `models/Settings.js` — schema default `{ itemApprovalRequired: true }` plus the
  append-only `approvalSettingsHistory` sub-document.
- `utils/getApprovalSettings.js` — `DEFAULT_APPROVAL_SETTINGS` = `{ itemApprovalRequired: true }`.
- `controllers/admin/adminApprovalController.js` —
  `updateAdminApprovalSettings` accepts only `itemApprovalRequired` and only
  booleans; unknown fields are ignored and the endpoint returns
  `400 NO_VALID_SETTINGS` when nothing valid was sent.

**Frontend:** the admin dashboard `ApprovalSettings` component must render a
single switch for `itemApprovalRequired`. Any leftover second toggle for
`vendorActivationRequired` should be removed; the backend ignores it.

### Toggle audit trail

`PATCH /api/admin/approvals/settings` appends an entry to
`Settings.approvalSettingsHistory` **only when the value actually changes**:

```js
{ itemApprovalRequired: <newValue>, previousValue, changedBy, changedAt }
```

Writing the same value again is a no-op and is not recorded. The history is
append-only and is intentionally **not** exposed by the GET settings endpoint.

---

## 2. Data model states

| Entity | Field | States |
|--------|-------|--------|
| `Listing` | `approvalStatus` | `pending` → `approved` → `rejected` / `edited` (4-state, `models/Listing.js`) |
| `Listing` | `approvalHistory[]` | entries with `status`, `reason`, `changedBy`, `changedAt` (same 4-state enum). Retains the *reason* an edit was rejected; there is no stored copy of the previously approved content. |
| `Settings` | `approvalSettings` | the single boolean |
| `Settings` | `approvalSettingsHistory[]` | append-only toggle audit trail |
| `User` (vendor) | `approvalStatus` etc. | **legacy, unused** — the fields still exist in `models/User.js` and in older databases, but nothing in the approval flow reads or writes them |

`Listing.vendor` references the vendor **User** `_id` (not `Vendor._id`). The
admin endpoints resolve `Vendor._id → User._id` when filtering by vendor.

There is **no vendor approval state**. A vendor's public visibility is computed
from its own listings on every read (see §8.2).

---

## 3. Listing creation flow

`POST /api/vendor/listings/create` (`controllers/vendor/listingManagement.js`)

1. Vendor authenticated (`requireAuth`), owner userId resolved.
2. `itemApprovalRequired` ON → `approvalStatus = "pending"`,
   `submittedForReviewAt = now`. OFF → `approvalStatus = "approved"`,
   `submittedForReviewAt = null`.
3. `isFirstListing` = no existing listings for the owner.
4. If `itemApprovalRequired` → `notifyAdminListingSubmitted` (admin
   notification; on the first listing the Dutch admin **email** also goes out).
5. **No `User` write happens here.** Creating a listing never changes any vendor
   approval field; the vendor simply becomes public once it owns an approved
   listing.
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

- An `approved` listing goes **off the public site** as soon as it becomes
  `edited`, and stays off through `rejected` and `pending` until an admin
  approves the edit (see §8.1). The **vendor** however stays visible, because
  `edited` counts as a visible state for the vendor (see §8.2).

---

## 5. Vendor visibility is derived from listings

**There is no separate vendor approval or rejection.** The `PATCH
/approvals/vendors/:vendorId/approve` and `/reject` endpoints have been removed
(controller, routes, exports and notifications). A vendor's public visibility is
derived entirely from its own listings, on every read.

### State machine

| Event | Effect on vendor visibility |
|-------|-----------------------------|
| Vendor submits first listing (toggle ON) | still hidden — no approved listing yet |
| Admin **rejects** the only listing | still hidden; vendor notified + emailed, and because it drops off the site the wording says so |
| Vendor fixes + resubmits | still hidden while `pending`/`edited` |
| Admin **approves** a listing while no other listing is visible | **vendor goes live**; this is the only moment the Dutch approval email is sent |
| Admin rejects a **later** listing (vendor already live) | unchanged — an approved listing is never pulled back, so the vendor stays public |
| Vendor edits its only live listing (`approved → edited`) | **stays visible** — the listing is hidden, but the vendor is not |

The guard used by both the approve and reject paths is
"does this vendor have any *other* listing in a visible state?", i.e.:

```js
Listing.exists({
  vendor: listing.vendor,
  _id: { $ne: listing._id },
  approvalStatus: { $in: VENDOR_VISIBLE_LISTING_STATES }, // ["approved", "edited"]
});
```

This gives the intended property: **a vendor is only ever hidden while it has
zero visible listings**, and rejecting a listing can never pull an already
visible vendor off the public site.

`edited` counts as visible **for the vendor** so that a live vendor does not
disappear while it edits its current listing — while the edited listing itself
stays hidden (§8.1).

Note this also means the vendor goes live via *whichever* listing is approved
first, not strictly the chronologically first submission. If an admin approved
listing #2 before #1, the vendor goes live at that point — which is correct,
because the alternative (a live listing with a hidden vendor) is worse.

### Editing a vendor profile
Vendor profile changes never affect visibility (visibility only depends on
listings) and do **not** trigger re-review — edit re-approval only applies to
listings.

---

## 6. Admin routes & frontend wiring

Backend mount: `/api/admin` (`routes/admin/adminApprovalRoutes.js`, behind
`requireAdmin`).

| Operation | Method | Endpoint | Frontend const / service |
|-----------|--------|----------|--------------------------|
| List vendors | GET | `/approvals/vendors?page&limit&status&search` | `adminApproval.vendors` |
| Vendor detail | GET | `/approvals/vendors/:vendorId` | `adminApproval.vendorDetails` |
| List listings | GET | `/approvals/listings?page&limit&status&search&vendorId&categoryId&subCategoryId` | `adminApproval.listings` |
| Listing detail | GET | `/approvals/listings/:listingId` | `adminApproval.listingDetails` |
| Approve listing | PATCH | `/approvals/listings/:listingId/approve` | `adminApproval.approveListing` |
| Reject listing | PATCH | `/approvals/listings/:listingId/reject` | `adminApproval.rejectListing` |
| Get settings | GET | `/approvals/settings` | `adminApproval.settings` |
| Update settings | PATCH | `/approvals/settings` | `adminApproval.updateSettings` |

Vendor approve/reject endpoints were **removed** — the vendor approve/reject
service methods and Redux thunks in the admin dashboard were deleted at the
same time. Approving/rejecting a vendor happens through its listing.

Validation:
- Vendor list `status` whitelist: `all, pending, approved, rejected`. The value
  is derived from the vendor's listings: `approved` if it has a visible listing,
  `rejected` if it has any rejected listing, otherwise `pending`. The Admin
  queue deliberately keeps showing **all** vendors (including not-yet-public
  ones) so a pending vendor can still be reviewed; the response also carries a
  derived `isLive` flag.
- Listing list `status` whitelist: `all, pending, approved, rejected, edited`.
- Approve/Reject return `400` when the toggle is OFF (`ITEM_APPROVAL_DISABLED`),
  plus `LISTING_ALREADY_APPROVED` / `LISTING_ALREADY_REJECTED` etc.
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
  `actionLoading.{approvingListingId,rejectingListingId,updatingSettings}`;
  `success === false` → `rejectWithValue`; detail state `selectedVendor` /
  `selectedListing`.
- HTTP contract locked by MSW tests (`src/test/server.js`): approve/reject are
  **PATCH** (this was a past bug — the service used to POST).

#### Callback signature contract (bug fixed 2026-09-29)

The drawer and the table hand the entity id to the page through different
callbacks, and the signatures must stay aligned or the id is lost:

| Source | `onApprove` call | `onReject` call |
|--------|-------------------|-----------------|
| `ListingTable` row buttons | `onApprove(listingId, listing)` | `onReject(listingId, title, listing)` |
| `ReviewDrawer` footer | `onApprove(entityId)` | `onReject(entityId, title)` |
| Page handler | `openApproval = (id) => …` | `openRejection = (id, name) => …` |

`ReviewDrawer` used to call `onApprove("listing", entityId)` and
`onReject(title)`, but the page handlers take the **id as the first argument**.
The literal string `"listing"` was therefore used as `:listingId`:

```
PATCH /api/admin/approvals/listings/listing/approve → 400 "Invalid listing ID."
```

This only affected the drawer footer; the table row buttons were always
correct, which is why approving from the list worked while approving from the
open listing detail did not. Both callbacks now pass the id first.
Regression coverage: `src/components/admin/approval/ReviewDrawer.test.jsx`
asserts `onApprove` is called with exactly `[entityId]`.

The backend treats a non-ObjectId `:listingId` as a `400` with
`"Invalid listing ID."` rather than attempting a lookup. That is the intended
contract — only `data.listing._id` from the detail endpoint is a valid
identifier — and is pinned by
`tests/adminApproval/resubmissionAfterRejection.test.js`.

---

## 7. Notifications & email mapping

All notification/email calls are **fire-and-forget** via
`utils/approvalNotifications.js` (`safeNotify` / `safeEmail`); failures are
logged and never block the approval operation.

| Event | In-app notification | Email |
|-------|---------------------|-------|
| Listing submitted / edited-to-`edited` / rejected-resubmitted | `notificationFor: "Admin"` — "New listing submitted for review" | Dutch `sendVendorReviewEmail` **only** on the first listing (goes to `CONTACT_EMAIL`) |
| Listing approved | `notificationFor: "Vendor"` — "Listing approved" | Dutch `sendVendorApprovalEmail` **only** when the approval is what makes the vendor go live (`vendorWentLive`, i.e. it had no visible listing before) |
| Listing rejected, vendor keeps other visible listings | `notificationFor: "Vendor"` — "Listing rejected", includes reason | Dutch `sendVendorRejectionEmail` — **always sent**, on every rejection, including the reason |
| Listing rejected and it leaves the vendor with nothing visible | `notificationFor: "Vendor"` — "Listing rejected - not visible on the site yet" | Dutch `sendVendorRejectionEmail` with `vendorOnHold: true`, same wording in the email |

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

### 8.1 Listings (`controllers/client/listingController.js`)

With `itemApprovalRequired` ON, every public listing query adds
`getPublicListingApprovalFilter(approvalSettings)` from
`utils/getApprovalSettings.js`:

```js
{ approvalStatus: "approved" }
```

**Rule: a listing is public only while it is currently `approved`.** Any
non-approved state takes it off the public site — including an edit awaiting
re-approval:

| Listing state | Visible? |
|---------------|----------|
| `approved` | Yes |
| `edited` (edit awaiting re-approval) | **No** |
| `rejected` (edit rejected) | **No** |
| `pending` (resubmitted) | **No** |

So editing a live listing **takes it offline** until the edit is approved, and it
stays offline through a rejection and a resubmission. There is no
"keep serving the previously approved content" path: the unapproved content is
never published, and the listing is simply held.

With `itemApprovalRequired` OFF, no `approvalStatus` filter is added at all. In
that mode every newly created or edited listing is `approved` anyway, so the
distinction is invisible in practice (see gap #2).

Endpoints covered: `GET /listings`, `GET /listings/:id` (returns `404` for a
non-approved listing), `/listings/featured`, `/listings/popular`,
`GET /listings/search`, `/listings/vendor/:vendorId`, `/listings/filter`,
`GET /listings/all`, `POST /listings/homeData` (both the main query **and** the
`relatedItems` sub-query, which previously had no approval filter at all).

#### No approved-content snapshot

An earlier iteration kept a previously-approved listing on the site by storing
the last approved content in `Listing.approvedSnapshot` and overlaying it on
public reads. That was removed: with the hold-and-remove rule the listing is
hidden anyway, so the snapshot had no consumer. There is no `approvedSnapshot`
field, no `utils/approvedContent.js`, and no `hasPendingChanges` /
`pendingChangesRejected` response flags.

#### `homeData` vendor display name

`POST /api/listings/homeData` populates `Listing.vendor` (a **User**) and then
enriches it from the **Vendor** profile. Because `User.fullName` is often unset,
the public payload used to render as `"undefined undefined"`, so the enrichment
step also exposes `businessName`:

```js
vendor: {
  _id, firstName, isActive, fullName, id,   // populated User (unchanged)
  businessLogo,                             // from Vendor profile
  businessName,                             // from Vendor profile (new)
}
```

`businessName` is only added when the vendor actually has a `Vendor` document
with a name — it is never emitted as an empty string, so the client can chain
further fallbacks. The user fields are untouched, so existing consumers of
`firstName` / `fullName` keep working. Covered by
`listingLifecycle.test.js` → "homeData vendor display name".

### 8.2 Vendors (`controllers/client/vendorController.js`)

All public vendor reads gate on `getLiveVendorUserIds()` from
`utils/getApprovalSettings.js`, which returns the vendor **User** ids that own at
least one listing with `approvalStatus ∈ ["approved", "edited"]`:

- `GET /vendors`, `/vendors/:id`, slug lookup, featured/category listings — all
  now require membership in that live set, regardless of the toggle. A vendor
  with no listings is never public.
- No `User.approvalStatus` filter is applied anywhere in the public controllers
  any more.

Because the vendor is approved together with the listing that makes it live (§5),
public category/featured queries start returning the vendor at exactly the same
moment its first listing goes live.

---

## 9. Test status (verified this session)

### Backend (`Evenlyo-BACKEND`, Jest + mongodb-memory-server)
Command: `npx jest tests/adminApproval --runInBand`
Result: **131 passed, 0 failed** (6 suites) — run with `--runInBand` for
stability (the in-memory mongod can flake under parallel workers).

Coverage for the listing-driven visibility rules:
- `vendorApproval.test.js` — vendor approve/reject endpoints return `404`; a
  vendor with no/only-pending listings is not live in the admin queue; approving
  the first listing makes it live; rejecting the only listing takes it off the
  site again; rejecting one of several listings keeps it live; a listing under
  live edit (`edited`) still keeps the vendor visible.
- `approvalNotifications.test.js` — the approval email fires only on the
  approval that makes the vendor go live; a rejection always emails the reason
  and states that the vendor is not visible yet when applicable; resubmit →
  approve brings the vendor back. Also covers `/vendor/all`,
  `/vendor/featured`, `/vendor/bycategory` and `/vendor/slug/:slugUrl` for
  vendors with no visible listing, suspended vendors, and live vendors.
- `resubmissionAfterRejection.test.js` — the full real-world lifecycle through
  the real controllers: first listing submitted `pending` → admin rejects with a
  bilingual reason → vendor edits it back to `pending` → admin approves →
  `approved` and the vendor goes live. Asserts the append-only history
  (`rejected → pending → approved`), the notification/email sequence, the admin
  detail payload, and the id contract described in §6.
- `listingApproval.test.js` — approve / reject / toggle-disabled behaviour.
- `listingLifecycle.test.js` — only `approved` listings are public; `edited`,
  `rejected` and `pending` are all hidden; editing a live listing takes it
  offline and it stays offline through rejection and resubmission until the edit
  is approved; the public payload carries no snapshot or pending-change fields;
  `homeData` exposes `vendor.businessName` as a display-name fallback for the
  frequently-empty `User.fullName`.
- `approvalSettings.test.js` — the vendor toggle is gone; `approvalSettingsHistory`
  is appended only on real value changes and is not exposed by GET.

Sandbox helper: `tests/adminApproval/helpers/db.js` pins a local
`mongod` binary (win32 8.2.6) via `systemBinary`.

### Frontend (`Evenlyo-Admin-Dashboard`, Vitest)
Command: `npx vitest run src/components/admin/approval src/test/adminApprovalService.test.js src/test/adminApprovalSlice.test.js`
Result: **57 passed, 0 failed** (7 files) — service contract, slice thunks,
tables/dialog/badge/settings, and `ReviewDrawer.test.jsx` which pins the
drawer's approve/reject callback contract (see §6). Note:
`RejectionDialog.test.jsx` can time out at 5000ms when run inside the full
suite — it passes reliably in isolation (typing the long reason string is slow
under parallel load).

---

## 10. Edge cases / known gaps

1. **`edited` listings are actionable in the admin UI.**
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
     The vendor itself stays visible throughout.

2. **`itemApprovalRequired: false` drops the listing approval filter.**
   All public listing queries drop the `approvalStatus: "approved"` filter, so
   legacy `pending`/`rejected`/`edited` rows in the database would be publicly
   visible. If unintended, client queries should always filter `approved`
   regardless of the toggle.

3. **`GET /api/notifications/admin-notifications` is unauthenticated**
   (no `requireAuth`). It only returns `notificationFor: "Admin"` (which are
   approval + booking notifications), but the endpoint itself is public.

4. **The legacy `User` approval fields are still in the schema** (`approvalStatus`,
   `approvalRejectionReason`, `submittedForReviewAt`, `reviewedAt`, `reviewedBy`).
   They are intentionally left in place (no data migration) but are no longer
   read or written by the approval flow. They can be dropped in a later
   cleanup once no dashboards read them.

5. **Listing edit of an already-`edited`/`pending` item does not re-notify**
   the admin (stays same state, `shouldNotifyAdmin` only true on transition
   into `edited` or `pending`-from-`rejected`). Admin already has the queued
   item, so this is by design.

6. **Approval email copies are Dutch-only**; the review email is limited to the
   first-listing submission path and the approval email to the go-live
   approval (reserved tone). Rejections are emailed every time, carrying the
   multilingual reason.

7. **Editing a live listing takes the listing offline, but not the vendor.**
   This is the intended rule (§8.1, §8.2), not a bug, but it is the main
   operational trade-off: from the moment a vendor saves an edit until an admin
   approves it, the *listing* 404s publicly and drops out of
   search/featured/popular, while the *vendor* remains discoverable. Consequences
   to be aware of:
   - A vendor editing one field (e.g. a typo in the description) loses the
     listing's traffic and search ranking for the whole review turnaround, but
     not the vendor's shop page.
   - Rejection and resubmission extend the outage; only approving the edit
     brings the listing back.
   - Rejected content is never published, which is the upside of the rule.
   - If that turnaround is too long in practice, the alternative is the
     previously-implemented approved-snapshot approach (serve the last approved
     content while the edit is pending), which trades strictness for uptime.

8. **`approvalHistory` keeps the rejection reason but not the old content.**
   Because a non-approved listing is hidden rather than served from a snapshot,
   there is no stored copy of the previously approved version. The live document
   always holds the most recent (possibly unapproved) edit.

9. **`getVendorProfile` (public) embedded listings** are fetched after the
   vendor already passed the live check, so the vendor's own listings are the
   ones that made it visible.

---

## 11. Related docs

- [listing-lifecycle.md](./listing-lifecycle.md)
- [vendor-onboarding.md](./vendor-onboarding.md)
- [admin-moderation.md](./admin-moderation.md)
- [05-audit-findings.md](../05-audit-findings.md)
- Admin dashboard audit: `Evenlyo-Admin-Dashboard/ADMIN_APPROVAL_AUDIT_REPORT.md`