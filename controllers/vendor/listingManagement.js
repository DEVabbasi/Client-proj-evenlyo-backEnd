const Listing = require("../../models/Listing");
const SaleItem = require("../../models/Item");
const StockLog = require("../../models/StockLog");
const Booking = require("../../models/Booking");
const Review = require("../../models/Review");
const Settings = require("../../models/Settings");
const { toMultilingualText } = require("../../utils/textUtils");
const { createActivityLog } = require("../../utils/activityLogger");
const { resolveVendorOwnerUserId } = require("../../utils/resolveVendorUserId");
const mongoose = require("mongoose");
const { getApprovalSettings } = require("../../utils/getApprovalSettings");
const Vendor = require("../../models/Vendor");
const User = require("../../models/User");


const filterByCategory = async (req, res) => {
  console.log(req.user, "USSSSS");

  const vendorId = req.user?.id;

  try {
    const { category, subCategory } = req.query;

    let query = {};

    // add filters only if they exist
    if (category) query.category = category;
    if (subCategory) query.subCategory = subCategory;

    // 🔥 add vendorId only if present
    if (vendorId) query.vendor = vendorId;

    console.log(query, "vendorvendorvendor");

    const results = await Listing.find(query)
      .populate("subCategory")
      .lean();

    const settings = await Settings.findOne().lean();

    if (!results || results.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No results found",
        settings: settings || null,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Results fetched successfully",
      data: results,
      settings: settings || null,
    });

  } catch (error) {
    console.error("Filter Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const toggleListingStatus = async (req, res) => {
  try {
    const vendorId = req.user?.id;
    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "Vendor not found in request.",
      });
    }

    // Find the listing and ensure it belongs to the vendor
    const listing = await Listing.findOne({
      _id: req.params.id,
      vendor: vendorId,
    });
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found or not authorized",
      });
    }

    // Toggle the status (active/inactive)
    listing.status = listing.status === "active" ? "inactive" : "active";
    listing.isActive = listing.status === "active";
    await listing.save();

    res.json({
      success: true,
      message: {
        en: `Listing status updated to ${listing.status}`,
        nl: `Status van de listing bijgewerkt naar ${listing.status}`
      },
      status: listing.status,
      isActive: listing.isActive,
    });
  } catch (err) {
    console.error("Toggle listing status error:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

// GET /api/vendor/listings/overview
// const mongoose = require("mongoose");
// const Listing = require("../models/Listing");
// const Booking = require("../models/Booking");
// const Review = require("../models/Review");

const getVendorListingsOverview = async (req, res) => {
  try {
    const vendorId = req.user?.id;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "Vendor not found in request.",
      });
    }

    // ===============================
    // 📦 GET LISTINGS
    // ===============================
    const listings = await Listing.find({ vendor: vendorId })
      .populate("category", "name")
      .populate("subCategory", "name")
      .sort({ createdAt: -1 });

    const listingIds = listings.map((l) => l._id);

    // ===============================
    // 📊 CATEGORY STATS
    // ===============================
    const mainCategorySet = new Set();
    const subCategorySet = new Set();

    listings.forEach((listing) => {
      if (listing.category) {
        mainCategorySet.add(listing.category._id.toString());
      }
      if (listing.subCategory) {
        subCategorySet.add(listing.subCategory._id.toString());
      }
    });

    const totalListings = listings.length;

    // ===============================
    // 📈 BOOKING STATS
    // ===============================
    const bookings = await Booking.aggregate([
      {
        $match: {
          vendorId: new mongoose.Types.ObjectId(vendorId),
        },
      },
      {
        $group: {
          _id: "$listingId",
          count: { $sum: 1 },
        },
      },
    ]);

    const bookingCountMap = {};
    bookings.forEach((b) => {
      bookingCountMap[b._id.toString()] = b.count;
    });

    // ===============================
    // ⭐ REVIEW STATS (PER LISTING)
    // ===============================
    const reviewData = await Review.aggregate([
      {
        $match: {
          bookingId: { $exists: true },
        },
      },
      {
        $lookup: {
          from: "bookingrequests",
          localField: "bookingId",
          foreignField: "_id",
          as: "booking",
        },
      },
      { $unwind: "$booking" },

      // OPTIONAL FILTERS
      // {
      //   $match: {
      //     "booking.vendorId": new mongoose.Types.ObjectId(vendorId),
      //     "booking.listingId": { $in: listingIds },
      //   },
      // },

      {
        $group: {
          _id: "$booking.listingId",

          avgRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
          totalRating: { $sum: "$rating" },

          // 🔥 ALL REVIEWS
          allReviews: {
            $push: {
              review: "$review",
              rating: "$rating",
              userId: "$userId",
              bookingId: "$bookingId",
              createdAt: "$createdAt",
            },
          },
        },
      },
    ]);

    console.log(reviewData, vendorId, "reviewDatareviewDatareviewData");

    const reviewMap = {};
    let overallReviews = 0;
    let overallRatingSum = 0;

    reviewData.forEach((r) => {
      reviewMap[r._id.toString()] = r;
      overallReviews += r.totalReviews;
      overallRatingSum += r.totalRating;
      allReviews: r.allReviews
    });

    const overallAvgRating =
      overallReviews > 0 ? overallRatingSum / overallReviews : 0;

    // ===============================
    // 📊 LISTING OVERVIEW
    // ===============================
    const listingOverview = listings.map((listing) => {
      const review = reviewMap[listing._id.toString()] || {};

      return {
        listingId: listing._id,
        title: listing.title?.en || listing.title,
        bookedCount: bookingCountMap[listing._id.toString()] || 0,

        // ⭐ REVIEW DATA
        avgRating: review.avgRating || 0,
        totalReviews: review.totalReviews || 0,
        allReviews: review.allReviews || 0,
      };
    });

    // ===============================
    // 📋 LISTING TABLE
    // ===============================
    const listingTable = listings.map((listing) => {
      const review = reviewMap[listing._id.toString()] || {};

      return {
        ...listing.toObject(),
        listingId: listing._id,
        image: listing.images?.[0] || "",
        category: listing.category || "",
        subCategory: listing.subCategory || "",
        date: listing.createdAt,
        status: listing.status,

        // ⭐ REVIEW DATA
        avgRating: review.avgRating || 0,
        totalReviews: review.totalReviews || 0,
        allReviews: review.allReviews || 0,
      };
    });

    // ===============================
    // 📦 TOP BOOKED ITEMS
    // ===============================
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    );

    const endOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      1
    );

    const topBookedItems = await Booking.aggregate([
      {
        $match: {
          vendorId: new mongoose.Types.ObjectId(vendorId),
          status: "completed",
          createdAt: {
            $gte: startOfMonth,
            $lt: endOfMonth,
          },
        },
      },
      {
        $group: {
          _id: "$listingId",
          totalBookings: { $sum: 1 },
        },
      },
      { $sort: { totalBookings: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "listings",
          localField: "_id",
          foreignField: "_id",
          as: "listing",
        },
      },
      { $unwind: "$listing" },
      {
        $project: {
          _id: 0,
          listingId: "$_id",
          totalBookings: 1,
          title: "$listing.title",
          image: "$listing.image",
          price: "$listing.price",
        },
      },
    ]);

    // ===============================
    // ✅ RESPONSE
    // ===============================
    return res.json({
      success: true,
      stats: {
        totalMainCategories: mainCategorySet.size,
        totalSubCategories: subCategorySet.size,
        totalListings,

        // ⭐ GLOBAL REVIEW STATS
        totalReviews: overallReviews,
        avgRating: overallAvgRating,
      },
      listingOverview,
      listingTable,
      topBookedItems,
    });
  } catch (err) {
    console.error("Vendor listing overview error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// module.exports = { getVendorListingsOverview };

// @desc    Create a new listing
// @route   POST /api/listings
// @access  Private (Vendor only)
const createListing = async (req, res) => {
  try {
    const data = { ...req.body };

    // -----------------------------------------
    // 1. Validate authenticated user
    // -----------------------------------------
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: {
          en: "Authentication required.",
          nl: "Authenticatie vereist.",
        },
      });
    }

    // -----------------------------------------
    // 2. Resolve actual vendor owner User ID
    // -----------------------------------------
    const ownerUserId = await resolveVendorOwnerUserId(
      req.user.vendorId || req.user.id,
    );

    if (!ownerUserId) {
      return res.status(404).json({
        success: false,
        message: {
          en: "Vendor account not found.",
          nl: "Leveranciersaccount niet gevonden.",
        },
      });
    }

    // -----------------------------------------
    // 3. Get vendor profile
    // -----------------------------------------
    const vendor = await Vendor.findOne({
      userId: ownerUserId,
    })
      .select("mainCategories subCategories")
      .lean();

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: {
          en: "Vendor profile not found.",
          nl: "Leveranciersprofiel niet gevonden.",
        },
      });
    }

    // -----------------------------------------
    // 4. Vendor must have selected categories
    // -----------------------------------------
    const hasCategories =
      Array.isArray(vendor.mainCategories) &&
      vendor.mainCategories.length > 0 &&
      Array.isArray(vendor.subCategories) &&
      vendor.subCategories.length > 0;

    if (!hasCategories) {
      return res.status(400).json({
        success: false,
        code: "CATEGORIES_REQUIRED",
        message: {
          en: "Please select a main category and subcategory before creating a listing.",
          nl: "Selecteer een hoofdcategorie en subcategorie voordat u een advertentie aanmaakt.",
        },
      });
    }

    // -----------------------------------------
    // 5. Listing category + subcategory required
    // -----------------------------------------
    if (!data.category || !data.subCategory) {
      return res.status(400).json({
        success: false,
        code: "LISTING_CATEGORY_REQUIRED",
        message: {
          en: "A category and subcategory are required for the listing.",
          nl: "Een categorie en subcategorie zijn vereist voor de advertentie.",
        },
      });
    }

    // -----------------------------------------
    // 6. Validate multilingual title
    // -----------------------------------------
    if (!data.title || !data.title.en?.trim() || !data.title.nl?.trim()) {
      return res.status(400).json({
        success: false,
        message: {
          en: "Title in both English and Dutch is required.",
          nl: "Een titel in zowel het Engels als het Nederlands is vereist.",
        },
      });
    }

    // -----------------------------------------
    // 7. Validate multilingual description
    // -----------------------------------------
    if (
      !data.description ||
      !data.description.en?.trim() ||
      !data.description.nl?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: {
          en: "Description in both English and Dutch is required.",
          nl: "Een beschrijving in zowel het Engels als het Nederlands is vereist.",
        },
      });
    }

    // -----------------------------------------
    // 8. Validate subtitle only if provided
    // -----------------------------------------
    if (data.subtitle) {
      if (!data.subtitle.en?.trim() || !data.subtitle.nl?.trim()) {
        return res.status(400).json({
          success: false,
          message: {
            en: "Subtitle must be provided in both English and Dutch.",
            nl: "De ondertitel moet zowel in het Engels als in het Nederlands worden opgegeven.",
          },
        });
      }
    }

    // -----------------------------------------
    // 9. Load the 2 approval settings
    // -----------------------------------------
    const approvalSettings = await getApprovalSettings();
    console.log("APPROVAL SETTINGS:", approvalSettings);

    const { vendorActivationRequired, itemApprovalRequired } = approvalSettings;

    // -----------------------------------------
    // 10. Check whether this is first listing
    // BEFORE creating it
    // -----------------------------------------
    const existingListingCount = await Listing.countDocuments({
      vendor: ownerUserId,
    });

    const isFirstListing = existingListingCount === 0;

    // -----------------------------------------
    // 11. Protect system/admin-controlled fields
    // Never trust these from vendor frontend
    // -----------------------------------------
    delete data.vendor;

    delete data.approvalStatus;
    delete data.rejectionReason;
    delete data.reviewedAt;
    delete data.reviewedBy;
    delete data.submittedForReviewAt;
    delete data.approvalHistory;

    // -----------------------------------------
    // 12. Backend owns vendor field
    // -----------------------------------------
    data.vendor = ownerUserId;

    const now = new Date();

    // -----------------------------------------
    // 13. Determine LISTING approval
    //
    // Toggle ON  -> pending
    // Toggle OFF -> approved
    // -----------------------------------------
    if (itemApprovalRequired) {
      data.approvalStatus = "pending";
      data.submittedForReviewAt = now;
    } else {
      data.approvalStatus = "approved";
      data.submittedForReviewAt = null;
    }

    // -----------------------------------------
    // 14. Create listing
    // -----------------------------------------
    const listing = new Listing(data);

    await listing.save();

    // -----------------------------------------
    // 15. First listing triggers VENDOR review
    // -----------------------------------------
    if (isFirstListing) {
      const vendorUser = await User.findOne({
        _id: ownerUserId,
        userType: "vendor",
      });

      if (!vendorUser) {
        // Listing exists, so don't pretend the whole
        // request completely failed.
        // Return result explaining what happened.
        return res.status(201).json({
          success: true,
          code: "LISTING_CREATED_VENDOR_REVIEW_NOT_UPDATED",
          message: {
            en: "Listing was created, but the vendor approval status could not be updated.",
            nl: "De advertentie is aangemaakt, maar de goedkeuringsstatus van de leverancier kon niet worden bijgewerkt.",
          },
          data: {
            listing,
          },
        });
      }

      // ---------------------------------------
      // Vendor approval required
      // ---------------------------------------
      if (vendorActivationRequired) {
        vendorUser.approvalStatus = "pending";

        vendorUser.submittedForReviewAt = now;

        vendorUser.approvalRejectionReason = {
          en: "",
          nl: "",
        };

        // Clear previous review metadata
        vendorUser.reviewedAt = null;
        vendorUser.reviewedBy = null;
      }

      // ---------------------------------------
      // Vendor approval NOT required
      // ---------------------------------------
      else {
        vendorUser.approvalStatus = "approved";

        vendorUser.approvalRejectionReason = {
          en: "",
          nl: "",
        };

        vendorUser.submittedForReviewAt = now;

        // System approved — not an Admin review
        vendorUser.reviewedAt = null;
        vendorUser.reviewedBy = null;
      }

      await vendorUser.save();
    }

    // -----------------------------------------
    // 16. Populate listing
    // -----------------------------------------
    const populated = await Listing.findById(listing._id)
      .populate("vendor", "_id email contactNumber accountType approvalStatus")
      .populate("category", "name icon description")
      .populate("subCategory", "name icon description");

    // -----------------------------------------
    // 17. Result-based response
    // -----------------------------------------
    return res.status(201).json({
      success: true,

      message: {
        en: itemApprovalRequired
          ? "Listing created successfully and submitted for review."
          : "Listing created successfully.",
        nl: itemApprovalRequired
          ? "Advertentie succesvol aangemaakt en ter beoordeling ingediend."
          : "Advertentie succesvol aangemaakt.",
      },

      data: {
        listing: populated,

        approval: {
          isFirstListing,

          listing: {
            approvalRequired: itemApprovalRequired,

            status: populated.approvalStatus,
          },

          vendor: {
            approvalRequired: vendorActivationRequired,

            reviewTriggered: isFirstListing,
          },
        },
      },
    });
  } catch (error) {
    console.error("Error creating listing:", error);

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);

      return res.status(400).json({
        success: false,
        message: {
          en: "Listing validation failed.",
          nl: "Validatie van de advertentie is mislukt.",
        },
        errors,
      });
    }

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: {
          en: "Invalid category or subcategory.",
          nl: "Ongeldige categorie of subcategorie.",
        },
      });
    }

    return res.status(500).json({
      success: false,
      message: {
        en: "An unexpected error occurred while creating the listing.",
        nl: "Er is een onverwachte fout opgetreden bij het aanmaken van de advertentie.",
      },
      error: error.message,
    });
  }
};

