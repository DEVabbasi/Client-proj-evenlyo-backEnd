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
// ...existing code...
const createListing = async (req, res) => {
  try {
    const data = req.body;

    // -------- Validate multilingual title --------
    if (!data.title || !data.title.en?.trim() || !data.title.nl?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Title in both EN and NL is required",
      });
    }

    // -------- Validate multilingual description --------
    if (!data.description || !data.description.en?.trim() || !data.description.nl?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Description in both EN and NL is required",
      });
    }

    // -------- Validate subtitle only if sent --------
    if (data.subtitle) {
      if (!data.subtitle.en?.trim() || !data.subtitle.nl?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Subtitle must have both EN and NL",
        });
      }
    }

    // -------- Set vendor to business owner's User id (listing.vendor refs User) --------
    const ownerUserId = await resolveVendorOwnerUserId(
      req?.user?.vendorId || req?.user?.id,
    );
    if (!ownerUserId) {
      return res.status(400).json({
        success: false,
        message: "Vendor not found in request",
      });
    }

    data.vendor = ownerUserId;

    console.log(data, "datadatadatadatadata");


    // -------- Create listing (no extra logic) --------
    const listing = new Listing(data);
    await listing.save();

    // -------- Populate vendor, category, subCategory --------
    const populated = await Listing.findById(listing._id)
      .populate(
        "vendor",
        "_id businessName businessLocation businessDescription businessEmail businessPhone businessWebsite gallery userId"
      )
      .populate("category", "name icon description")
      .populate("subCategory", "name icon description");

    return res.status(201).json({
      success: true,
      message: {
        en: "Listing created successfully",
        nl: "Listing succesvol aangemaakt",
      },
      data: populated,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Error creating listing",
      error: err.message,
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
    const updateData = req.body;
    // Find the existing listing
    const existingListing = await Listing.findById(id);
    if (!existingListing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    // Validate required fields if they are being updated
    if (updateData.title !== undefined) {
      if (
        !updateData.title ||
        (typeof updateData.title === "string" && !updateData.title.trim())
      ) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: ["Title cannot be empty"],
        });
      }
      updateData.title = toMultilingualText(updateData.title);
    }

    if (updateData.description !== undefined) {
      if (
        !updateData.description ||
        (typeof updateData.description === "string" &&
          !updateData.description.trim())
      ) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: ["Description cannot be empty"],
        });
      }
      updateData.description = toMultilingualText(updateData.description);
    }

    // Convert text fields to multilingual format using toMultilingualText
    if (updateData.subtitle) {
      updateData.subtitle = toMultilingualText(updateData.subtitle);
    }

    // Handle images array
    if (Array.isArray(updateData.images)) {
      updateData.images = updateData.images.filter(
        (img) => typeof img === "string" && img.length > 0
      );
    } else if (updateData.images && typeof updateData.images === "string") {
      updateData.images = [updateData.images];
    }
    // Fallback: if images is missing or empty, but media.gallery exists, copy gallery to images
    if (
      (!updateData.images || updateData.images.length === 0) &&
      updateData.media &&
      Array.isArray(updateData.media.gallery)
    ) {
      updateData.images = updateData.media.gallery.filter(
        (img) => typeof img === "string" && img.length > 0
      );
    }

    // Handle location coordinates - support both lat/lng and latitude/longitude formats
    if (updateData.location && updateData.location.coordinates) {
      const coords = updateData.location.coordinates;

      // Extract latitude and longitude, handling both formats
      let latitude =
        coords.latitude !== undefined ? coords.latitude : coords.lat;
      let longitude =
        coords.longitude !== undefined ? coords.longitude : coords.lng;

      // Validate latitude
      if (latitude !== undefined) {
        latitude = parseFloat(latitude);
        if (isNaN(latitude) || latitude < -90 || latitude > 90) {
          return res.status(400).json({
            success: false,
            message: "Invalid latitude: must be a number between -90 and 90",
          });
        }
      }

      // Validate longitude
      if (longitude !== undefined) {
        longitude = parseFloat(longitude);
        if (isNaN(longitude) || longitude < -180 || longitude > 180) {
          return res.status(400).json({
            success: false,
            message: "Invalid longitude: must be a number between -180 and 180",
          });
        }
      }

      // Set the coordinates in the correct format for the model
      if (latitude !== undefined && longitude !== undefined) {
        updateData.location.coordinates = {
          latitude: latitude,
          longitude: longitude,
        };
      }
    }
    console.log(updateData, "updateDataupdateDataupdateDataupdateData");

    // --- Merge pricing updates with existing pricing ---
    if (updateData.pricing) {
      const {
        type,
        amount,
        extratimeCost,
        securityFee,
        pricePerKm,
        escrowFee,
      } = updateData.pricing;

      // Get existing pricing to preserve unmodified fields
      const existingPricing = existingListing.pricing || {};

      // Merge existing pricing with updates, only updating provided fields
      updateData.pricing = {
        type: type !== undefined ? type : existingPricing.type,
        amount: amount !== undefined ? amount : existingPricing.amount,
        extratimeCost:
          extratimeCost !== undefined
            ? extratimeCost === "" ? 0 : extratimeCost
            : existingPricing.extratimeCost,
        securityFee:
          securityFee !== undefined ? securityFee : existingPricing.securityFee,
        pricePerKm:
          pricePerKm !== undefined ? pricePerKm : existingPricing.pricePerKm,
        escrowFee:
          escrowFee !== undefined ? escrowFee : existingPricing.escrowFee,
      };

      // Validate required fields after merging
      if (!updateData.pricing.type || updateData.pricing.amount === undefined) {
        return res.status(400).json({
          success: false,
          message: "Pricing type and amount are required.",
        });
      }

      // Calculate totalPrice after merging pricing updates
      const finalAmount = updateData.pricing.amount || 0;
      const finalExtratimeCost = updateData.pricing.extratimeCost || 0;
      const finalSecurityFee = updateData.pricing.securityFee || 0;
      const finalEscrowFee = updateData.pricing.escrowFee || 0;
      updateData.pricing.totalPrice =
        finalAmount + finalExtratimeCost + finalSecurityFee + finalEscrowFee;
    }

    // Update the listing and trigger middleware
    const updatedListing = await Listing.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate(
        "vendor",
        "_id businessName businessLocation businessDescription businessEmail businessPhone businessWebsite gallery userId"
      )
      .populate("category", "name icon description")
      .populate("subCategory", "name icon description");

    res.json({
      success: true,
      message: "Listing updated successfully",
      data: updatedListing,
    });
  } catch (error) {
    console.error("Error updating listing:", error);
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors,
      });
    }
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid listing ID",
      });
    }
    res.status(500).json({
      success: false,
      message: "Error updating listing",
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
