const Settings = require("../models/Settings");
const Listing = require("../models/Listing");

const DEFAULT_APPROVAL_SETTINGS = {
  itemApprovalRequired: true,
};

const getApprovalSettings = async () => {
  const settings = await Settings.findOne().select("approvalSettings").lean();

  if (!settings?.approvalSettings) {
    return { ...DEFAULT_APPROVAL_SETTINGS };
  }

  return {
    itemApprovalRequired:
      settings?.approvalSettings?.itemApprovalRequired ?? true,
  };
};

// A listing is publicly visible only while it is currently "approved".
//
// "edited" is deliberately NOT visible: a vendor editing a live listing takes
// it offline until that edit is approved, rather than serving the previously
// approved content. Rejecting the edit keeps it offline, and resubmitting keeps
// it offline until approved.
const isPubliclyVisibleListing = (approvalStatus) =>
  approvalStatus === "approved";

// Spread-ready query fragment for public listing reads.
// Returns {} when the item-approval toggle is off, because in that mode every
// listing is public regardless of approvalStatus.
const getPublicListingApprovalFilter = (approvalSettings) => {
  if (!approvalSettings?.itemApprovalRequired) {
    return {};
  }

  return { approvalStatus: "approved" };
};

// A vendor is "live" once it has at least one approved listing. There is no
// vendor approval toggle and no separate vendor approval state: visibility is
// derived entirely from the vendor's own listings.
//
// With the toggle OFF every listing is created "approved", so a vendor becomes
// live the moment it publishes its first listing. With the toggle ON the
// vendor stays hidden until an Admin approves one of them.
const VENDOR_VISIBLE_LISTING_STATES = ["approved", "edited"];

// Returns the ids of vendor users that are publicly visible, i.e. that have at
// least one listing in a visible state. Vendors with no listings at all are
// never visible.
//
// "edited" counts as visible for the VENDOR: a vendor that already went live
// must not disappear from the public site just because it is editing its
// current listing. The edited listing itself is still hidden.
const getLiveVendorUserIds = async () => {
  const listings = await Listing.distinct("vendor", {
    approvalStatus: { $in: VENDOR_VISIBLE_LISTING_STATES },
  });

  return listings.filter(Boolean);
};

module.exports = {
  getApprovalSettings,
  getPublicListingApprovalFilter,
  isPubliclyVisibleListing,
  getLiveVendorUserIds,
  VENDOR_VISIBLE_LISTING_STATES,
  DEFAULT_APPROVAL_SETTINGS,
};
