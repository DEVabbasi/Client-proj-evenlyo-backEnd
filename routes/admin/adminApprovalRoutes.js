const express = require('express');
const router = express.Router();
const {
  getAdminApprovalVendors,
  getAdminApprovalSettings,
  updateAdminApprovalSettings,
  rejectListing,
  approveListing,
  getAdminApprovalVendorById,
  getAdminApprovalListings,
  getAdminApprovalListingById,
} = require("../../controllers/admin/adminApprovalController");
const { requireAdmin } = require("../../middleware/authMiddleware");

// Vendor accounts have no separate approve/reject endpoints: the vendor
// review status is driven by the vendor's first listing.
router.get("/approvals/vendors", requireAdmin, getAdminApprovalVendors);
router.get(
  "/approvals/vendors/:vendorId",
  requireAdmin,
  getAdminApprovalVendorById,
);


// =============================================
// LISTINGS
// =============================================

router.get("/approvals/listings", requireAdmin, getAdminApprovalListings);

router.get("/approvals/listings/:listingId", requireAdmin, getAdminApprovalListingById);
router.patch(
  "/approvals/listings/:listingId/approve",
  requireAdmin,
  approveListing,
);

router.patch(
  "/approvals/listings/:listingId/reject",
  requireAdmin,
  rejectListing,
);

router.get("/approvals/settings", requireAdmin, getAdminApprovalSettings);

router.patch("/approvals/settings", requireAdmin, updateAdminApprovalSettings);


module.exports = router;