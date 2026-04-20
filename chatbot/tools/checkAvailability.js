// chatbot/tools/checkAvailability.js
// ─────────────────────────────────────────────────────────────────────────────
// Fixes:
// 1. Fuzzy search — tries exact match first, then partial word match
//    so "Baloon Decoration" finds "Balloon Decoration"
// 2. Ratings fetched from Review model (same as getHomeData in listingController)
//    not from listing.rating which may be stale
// 3. No image field returned — GPT was rendering raw URLs as markdown images
// ─────────────────────────────────────────────────────────────────────────────

const Listing = require("../../models/Listing");
const Booking = require("../../models/Booking");
const Review  = require("../../models/Review");

async function checkListingAvailability({ listing_name, listing_id, date_from, date_to }, context) {
  let listing = null;

  // ── Step 1: Find listing with progressive fuzzy search ────────────────────
  if (listing_id) {
    listing = await Listing.findById(listing_id)
      .populate("category",    "name")
      .populate("subCategory", "name isUpfrontEnabled upfrontFeePercent escrowHours isEvenlyoProtectEnabled evenlyoProtectFeePercent")
      .lean();

  } else if (listing_name) {
    const name = listing_name.trim();

    // Attempt 1: exact phrase match (case-insensitive) on title.en or title.nl
    listing = await Listing.findOne({
      $or: [
        { "title.en": { $regex: name, $options: "i" } },
        { "title.nl": { $regex: name, $options: "i" } },
      ],
      status: "active", isActive: true,
    })
      .populate("category",    "name")
      .populate("subCategory", "name isUpfrontEnabled upfrontFeePercent escrowHours isEvenlyoProtectEnabled evenlyoProtectFeePercent")
      .lean();

    // Attempt 2: split words and match any significant word
    // Handles typos like "Baloon" → finds "Balloon"
    if (!listing) {
      const words = name.split(/\s+/).filter((w) => w.length > 3);
      for (const word of words) {
        listing = await Listing.findOne({
          $or: [
            { "title.en": { $regex: word, $options: "i" } },
            { "title.nl": { $regex: word, $options: "i" } },
          ],
          status: "active", isActive: true,
        })
          .populate("category",    "name")
          .populate("subCategory", "name isUpfrontEnabled upfrontFeePercent escrowHours isEvenlyoProtectEnabled evenlyoProtectFeePercent")
          .lean();
        if (listing) break;
      }
    }

    // Attempt 3: search any active listing that includes first word
    // Last resort broad match
    if (!listing) {
      const firstWord = name.split(/\s+/)[0];
      if (firstWord && firstWord.length > 2) {
        listing = await Listing.findOne({
          $or: [
            { "title.en": { $regex: firstWord, $options: "i" } },
            { "title.nl": { $regex: firstWord, $options: "i" } },
          ],
          status: "active", isActive: true,
        })
          .populate("category",    "name")
          .populate("subCategory", "name isUpfrontEnabled upfrontFeePercent escrowHours isEvenlyoProtectEnabled evenlyoProtectFeePercent")
          .lean();
      }
    }
  }

  if (!listing) {
    return {
      found:   false,
      message: `No active listing found matching "${listing_name || listing_id}". It may be inactive or listed under a slightly different name. Try searching by category instead.`,
    };
  }

  // ── Step 2: Fetch real ratings from Review model ──────────────────────────
  // Same pattern as getHomeData in listingController.js:
  //   Booking.find({ listingId }) → Review.find({ bookingId }) → avg
  let ratingAverage = 0;
  let totalReviews  = 0;

  try {
    const bookingsForListing = await Booking.find({ listingId: listing._id }).select("_id").lean();
    const bookingIds = bookingsForListing.map((b) => b._id);

    if (bookingIds.length > 0) {
      const reviews = await Review.find({ bookingId: { $in: bookingIds } }).select("rating").lean();
      if (reviews.length > 0) {
        const sum   = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
        ratingAverage = parseFloat((sum / reviews.length).toFixed(1));
        totalReviews  = reviews.length;
      }
    }
  } catch (e) {
    // Rating fetch failed — use fallback from listing
    ratingAverage = listing.rating?.average || 0;
    totalReviews  = listing.rating?.totalReviews || 0;
  }

  // ── Step 3: Day-of-week check ─────────────────────────────────────────────
  let dayAvailable     = true;
  let requestedDayName = null;
  if (date_from && listing.availability?.availableDays?.length > 0) {
    const DAY_MAP = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    requestedDayName = DAY_MAP[new Date(date_from).getDay()];
    dayAvailable     = listing.availability.availableDays.includes(requestedDayName);
  }

  // ── Step 4: Booking conflict check ────────────────────────────────────────
  let conflictCount   = 0;
  let conflictDetails = [];

  if (date_from) {
    const checkStart = new Date(date_from);
    checkStart.setHours(0, 0, 0, 0);
    const checkEnd = new Date(date_to || date_from);
    checkEnd.setHours(23, 59, 59, 999);

    const conflicts = await Booking.find({
      listingId: listing._id,
      status:    { $nin: ["rejected", "cancelled"] },
      $or: [{
        "details.startDate": { $lte: checkEnd },
        "details.endDate":   { $gte: checkStart },
      }],
    }).select("trackingId status details.startDate details.endDate").lean();

    conflictCount   = conflicts.length;
    conflictDetails = conflicts.map((b) => ({
      trackingId: b.trackingId,
      status:     b.status,
      bookedFrom: b.details?.startDate,
      bookedTo:   b.details?.endDate,
    }));
  }

  // ── Step 5: Final verdict ─────────────────────────────────────────────────
  const isAvailable =
    listing.isActive === true &&
    listing.status === "active" &&
    (listing.quantity || 0) > 0 &&
    dayAvailable &&
    conflictCount === 0;

  const resolveName = (f) => f?.en || f?.nl || (typeof f === "string" ? f : "");

  return {
    found: true,
    listing: {
      id:           listing._id,
      title:        listing.title?.en || listing.title?.nl,
      category:     resolveName(listing.category?.name),
      subCategory:  resolveName(listing.subCategory?.name),
      serviceType:  listing.serviceDetails?.serviceType,
      location:     listing.location?.userAddress,
      rating:       ratingAverage,
      totalReviews,
      ratingDisplay: totalReviews > 0
        ? `${ratingAverage}/5 (${totalReviews} review${totalReviews > 1 ? "s" : ""})`
        : "No reviews yet",
      inStock: (listing.quantity || 0) > 0,
      availableDays: listing.availability?.availableDays || [],
   
      pricing: listing.pricing ? {
        type:          listing.pricing.type,
        amount:        listing.pricing.amount,
        extratimeCost: listing.pricing.extratimeCost,
        pricePerKm:    listing.pricing.pricePerKm,
        securityFee:   listing.pricing.securityFee,
      } : null,
    },
    availability: {
      isAvailable,
      reasons: {
        listingActive: listing.isActive && listing.status === "active",
        inStock:       (listing.quantity || 0) > 0,
        dayAvailable,
        noConflicts:   conflictCount === 0,
        ...(requestedDayName && { requestedDay: requestedDayName }),
      },
      conflictingBookings: conflictCount,
      conflictDetails,
      checkedRange: date_from
        ? `${date_from}${date_to && date_to !== date_from ? " to " + date_to : ""}`
        : "general check — no specific date",
    },
    paymentPolicy: listing.subCategory ? {
      isUpfrontEnabled:         listing.subCategory.isUpfrontEnabled,
      upfrontFeePercent:        listing.subCategory.upfrontFeePercent,
      escrowHours:              listing.subCategory.escrowHours,
      isEvenlyoProtectEnabled:  listing.subCategory.isEvenlyoProtectEnabled,
      evenlyoProtectFeePercent: listing.subCategory.evenlyoProtectFeePercent,
    } : null,
  };
}

module.exports = { checkListingAvailability };