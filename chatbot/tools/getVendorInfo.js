// chatbot/tools/getVendorInfo.js
const Vendor  = require("../../models/Vendor");
const Listing = require("../../models/Listing");

async function getVendorInfo({ vendor_name, vendor_id }, context) {
  let vendor = null;

  if (vendor_id) {
    vendor = await Vendor.findById(vendor_id)
      .populate("mainCategories", "name")
      .populate("subCategories",  "name")
      .lean();
  } else if (vendor_name) {
    vendor = await Vendor.findOne({
      businessName: { $regex: vendor_name, $options: "i" },
      isApproved:   true,
    })
      .populate("mainCategories", "name")
      .populate("subCategories",  "name")
      .lean();
  }

  if (!vendor) {
    return {
      found:   false,
      message: `No approved vendor found matching "${vendor_name || vendor_id}".`,
    };
  }

  const activeListingCount = await Listing.countDocuments({
    vendor:   vendor.userId,
    status:   "active",
    isActive: true,
  });

  const resolveName = (f) => f?.en || f?.nl || (typeof f === "string" ? f : null);

  return {
    found: true,
    vendor: {
      id:                vendor._id,
      businessName:      vendor.businessName,
      businessPhone:     vendor.businessPhone,
      location:          vendor.businessLocation,
      tagline:           resolveName(vendor.tagline),
      description:       resolveName(vendor.description),
      whyChooseUs:       resolveName(vendor.whyChooseUs),
      rating:            vendor.rating?.average,
      totalReviews:      vendor.rating?.totalReviews,
      ratingDisplay:     (vendor.rating?.totalReviews || 0) > 0
        ? `${vendor.rating.average}/5 (${vendor.rating.totalReviews} reviews)`
        : "No reviews yet",
      totalBookings:     vendor.totalBookings,
      completedBookings: vendor.completedBookings,
      mainCategories:    (vendor.mainCategories || []).map((c) => resolveName(c?.name) || c),
      subCategories:     (vendor.subCategories  || []).map((s) => resolveName(s?.name) || s),
      contactEnabled:    vendor.contactMeEnabled,
      activeListings:    activeListingCount,
    
    },
  };
}

module.exports = { getVendorInfo };