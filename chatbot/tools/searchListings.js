// chatbot/tools/searchListings.js
// ─────────────────────────────────────────────────────────────────────────────
// Fixes:
// 1. Ratings fetched from Review model (same pipeline as getHomeData)
// 2. No image field in output — prevents GPT from rendering raw URLs
// 3. ratingDisplay field added for clean presentation
// ─────────────────────────────────────────────────────────────────────────────

const Listing     = require("../../models/Listing");
const Booking     = require("../../models/Booking");
const Review      = require("../../models/Review");
const Category    = require("../../models/Category");
const SubCategory = require("../../models/SubCategory");

async function searchListings({ category_name, subcategory_name, location, date, limit = 5 }, context) {
  const query = { status: "active", isActive: true };

  // ── Category filter ───────────────────────────────────────────────────────
  if (category_name) {
    const cat = await Category.findOne({
      $or: [
        { "name.en": { $regex: category_name, $options: "i" } },
        { "name.nl": { $regex: category_name, $options: "i" } },
        { name:      { $regex: category_name, $options: "i" } },
      ],
    }).lean();
    if (cat) query.category = cat._id;
  }

  // ── Subcategory filter ────────────────────────────────────────────────────
  if (subcategory_name) {
    const sub = await SubCategory.findOne({
      $or: [
        { "name.en": { $regex: subcategory_name, $options: "i" } },
        { "name.nl": { $regex: subcategory_name, $options: "i" } },
      ],
      isActive: true,
    }).lean();
    if (sub) query.subCategory = sub._id;
  }

  // ── Location filter: location.userAddress ─────────────────────────────────
  if (location) {
    query["location.userAddress"] = { $regex: location, $options: "i" };
  }

  // ── Day-of-week filter (same as getHomeData) ──────────────────────────────
  if (date) {
    const DAY_MAP = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const dayKey  = DAY_MAP[new Date(date).getDay()];
    query["availability.availableDays"] = dayKey;
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 8);

  const listings = await Listing.find(query)
    .populate("category",    "name")
    .populate("subCategory", "name icon")
    .sort({ "rating.average": -1, "bookings.completed": -1, sortOrder: -1 })
    .limit(safeLimit)
    .lean();

  if (!listings.length) {
    return {
      found:   false,
      count:   0,
      message: [
        "No active listings found",
        subcategory_name ? ` for "${subcategory_name}"` : (category_name ? ` in category "${category_name}"` : ""),
        location ? ` in ${location}` : "",
        date    ? ` available on ${date}` : "",
        ".",
      ].join(""),
      listings: [],
    };
  }

  // ── Fetch real ratings from Review model for all listings ─────────────────
  // Same pipeline as getHomeData in listingController.js:
  //   listings → Booking.find({ listingId in list }) → Review.find({ bookingId in list })
  const listingIds = listings.map((l) => l._id);

  let ratingMap = {};
  try {
    const bookings = await Booking.find({ listingId: { $in: listingIds } })
      .select("_id listingId")
      .lean();

    const bookingIds = bookings.map((b) => b._id);
    const bookingToListing = {};
    bookings.forEach((b) => { bookingToListing[b._id.toString()] = b.listingId?.toString(); });

    const reviews = await Review.find({ bookingId: { $in: bookingIds } })
      .select("bookingId rating")
      .lean();

    reviews.forEach((r) => {
      const lid = bookingToListing[r.bookingId?.toString()];
      if (!lid) return;
      if (!ratingMap[lid]) ratingMap[lid] = { total: 0, count: 0 };
      ratingMap[lid].total += r.rating || 0;
      ratingMap[lid].count += 1;
    });
  } catch (e) {
    // Rating pipeline failed — fallback to listing.rating
    listings.forEach((l) => {
      if (l.rating?.average && l.rating?.totalReviews) {
        ratingMap[l._id.toString()] = {
          total: l.rating.average * l.rating.totalReviews,
          count: l.rating.totalReviews,
        };
      }
    });
  }

  const resolveName = (f) => f?.en || f?.nl || (typeof f === "string" ? f : "");

  return {
    found: true,
    count: listings.length,
    filters: {
      category:    category_name    || null,
      subcategory: subcategory_name || null,
      location:    location         || null,
      date:        date             || null,
    },
    listings: listings.map((l) => {
      const lid  = l._id.toString();
      const info = ratingMap[lid];
      const avg  = info && info.count > 0
        ? parseFloat((info.total / info.count).toFixed(1))
        : 0;
      const count = info?.count || 0;

      return {
        id:          l._id,
        title:       l.title?.en || l.title?.nl,
        subtitle:    l.subtitle?.en || l.subtitle?.nl || null,
        category:    resolveName(l.category?.name),
        subCategory: resolveName(l.subCategory?.name),
        serviceType: l.serviceDetails?.serviceType,
        location:    l.location?.userAddress || null,

        // Clean rating fields — NO raw 0 values
        rating:        avg,
        totalReviews:  count,
        ratingDisplay: count > 0
          ? `${avg}/5 (${count} review${count > 1 ? "s" : ""})`
          : "No reviews yet",

        inStock:      (l.quantity || 0) > 0,
        popular:      l.popular || false,
        availableDays: l.availability?.availableDays || [],


        pricing: l.pricing ? {
          type:       l.pricing.type,
          amount:     l.pricing.amount,
          pricePerKm: l.pricing.pricePerKm,
        } : null,
      };
    }),
  };
}

module.exports = { searchListings };