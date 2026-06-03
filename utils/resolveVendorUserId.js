const User = require("../models/User");
const Vendor = require("../models/Vendor");

const toIdString = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value._id) return String(value._id);
  return String(value);
};

/**
 * Always returns the vendor business owner's User _id (for bookings, push, notifications).
 */
const resolveVendorOwnerUserId = async (candidateId) => {
  const id = toIdString(candidateId);
  if (!id) return null;

  const user = await User.findById(id).select("_id userType");
  if (user) {
    const ownedVendor = await Vendor.findOne({ userId: user._id }).select("userId");
    if (ownedVendor) return user._id;
    // Listing.vendor may already be the owner's User id
    return user._id;
  }

  const vendorProfile = await Vendor.findById(id).select("userId");
  if (vendorProfile?.userId) return vendorProfile.userId;

  return null;
};

/**
 * Returns the vendor's User _id from a listing (listing.vendor refs User, but legacy data may store Vendor profile id).
 */
const getVendorUserIdFromListing = async (listing) => {
  if (!listing?.vendor) return null;
  const raw = listing.vendor._id || listing.vendor;
  return resolveVendorOwnerUserId(raw);
};

/**
 * Resolves vendor id from request/socket to the vendor owner's User _id.
 * Listing owner always wins over client-provided vendorId.
 */
const resolveVendorUserId = async (vendorId, listing = null) => {
  const fromListing = await getVendorUserIdFromListing(listing);
  if (fromListing) return fromListing;
  return resolveVendorOwnerUserId(vendorId);
};

/**
 * All ids that should match Notification.vendorId for the logged-in vendor session.
 */
const getVendorNotificationRecipientIds = async (authUser) => {
  const ids = new Set();

  const add = (value) => {
    const s = toIdString(value);
    if (s) ids.add(s);
  };

  if (!authUser) return [];

  add(authUser.id);

  if (authUser.vendorId) {
    add(authUser.vendorId);
    const profile = await Vendor.findById(authUser.vendorId).select("userId _id");
    if (profile) {
      add(profile._id);
      add(profile.userId);
    }
  }

  const profileByUser = await Vendor.findOne({ userId: authUser.id }).select(
    "userId _id",
  );
  if (profileByUser) {
    add(profileByUser._id);
    add(profileByUser.userId);
  }

  const ownerUserId = await resolveVendorOwnerUserId(authUser.id);
  if (ownerUserId) add(ownerUserId);

  return Array.from(ids);
};

/**
 * User id to store FCM token for vendor app sessions (owner account, not employee doc).
 */
const resolveVendorFcmUserId = async (user, isEmployee) => {
  if (!user) return null;
  if (!isEmployee) return user._id;

  const vendorRef = user.vendor?._id || user.vendor;
  if (vendorRef) {
    const profile = await Vendor.findById(vendorRef).select("userId");
    if (profile?.userId) return profile.userId;
  }
  if (user.createdById) return user.createdById;

  return await resolveVendorOwnerUserId(user._id);
};

module.exports = {
  resolveVendorUserId,
  resolveVendorOwnerUserId,
  getVendorUserIdFromListing,
  getVendorNotificationRecipientIds,
  resolveVendorFcmUserId,
};
