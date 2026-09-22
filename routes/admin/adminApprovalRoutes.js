const express = require('express');
const router = express.Router();
const {
  getAdminApprovalVendors,
  getAdminApprovalSettings,
  updateAdminApprovalSettings,
  rejectListing,
  approveListing,
  rejectVendor,
  approveVendor,
  getAdminApprovalVendorById,
  getAdminApprovalListings,
  getAdminApprovalListingById,
} = require("../../controllers/admin/adminApprovalController");
const { requireAdmin } = require("../../middleware/authMiddleware");

router.get("/approvals/vendors", requireAdmin, getAdminApprovalVendors);
router.get(
  "/approvals/vendors/:vendorId",
  requireAdmin,
  getAdminApprovalVendorById,
);

router.patch(
  "/approvals/vendors/:vendorId/approve",
  requireAdmin,
  approveVendor,
);

router.patch("/approvals/vendors/:vendorId/reject", requireAdmin, rejectVendor);


// =============================================
// LISTINGS
// =============================================

router.get("/approvals/listings", getAdminApprovalListings);

router.get("/approvals/listings/:listingId", getAdminApprovalListingById);
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