// ...existing code...

// @desc    Update an existing listing
// @route   PUT /api/listings/:id
// @access  Private (Vendor only)

const updateListing = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // -----------------------------------------
    // 1. Validate authenticated user
    // -----------------------------------------
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: {
          en: "Authentication required.",
          nl: "Authenticatie vereist.",
        },
      });
    }

    // -----------------------------------------
    // 2. Find existing listing
    // -----------------------------------------
    const existingListing = await Listing.findById(id);

    if (!existingListing) {
      return res.status(404).json({
        success: false,
        message: {
          en: "Listing not found.",
          nl: "Advertentie niet gevonden.",
        },
      });
    }

    // -----------------------------------------
    // 3. Resolve vendor owner
    // -----------------------------------------
    const ownerUserId = await resolveVendorOwnerUserId(
      req.user.vendorId || req.user.id,
    );

    if (!ownerUserId) {
      return res.status(404).json({
        success: false,
        message: {
          en: "Vendor account not found.",
          nl: "Leveranciersaccount niet gevonden.",
        },
      });
    }

    // -----------------------------------------
    // 4. Verify listing ownership
    // -----------------------------------------
    if (existingListing.vendor.toString() !== ownerUserId.toString()) {
      return res.status(403).json({
        success: false,
        message: {
          en: "You are not allowed to update this listing.",
          nl: "U mag deze advertentie niet bijwerken.",
        },
      });
    }

    // -----------------------------------------
    // 5. Protect system-controlled fields
    // -----------------------------------------
    delete updateData.vendor;
    delete updateData.approvalStatus;
    delete updateData.approvalHistory;
    delete updateData.rejectionReason;
    delete updateData.reviewedBy;
    delete updateData.reviewedAt;
    delete updateData.submittedForReviewAt;

    // -----------------------------------------
    // 6. Validate title if updated
    // -----------------------------------------
    if (updateData.title !== undefined) {
      if (
        !updateData.title ||
        (typeof updateData.title === "string" && !updateData.title.trim())
      ) {
        return res.status(400).json({
          success: false,
          message: {
            en: "Title cannot be empty.",
            nl: "De titel mag niet leeg zijn.",
          },
        });
      }

      updateData.title = toMultilingualText(updateData.title);
    }

    // -----------------------------------------
    // 7. Validate description if updated
    // -----------------------------------------
    if (updateData.description !== undefined) {
      if (
        !updateData.description ||
        (typeof updateData.description === "string" &&
          !updateData.description.trim())
      ) {
        return res.status(400).json({
          success: false,
          message: {
            en: "Description cannot be empty.",
            nl: "De beschrijving mag niet leeg zijn.",
          },
        });
      }

      updateData.description = toMultilingualText(updateData.description);
    }

    // -----------------------------------------
    // 8. Convert subtitle
    // -----------------------------------------
    if (updateData.subtitle) {
      updateData.subtitle = toMultilingualText(updateData.subtitle);
    }

    // -----------------------------------------
    // 9. Handle images
    // -----------------------------------------
    if (Array.isArray(updateData.images)) {
      updateData.images = updateData.images.filter(
        (img) => typeof img === "string" && img.trim().length > 0,
      );
    } else if (updateData.images && typeof updateData.images === "string") {
      updateData.images = [updateData.images];
    }

    // Fallback to media.gallery
    if (
      (!updateData.images || updateData.images.length === 0) &&
      updateData.media &&
      Array.isArray(updateData.media.gallery)
    ) {
      updateData.images = updateData.media.gallery.filter(
        (img) => typeof img === "string" && img.trim().length > 0,
      );
    }

    // -----------------------------------------
    // 10. Handle location coordinates
    // -----------------------------------------
    if (updateData.location && updateData.location.coordinates) {
      const coords = updateData.location.coordinates;

      let latitude =
        coords.latitude !== undefined ? coords.latitude : coords.lat;

      let longitude =
        coords.longitude !== undefined ? coords.longitude : coords.lng;

      if (latitude !== undefined) {
        latitude = parseFloat(latitude);

        if (Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
          return res.status(400).json({
            success: false,
            message: {
              en: "Latitude must be between -90 and 90.",
              nl: "De breedtegraad moet tussen -90 en 90 liggen.",
            },
          });
        }
      }

      if (longitude !== undefined) {
        longitude = parseFloat(longitude);

        if (Number.isNaN(longitude) || longitude < -180 || longitude > 180) {
          return res.status(400).json({
            success: false,
            message: {
              en: "Longitude must be between -180 and 180.",
              nl: "De lengtegraad moet tussen -180 en 180 liggen.",
            },
          });
        }
      }

      if (latitude !== undefined && longitude !== undefined) {
        updateData.location.coordinates = {
          latitude,
          longitude,
        };
      }
    }

    // -----------------------------------------
    // 11. Merge pricing updates
    // -----------------------------------------
    if (updateData.pricing) {
      const {
        type,
        amount,
        extratimeCost,
        securityFee,
        pricePerKm,
        escrowFee,
      } = updateData.pricing;

      const existingPricing = existingListing.pricing || {};

      updateData.pricing = {
        type: type !== undefined ? type : existingPricing.type,

        amount: amount !== undefined ? amount : existingPricing.amount,

        extratimeCost:
          extratimeCost !== undefined
            ? extratimeCost === ""
              ? 0
              : extratimeCost
            : existingPricing.extratimeCost,

        securityFee:
          securityFee !== undefined ? securityFee : existingPricing.securityFee,

        pricePerKm:
          pricePerKm !== undefined ? pricePerKm : existingPricing.pricePerKm,

        escrowFee:
          escrowFee !== undefined ? escrowFee : existingPricing.escrowFee,
      };

      if (!updateData.pricing.type || updateData.pricing.amount === undefined) {
        return res.status(400).json({
          success: false,
          message: {
            en: "Pricing type and amount are required.",
            nl: "Prijstype en bedrag zijn vereist.",
          },
        });
      }

      const finalAmount = Number(updateData.pricing.amount) || 0;

      const finalExtratimeCost = Number(updateData.pricing.extratimeCost) || 0;

      const finalSecurityFee = Number(updateData.pricing.securityFee) || 0;

      const finalEscrowFee = Number(updateData.pricing.escrowFee) || 0;

      updateData.pricing.totalPrice =
        finalAmount + finalExtratimeCost + finalSecurityFee + finalEscrowFee;
    }

    // -----------------------------------------
    // 12. Get approval settings
    // -----------------------------------------
    const approvalSettings = await getApprovalSettings();

    const now = new Date();

    const previousApprovalStatus = existingListing.approvalStatus || "pending";

    let nextApprovalStatus = previousApprovalStatus;

    // -----------------------------------------
    // 13. Determine next approval status
    // -----------------------------------------

    // Approval system disabled
    if (!approvalSettings.itemApprovalRequired) {
      nextApprovalStatus = "approved";
    }

    // Rejected listing edited/resubmitted
    else if (previousApprovalStatus === "rejected") {
      nextApprovalStatus = "pending";

      updateData.rejectionReason = "";
      updateData.submittedForReviewAt = now;
      updateData.reviewedAt = null;
      updateData.reviewedBy = null;
    }

    // Approved/live listing edited
    else if (
      previousApprovalStatus === "approved" &&
      approvalSettings.editReapprovalRequired
    ) {
      nextApprovalStatus = "edited";

      updateData.submittedForReviewAt = now;
      updateData.reviewedAt = null;
      updateData.reviewedBy = null;
    }

    // Approved listing + reapproval disabled
    else if (
      previousApprovalStatus === "approved" &&
      !approvalSettings.editReapprovalRequired
    ) {
      nextApprovalStatus = "approved";
    }

    // Already waiting for review
    else if (previousApprovalStatus === "pending") {
      nextApprovalStatus = "pending";
    }

    // Already edited and waiting for review
    else if (previousApprovalStatus === "edited") {
      nextApprovalStatus = "edited";
    }

    // -----------------------------------------
    // 14. Set system-controlled approval status
    // -----------------------------------------
    updateData.approvalStatus = nextApprovalStatus;

    const approvalStatusChanged = previousApprovalStatus !== nextApprovalStatus;

    // -----------------------------------------
    // 15. Build MongoDB update operation
    // -----------------------------------------
    const updateOperation = {
      $set: updateData,
    };

    // Only add history when approval state changes
    if (approvalStatusChanged) {
      updateOperation.$push = {
        approvalHistory: {
          status: nextApprovalStatus,
          changedBy: ownerUserId,
          reason: "",
          changedAt: now,
        },
      };
    }

    // -----------------------------------------
    // 16. Update listing
    // -----------------------------------------
    const updatedListing = await Listing.findByIdAndUpdate(
      id,
      updateOperation,
      {
        new: true,
        runValidators: true,
      },
    )
      .populate(
        "vendor",
        "_id email contactNumber firstName lastName accountType",
      )
      .populate("category", "name icon description")
      .populate("subCategory", "name icon description");

    // -----------------------------------------
    // 17. Dynamic response message
    // -----------------------------------------
    let message = {
      en: "Listing updated successfully.",
      nl: "Advertentie succesvol bijgewerkt.",
    };

    if (nextApprovalStatus === "edited" && approvalStatusChanged) {
      message = {
        en: "Listing updated successfully and submitted for admin review.",
        nl: "Advertentie succesvol bijgewerkt en ingediend voor beoordeling door de beheerder.",
      };
    }

    if (
      previousApprovalStatus === "rejected" &&
      nextApprovalStatus === "pending"
    ) {
      message = {
        en: "Listing updated and resubmitted for admin review.",
        nl: "Advertentie bijgewerkt en opnieuw ingediend voor beoordeling door de beheerder.",
      };
    }

    return res.json({
      success: true,
      message,
      data: updatedListing,
    });
  } catch (error) {
    console.error("Error updating listing:", error);

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);

      return res.status(400).json({
        success: false,
        message: {
          en: "Listing validation failed.",
          nl: "Validatie van de advertentie is mislukt.",
        },
        errors,
      });
    }

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: {
          en: "Invalid listing ID or related ID.",
          nl: "Ongeldige advertentie-ID of gerelateerde ID.",
        },
      });
    }

    return res.status(500).json({
      success: false,
      message: {
        en: "An unexpected error occurred while updating the listing.",
        nl: "Er is een onverwachte fout opgetreden bij het bijwerken van de advertentie.",
      },
      error: error.message,
    });
  }
};
// @desc    Delete a listing
// @route   DELETE /api/vendor/listings/:id
// @access  Private (Vendor only)
const deleteListing = async (req, res) => {
  try {
    const vendorId = req.user?.id;
    const listingId = req.params.id;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "Vendor not found in request.",
      });
    }

    // Find the listing and ensure it belongs to the vendor
    const listing = await Listing.findOne({ _id: listingId, vendor: vendorId });
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found or not authorized",
      });
    }

    await Listing.deleteOne({ _id: listingId });

    res.json({
      success: true,
      message: "Listing deleted successfully",
    });
  } catch (err) {
    console.error("Delete listing error:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

// @desc    Get vendor listings (name and id only)
// @route   GET /api/vendor/listings
// @access  Private (Vendor only)
const getVendorListings = async (req, res) => {
  try {
    const vendorId =
      req.vendor?._id || req.user?._id || req.user?.vendorId || req.user?.id;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "Vendor not found in request.",
      });
    }

    // Get listings for this vendor with only name and id
    const listings = await Listing.find({ vendor: vendorId })
      .select("_id title")
      .lean();

    // Format the response to include name and id with both languages
    const formattedListings = listings.map((listing) => ({
      id: listing._id,
      name: {
        en: listing.title?.en || listing.title || "Untitled",
        nl: listing.title?.nl || listing.title || "Naamloos",
      },
    }));

    res.json({
      success: true,
      data: formattedListings,
    });
  } catch (err) {
    console.error("Get vendor listings error:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

module.exports = {
  toggleListingStatus,
  getVendorListingsOverview,
  getVendorListings,
  createListing,
  updateListing,
  deleteListing,
  filterByCategory,
};
