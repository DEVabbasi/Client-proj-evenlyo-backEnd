const notificationController = require("../controllers/notificationController");
const AdminEmployee = require("../models/AdminEmployee");
const {
  sendVendorReviewEmail,
  sendVendorApprovalEmail,
  sendVendorRejectionEmail,
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
// When item approval is on, the FIRST listing is what makes the vendor
// publicly visible, so the Admin also gets a Dutch review-request email for it.
const notifyAdminListingSubmitted = async ({
  vendorUser,
  vendorProfile,
  listing,
  isFirstListing = false,
  itemApprovalRequired = true,
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

  if (isFirstListing && itemApprovalRequired) {
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
// `vendorWentLive` is true when this approval gave the vendor its first
// approved listing, i.e. it is only now visible on the public site. That is the
// only moment the Dutch approval email is sent.
const notifyVendorListingApproved = async ({
  vendorUser,
  vendorProfile,
  listing,
  vendorWentLive = false,
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

  if (vendorWentLive) {
    await safeEmail(() =>
      sendVendorApprovalEmail({ vendorUser, vendorProfile, listing }),
    );
  }
};

// Listing rejected -> notify the vendor and email them the reason.
// `vendorWentOffLive` is true when this rejection leaves the vendor with no
// approved listing at all, so it drops off the public site. The email wording
// reflects that.
const notifyVendorListingRejected = async ({
  vendorUser,
  vendorProfile,
  listing,
  reason,
  vendorWentOffLive = false,
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
        en: vendorWentOffLive
          ? "Listing rejected - not visible on the site yet"
          : "Listing rejected",
        nl: vendorWentOffLive
          ? "Advertentie afgewezen - nog niet zichtbaar op de site"
          : "Advertentie afgewezen",
      },
      message: {
        en: vendorWentOffLive
          ? `Your listing "${title}" was rejected. You are not visible on the site until one of your listings is approved. Reason: ${reasonEn}`
          : `Your listing "${title}" was rejected. Reason: ${reasonEn}`,
        nl: vendorWentOffLive
          ? `Uw advertentie "${getListingTitle(listing, "nl")}" is afgewezen. U bent pas zichtbaar op de site zodra één van uw advertenties is goedgekeurd. Reden: ${reasonNl}`
          : `Uw advertentie "${getListingTitle(listing, "nl")}" is afgewezen. Reden: ${reasonNl}`,
      },
      notificationFor: "Vendor",
      vendorId: vendorUser?._id || vendorUser?.id || null,
    }),
  );

  await safeEmail(() =>
    sendVendorRejectionEmail({
      vendorUser,
      vendorProfile,
      listing,
      reason,
      vendorOnHold: vendorWentOffLive,
    }),
  );
};

module.exports = {
  notifyAdminListingSubmitted,
  notifyVendorListingApproved,
  notifyVendorListingRejected,
};
