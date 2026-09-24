const notificationController = require("../controllers/notificationController");
const AdminEmployee = require("../models/AdminEmployee");
const {
  sendVendorReviewEmail,
  sendVendorApprovalEmail,
} = require("./mailer");

// Central place for approval-flow notifications.
// Reuses the existing notification system (controllers/notificationController)
// and the existing mailer. Every function is fire-and-forget: failures are
// logged, never thrown, so approval operations are never blocked by
// notification/email errors.

const safeNotify = async (fn) => {
  try {
    return await fn();
  } catch (err) {
    console.error("❌ Approval notification failed:", err?.message || err);
    return null;
  }
};

const safeEmail = async (fn) => {
  try {
    return await fn();
  } catch (err) {
    console.error("❌ Approval email failed:", err?.message || err);
    return null;
  }
};

const getListingTitle = (listing, lang) => {
  if (!listing) return "";
  if (typeof listing.title === "string") return listing.title;
  return listing.title?.[lang] || listing.title?.en || "";
};

const getBusinessName = (vendorProfile) => {
  return (
    vendorProfile?.businessName ||
    vendorProfile?.localizedBusinessName?.en ||
    "Vendor"
  );
};

// Resolve active Admin employee emails for the review-request email.
// Failures return an empty list so the listing flow is never blocked and the
// mailer can fall back to the configured contact inbox.
const getReviewEmailRecipients = async () => {
  try {
    const admins = await AdminEmployee.find({
      role: "Admin",
      status: "active",
    })
      .select("email")
      .lean();
    return admins.map((admin) => admin.email).filter(Boolean);
  } catch (err) {
    console.error(
      "❌ Failed to resolve admin review email recipients:",
      err?.message || err,
    );
    return [];
  }
};

// Listing submitted for review -> notify admin(s).
// On the FIRST listing (with vendor review enabled) the Admin also gets a
// Dutch review-request email.
const notifyAdminListingSubmitted = async ({
  vendorUser,
  vendorProfile,
  listing,
  isFirstListing = false,
  vendorActivationRequired = false,
}) => {
  const businessName = getBusinessName(vendorProfile);

  await safeNotify(() =>
    notificationController.createNotification({
      title: {
        en: "New listing submitted for review",
        nl: "Nieuwe advertentie ingediend ter beoordeling",
      },
      message: {
        en: `${businessName} submitted a listing for review.`,
        nl: `${businessName} heeft een advertentie ingediend voor beoordeling.`,
      },
      notificationFor: "Admin",
      vendorId: vendorUser?._id || vendorUser?.id || null,
    }),
  );

  if (isFirstListing && vendorActivationRequired) {
    const recipients = await getReviewEmailRecipients();
    await safeEmail(() =>
      sendVendorReviewEmail({
        vendorUser,
        vendorProfile,
        listing,
        to: recipients.length ? recipients : undefined,
      }),
    );
  }
};

// Listing approved -> notify the vendor.
// When approving the FIRST listing activates the vendor account too, the
// vendor also gets the Dutch approval email. (Only once, at activation.)
const notifyVendorListingApproved = async ({
  vendorUser,
  vendorProfile,
  listing,
  vendorJustActivated = false,
}) => {
  const title = getListingTitle(listing, "en");

  await safeNotify(() =>
    notificationController.createNotification({
      title: {
        en: "Listing approved",
        nl: "Advertentie goedgekeurd",
      },
      message: {
        en: `Your listing "${title}" has been approved and is now live.`,
        nl: `Uw advertentie "${getListingTitle(listing, "nl")}" is goedgekeurd en is nu live.`,
      },
      notificationFor: "Vendor",
      vendorId: vendorUser?._id || vendorUser?.id || null,
    }),
  );

  if (vendorJustActivated) {
    await safeEmail(() =>
      sendVendorApprovalEmail({ vendorUser, vendorProfile, listing }),
    );
  }
};

// Listing rejected -> notify the vendor (includes the rejection reason).
const notifyVendorListingRejected = async ({
  vendorUser,
  vendorProfile,
  listing,
  reason,
}) => {
  const title = getListingTitle(listing, "en");
  const reasonEn =
    typeof reason === "string"
      ? reason
      : reason?.en || reason?.nl || "No reason provided";
  const reasonNl =
    typeof reason === "string"
      ? reason
      : reason?.nl || reason?.en || "Geen reden opgegeven";

  await safeNotify(() =>
    notificationController.createNotification({
      title: {
        en: "Listing rejected",
        nl: "Advertentie afgewezen",
      },
      message: {
        en: `Your listing "${title}" was rejected. Reason: ${reasonEn}`,
        nl: `Uw advertentie "${getListingTitle(listing, "nl")}" is afgewezen. Reden: ${reasonNl}`,
      },
      notificationFor: "Vendor",
      vendorId: vendorUser?._id || vendorUser?.id || null,
    }),
  );
};

// Vendor account approved manually by an admin -> notify the vendor.
const notifyVendorApproved = async ({ vendorUser, vendorProfile }) => {
  await safeNotify(() =>
    notificationController.createNotification({
      title: {
        en: "Vendor account approved",
        nl: "Leveranciersaccount goedgekeurd",
      },
      message: {
        en: "Your vendor account has been approved. You can now start selling.",
        nl: "Uw leveranciersaccount is goedgekeurd. U kunt nu beginnen met verkopen.",
      },
      notificationFor: "Vendor",
      vendorId: vendorUser?._id || vendorUser?.id || null,
    }),
  );
};

// Vendor account rejected by an admin -> notify the vendor (with reason).
const notifyVendorRejected = async ({ vendorUser, vendorProfile, reason }) => {
  const reasonEn =
    typeof reason === "string"
      ? reason
      : reason?.en || reason?.nl || "No reason provided";
  const reasonNl =
    typeof reason === "string"
      ? reason
      : reason?.nl || reason?.en || "Geen reden opgegeven";

  await safeNotify(() =>
    notificationController.createNotification({
      title: {
        en: "Vendor account rejected",
        nl: "Leveranciersaccount afgewezen",
      },
      message: {
        en: `Your vendor account was rejected. Reason: ${reasonEn}`,
        nl: `Uw leveranciersaccount is afgewezen. Reden: ${reasonNl}`,
      },
      notificationFor: "Vendor",
      vendorId: vendorUser?._id || vendorUser?.id || null,
    }),
  );
};

module.exports = {
  notifyAdminListingSubmitted,
  notifyVendorListingApproved,
  notifyVendorListingRejected,
  notifyVendorApproved,
  notifyVendorRejected,
};