const Listing = require("../../models/Listing");
const Category = require("../../models/Category");
const SubCategory = require("../../models/SubCategory");
const Vendor = require("../../models/Vendor");
const BookingRequest = require("../../models/Booking");
const ServiceItem = require("../../models/Item");
const Cart = require("../../models/Cart");
const { verifyAccessToken, successHelper } = require("../../utils/jwtUtils");
const Item = require("../../models/Item");
const User = require("../../models/User");
const Settings = require("../../models/Settings");
const Review = require("../../models/Review");
const { default: mongoose } = require("mongoose");
const {
  getApprovalSettings,
  getPublicListingApprovalFilter,
  isPubliclyVisibleListing,
} = require("../../utils/getApprovalSettings");
const { getVendorDisplayName } = require("../../utils/vendorDisplayName");
// @desc    Get calendar data (booked and available days/times) for a listing
// @route   GET /api/listing/:id/calendar
// @access  Public
const getListingCalendar = async (req, res) => {
  try {
    const { id } = req.params;
    // Find listing and get availability info
    const listing = await Listing.findById(id).select("availability");
    if (!listing) {
      return res
        .status(404)
        .json({ success: false, message: "Listing not found" });
    }

    // Get all bookings for this listing that are not cancelled/rejected
    const bookings = await BookingRequest.find({
      listingId: id,
      status: { $nin: ["rejected", "cancelled"] },
    }).select(
      "details.startDate details.endDate details.startTime details.endTime",
    );

    // Collect all booked date ranges with time
    const bookedSlots = [];
    bookings.forEach((b) => {
      const start = new Date(b.details.startDate);
      const end = new Date(b.details.endDate);
      let current = new Date(start);
      while (current <= end) {
        bookedSlots.push({
          date: current.toISOString().split("T")[0],
          startTime: b.details.startTime,
          endTime: b.details.endTime,
        });
        current.setDate(current.getDate() + 1);
      }
    });

    // Remove duplicate booked slots (same date, time)
    const uniqueBookedSlots = Array.from(
      new Map(
        bookedSlots.map((slot) => [
          slot.date + slot.startTime + slot.endTime,
          slot,
        ]),
      ).values(),
    );

    // Prepare available days with time slots
    const availableDays = listing.availability?.availableDays || [];
    const availableTimeSlots = listing.availability?.availableTimeSlots || [];

    // For each available day, attach available time slots
    const availableSchedule = availableDays.map((day) => ({
      day,
      timeSlots: availableTimeSlots,
    }));

    res.json({
      success: true,
      data: {
        listingId: id,
        availableSchedule,
        bookedSlots: uniqueBookedSlots,
      },
    });
  } catch (error) {
    console.error("Error fetching listing calendar:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching calendar",
    });
  }
};

// @desc    Get available listings with filters
// @route   GET /api/listings
// @access  Public
const getListings = async (req, res) => {
  console.log("CALLEDDDDDDDD");
  try {
    const {
      page = 1,
      limit = 12,
      categoryId,
      subCategoryId,
      search,
      minPrice,
      maxPrice,
      pricingType,
      city,
      sortBy = "sortOrder",
      sortOrder = "desc",
      status = "active",
      isFeatured,
      isAvailable,
    } = req.query;

    const approvalSettings = await getApprovalSettings();

    // Build query object
    const query = {
      status: status,
      isActive: true,
    };

    Object.assign(query, getPublicListingApprovalFilter(approvalSettings));

    // Filter by category
    if (categoryId) {
      query.category = categoryId;
    }

    // Filter by subcategory
    if (subCategoryId) {
      query.subCategory = subCategoryId;
    }

    // Filter by city
    // if (city) {
    //   query["location.city"] = { $regex: city, $options: "i" };
    // }

    // Search by title, description, or tags
    // if (search) {
    //   query.$or = [
    //     { title: { $regex: search, $options: "i" } },
    //     { description: { $regex: search, $options: "i" } },
    //     { shortDescription: { $regex: search, $options: "i" } },
    //     { tags: { $in: [new RegExp(search, "i")] } },
    //   ];
    // }

    // Filter by price range (check all pricing options)
    // if (minPrice || maxPrice) {
    //   const priceQuery = { $or: [] };

    //   if (minPrice) {
    //     priceQuery.$or.push(
    //       { "pricing.perHour": { $gte: parseFloat(minPrice) } },
    //       { "pricing.perDay": { $gte: parseFloat(minPrice) } },
    //       { "pricing.perEvent": { $gte: parseFloat(minPrice) } }
    //     );
    //   }

    //   if (maxPrice) {
    //     priceQuery.$or.push(
    //       { "pricing.perHour": { $lte: parseFloat(maxPrice) } },
    //       { "pricing.perDay": { $lte: parseFloat(maxPrice) } },
    //       { "pricing.perEvent": { $lte: parseFloat(maxPrice) } }
    //     );
    //   }

    //   if (priceQuery.$or.length > 0) {
    //     query.$and = query.$and || [];
    //     query.$and.push(priceQuery);
    //   }
    // }

    // Filter by pricing type
    // if (pricingType) {
    //   query["pricing.type"] = pricingType;
    // }

    // // Filter by featured status
    // if (isFeatured !== undefined) {
    //   query.isFeatured = isFeatured === "true";
    // }

    // // Filter by availability
    // if (isAvailable !== undefined) {
    //   query["availability.isAvailable"] = isAvailable === "true";
    // }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Build sort object
    const sortOptions = {};
    if (sortBy === "price") {
      // Sort by lowest available price option
      sortOptions["pricing.perHour"] = sortOrder === "desc" ? -1 : 1;
    } else if (sortBy === "rating") {
      sortOptions["rating.average"] = sortOrder === "desc" ? -1 : 1;
    } else if (sortBy === "popularity") {
      sortOptions["bookings.completed"] = sortOrder === "desc" ? -1 : 1;
    } else {
      sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;
    }

    // Get listings with populated vendor and category information
    const listingsDocs = await Listing.find(query)
      .populate("vendor", "_id firstName lastName fullName")
      .populate("category", "name icon")
      .populate(
        "subCategory",
        "name icon escrowEnabled upfrontFeePercent upfrontHour evenlyoProtectFeePercent",
      )
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .select("-seo -__v -contact.email -contact.phone"); // Hide contact info in list view

    // Attach payment policy (from subcategory) to each listing
    const listings = listingsDocs.map((doc) => {
      const obj = doc.toObject();
      const sc = obj.subCategory || {};
      obj.paymentPolicy = {
        escrowEnabled: !!sc.escrowEnabled,
      };
      return obj;
    });

    const listingIds = listingsDocs.map((doc) => doc._id);
    console.log(listingIds, "listingIdslistingIdslistingIds");
    // 2Ã¯Â¸ÂÃ¢Æ’Â£ Get Bookings for these listings
    const bookings = await BookingRequest.find({
      listingId: { $in: listingIds },
    }).select("_id listing");

    const bookingIds = bookings.map((b) => b._id);
    console.log(bookingIds, "bookingIdsbookingIdsbookingIdsbookingIds");
    const bookingMap = {};
    bookings.forEach((b) => {
      bookingMap[b._id.toString()] = b.listing.toString();
    });

    // 3Ã¯Â¸ÂÃ¢Æ’Â£ Get Reviews for these bookings
    const reviews = await Review.find({
      bookingId: { $in: bookingIds },
    }).select("bookingId rating");

    // Get total count for pagination
    const total = await Listing.countDocuments(query);

    res.json({
      success: true,
      data: listings,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching listings:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching listings",
      error: error.message,
    });
  }
};

// @desc    Get listing by ID with full details
// @route   GET /api/listings/:id
// @access  Public
const getListingById = async (req, res) => {
  console.log("yahi wala hy");

  try {
    const listing = await Listing.findById(req.params.id)
      .populate(
        "vendor",
        "_id email contactNumber firstName lastName accountType address",
      )
      .populate("category", "name icon description")
      .populate(
        "subCategory",
        "name icon description isUpfrontEnabled upfrontFeePercent escrowHours isEvenlyoProtectEnabled evenlyoProtectFeePercent",
      )
      .populate("reviews.clientId", "firstName lastName profileImage");

    // Ã¢ÂÅ’ Agar listing hi nahi mili
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    const approvalSettings = await getApprovalSettings();
    if (
      approvalSettings.itemApprovalRequired &&
      !isPubliclyVisibleListing(listing.approvalStatus)
    ) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    // Ã¢Å“â€¦ Vendor details fetch (business logo + Vendor model _id)
    let businessLogo = "";
    let vendorModelId = null;
    let vendorProfile = null;
    if (listing.vendor?._id) {
      vendorProfile = await Vendor.findOne({
        userId: listing.vendor._id,
      }).select("_id businessLogo businessName");

      businessLogo = vendorProfile?.businessLogo || "";
      vendorModelId = vendorProfile?._id || null;
    }

    // Ã¢Å“â€¦ Booking IDs
    const bookings = await BookingRequest.find({
      listingId: req.params.id,
    }).select("_id");

    const bookingIds = bookings.map((b) => b._id);

    // Ã¢Å“â€¦ Reviews aggregation
    const reviewAgg = await Review.aggregate([
      {
        $match: {
          bookingId: { $in: bookingIds },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
          reviews: {
            $push: {
              rating: "$rating",
              review: "$review",
              vendor: {
                firstName: "$user.firstName",
                lastName: "$user.lastName",
                image: "$user.profileImage",
              },
            },
          },
        },
      },
    ]);

    // Ã¢Å“â€¦ Safe reviews object
    const reviewsData = reviewAgg[0] || {
      averageRating: 0,
      totalReviews: 0,
      reviews: [],
    };

    // Ã¢Å“â€¦ Views increment safe
    listing.views = (listing.views || 0) + 1;
    await listing.save();

    // Ã¢Å“â€¦ Convert object
    const data = listing.toObject();

    // Attach extra data
    data.vendor = data.vendor || {};
    data.vendor.businessLogo = businessLogo;
    data.vendor.vendorModelId = vendorModelId;

    // Business accounts have no firstName/lastName, so the User.fullName
    // virtual resolves to an empty string. Expose the Vendor profile's
    // businessName and make fullName the resolved display name so clients
    // never render "undefined undefined".
    data.vendor.businessName = vendorProfile?.businessName || "";
    data.vendor.fullName = getVendorDisplayName(data.vendor, vendorProfile);

    const sc = data.subCategory || {};
    const settings = await Settings.findOne();

    // Ã¢Å“â€¦ IMPORTANT: toggle flag for frontend
    data.isActiveListing = listing.status === "active";

    data.paymentPolicy = sc;
    data.settings = settings;
    data.reviews = reviewsData;

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error fetching listing:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid listing ID",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error fetching listing",
      error: error.message,
    });
  }
};

// @desc    Get featured listings
// @route   GET /api/listings/featured
// @access  Public
const getFeaturedListings = async (req, res) => {
  try {
    const { limit = 6, categoryId } = req.query;

    const approvalSettings = await getApprovalSettings();

    const query = {
      isFeatured: true,
      status: "active",
      isActive: true,
      "availability.isAvailable": true,
    };

    Object.assign(query, getPublicListingApprovalFilter(approvalSettings));

    // Filter by category if provided
    if (categoryId) {
      query.category = categoryId;
    }

    const listings = await Listing.find(query)
      .populate("vendor", "_id businessName businessLocation")
      .populate("category", "name icon")
      .populate("subCategory", "name icon")
      .sort({ "ratings.average": -1, "bookings.completed": -1, sortOrder: -1 })
      .limit(parseInt(limit))
      .select("-seo -__v");

    res.json({
      success: true,
      data: listings.map((doc) => doc.toObject()),
    });
  } catch (error) {
    console.error("Error fetching featured listings:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching featured listings",
      error: error.message,
    });
  }
};

// @desc    Get popular listings
// @route   GET /api/listings/popular
// @access  Public
const getPopularListings = async (req, res) => {
  try {
    const { limit = 8, categoryId } = req.query;

    const approvalSettings = await getApprovalSettings();

    const query = {
      status: "active",
      isActive: true,
      popular: true,
    };

    Object.assign(query, getPublicListingApprovalFilter(approvalSettings));

    // Filter by category if provided
    if (categoryId) {
      query.category = categoryId;
    }

    const listings = await Listing.find(query)
      .populate("vendor", "_id businessName businessLocation")
      .populate("category", "name icon")
      .populate("subCategory", "name icon")
      .sort({ "bookings.completed": -1, views: -1, "ratings.average": -1 })
      .limit(parseInt(limit))
      .select("-seo -__v");

    // Ensure fields are not null
    const sanitizedListings = listings.map((listing) => {
      const obj = listing.toObject();
      // If images is null or contains only null, set to []
      if (
        !Array.isArray(obj.images) ||
        obj.images.every((img) => img == null)
      ) {
        obj.images = [];
      }
      // If vendor is null, set to empty object
      if (obj.vendor == null) obj.vendor = {};
      // If category is null, set to empty object
      if (obj.category == null) obj.category = {};
      // If subCategory is null, set to empty object
      if (obj.subCategory == null) obj.subCategory = {};
      return obj;
    });
    res.json({
      success: true,
      data: sanitizedListings,
    });
  } catch (error) {
    console.error("Error fetching popular listings:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching popular listings",
      error: error.message,
    });
  }
};

// Optionally, you can expose this as an admin route or call it on a schedule.

// @desc    Search listings with advanced filters
// @route   GET /api/listings/search
// @access  Public
const searchListings = async (req, res) => {
  try {
    const {
      q, // general search query (title, description, etc.)
      title, // specific title search
      location, // location search
      date, // date search (day of week)
      dateTime, // specific date and time search
      page = 1,
      limit = 12,
      categoryId,
      subCategoryId,
      city,
      pricingType,
      sortBy = "relevance",
      sortOrder = "desc",
    } = req.query;

    console.log("Search query:", { q, title, location, date, dateTime });

    const approvalSettings = await getApprovalSettings();

    // Build query object
    const query = {
      status: "active",
      isActive: true,
      "availability.isAvailable": true,
    };

    Object.assign(query, getPublicListingApprovalFilter(approvalSettings));

    // Handle different search types
    const searchConditions = [];

    // General text search (title, description, tags)
    if (q && q.trim().length > 0) {
      searchConditions.push({ $text: { $search: q } });
    }

    // Specific title search
    if (title && title.trim().length > 0) {
      searchConditions.push({ title: { $regex: title, $options: "i" } });
    }

    // Location search
    if (location && location.trim().length > 0) {
      searchConditions.push({
        "location.fullAddress": { $regex: location, $options: "i" },
      });
    }

    // Date availability search (day of week)
    if (date) {
      try {
        // Validate YYYY-MM-DD format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
          return res.status(400).json({
            success: false,
            message: "Invalid date format. Please use YYYY-MM-DD format.",
          });
        }

        // Parse date manually to avoid timezone issues
        const [year, month, day] = date.split("-").map(Number);
        const searchDate = new Date(year, month - 1, day); // month is 0-indexed

        if (isNaN(searchDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid date. Please provide a valid date.",
          });
        }

        const dayOfWeek = searchDate
          .toLocaleString("en-US", { weekday: "short" })
          .toLowerCase();
        searchConditions.push({ "availability.availableDays": dayOfWeek });
      } catch (error) {
        console.error("Date parsing error:", error);
        return res.status(400).json({
          success: false,
          message: "Invalid date format. Please use YYYY-MM-DD format.",
        });
      }
    }

    // Date and time availability search
    if (dateTime) {
      try {
        // Validate ISO 8601 format (YYYY-MM-DDTHH:mm:ss or YYYY-MM-DDTHH:mm)
        const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
        if (!dateTimeRegex.test(dateTime)) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid dateTime format. Please use ISO 8601 format (e.g., 2024-01-15T14:30:00).",
          });
        }

        // Parse dateTime manually to avoid timezone issues
        const [datePart, timePart] = dateTime.split("T");
        const [year, month, day] = datePart.split("-").map(Number);
        const [hour, minute] = timePart.split(":").map(Number);

        const searchDateTime = new Date(year, month - 1, day, hour, minute);

        if (isNaN(searchDateTime.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid dateTime. Please provide a valid date and time.",
          });
        }

        const dayOfWeek = searchDateTime
          .toLocaleString("en-US", { weekday: "short" })
          .toLowerCase();
        const timeString = searchDateTime.toTimeString().slice(0, 5); // HH:MM format

        // Check if the day is available and time slot matches
        searchConditions.push({
          "availability.availableDays": dayOfWeek,
          "availability.availableTimeSlots": {
            $elemMatch: {
              startTime: { $lte: timeString },
              endTime: { $gte: timeString },
            },
          },
        });
      } catch (error) {
        console.error("DateTime parsing error:", error);
        return res.status(400).json({
          success: false,
          message:
            "Invalid dateTime format. Please use ISO 8601 format (e.g., 2024-01-15T14:30:00).",
        });
      }
    }

    // Apply search conditions (AND logic - all conditions must be met)
    if (searchConditions.length > 0) {
      // For combined searches, use $and to ensure all conditions are met
      if (searchConditions.length > 1) {
        query.$and = searchConditions;
      } else {
        // For single condition, add it directly to the query
        Object.assign(query, searchConditions[0]);
      }
    } else if (!q && !title && !location && !date && !dateTime) {
      return res.status(400).json({
        success: false,
        message:
          "At least one search parameter is required (q, title, location, date, or dateTime)",
      });
    }

    // Apply additional filters
    if (categoryId) query.category = categoryId;
    if (subCategoryId) query.subCategory = subCategoryId;
    if (city) query["location.city"] = { $regex: city, $options: "i" };
    if (pricingType) query["pricing.type"] = pricingType;

    const skip = (page - 1) * limit;

    // Build sort object
    const sortOptions = {};
    if (sortBy === "relevance") {
      // Only use text score if we have a text search (q parameter)
      if (q && q.trim().length > 0) {
        sortOptions.score = { $meta: "textScore" };
      } else {
        // For non-text searches, sort by default sortOrder field
        sortOptions.sortOrder = -1;
      }
    } else if (sortBy === "price") {
      sortOptions["pricing.amount"] = sortOrder === "desc" ? -1 : 1;
    } else if (sortBy === "rating") {
      sortOptions["ratings.average"] = sortOrder === "desc" ? -1 : 1;
    } else {
      sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;
    }

    const listings = await Listing.find(query)
      .populate("vendor", "_id businessName businessLocation")
      .populate("category", "name icon")
      .populate("subCategory", "name icon")
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .select("-seo -__v");

    const total = await Listing.countDocuments(query);

    res.json({
      success: true,
      data: listings.map((doc) => doc.toObject()),
      searchCriteria: {
        generalQuery: q || "",
        title: title || "",
        location: location || "",
        date: date || "",
        dateTime: dateTime || "",
      },
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error searching listings:", error);
    res.status(500).json({
      success: false,
      message: "Error searching listings",
      error: error.message,
    });
  }
};

// @desc    Get listings by vendor ID
// @route   GET /api/listings/vendor/:vendorId
// @access  Public
const getListingsByVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const {
      page = 1,
      limit = 12,
      sortBy = "createdAt",
      sortOrder = "desc",
      status = "active",
    } = req.query;
    console.log(vendorId, "vendorIdvendorIdvendorId");

    // Verify vendor exists
    const vendor = await User.findById({ _id: vendorId, userType: "vendor" });
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not",
      });
    }

    const approvalSettings = await getApprovalSettings();

    const query = {
      vendor: vendorId,
      isActive: true,
    };

    Object.assign(query, getPublicListingApprovalFilter(approvalSettings));

    // Add status filter
    if (status !== "all") {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    // Build sort object
    const sortOptions = {};
    if (sortBy === "price") {
      sortOptions["pricing.amount"] = sortOrder === "desc" ? -1 : 1;
    } else if (sortBy === "rating") {
      sortOptions["ratings.average"] = sortOrder === "desc" ? -1 : 1;
    } else {
      sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;
    }
    console.log(query, "queryqueryquery");

    const listings = await Listing.find(query)
      .populate("category", "name icon")
      .populate("subCategory", "name icon")
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .select("-seo -__v");

    const total = await Listing.countDocuments(query);

    res.json({
      success: true,
      data: listings.map((doc) => doc.toObject()),
      vendor: {
        _id: vendor._id,
        businessName: vendor.businessName,
        businessLocation: vendor.businessLocation,
      },
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching listings by vendor:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching listings by vendor",
      error: error.message,
    });
  }
};

// @desc    Check listing availability for date range (enhanced for multi-day)
// @route   GET /api/listing/:id/availability
// @access  Public
const checkListingAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const { start, end, detailed = false } = req.query;

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        message: "Start and end dates are required",
      });
    }

    // Validate dates
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format",
      });
    }

    if (startDate >= endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date must be before end date",
      });
    }

    // Check if listing exists and is active
    const listing = await Listing.findOne({
      _id: id,
      isActive: true,
      status: "active",
    }).select("title pricing.multiDayDiscount");

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found or not available",
      });
    }

    // Normalize dates for accurate comparison
    const checkStart = new Date(startDate);
    checkStart.setHours(0, 0, 0, 0);

    const checkEnd = new Date(endDate);
    checkEnd.setHours(23, 59, 59, 999);

    // Check for overlapping bookings that are not rejected or cancelled
    const overlappingBookings = await BookingRequest.find({
      listingId: id,
      status: { $nin: ["rejected", "cancelled"] },
      $or: [
        {
          "details.startDate": { $lte: checkEnd },
          "details.endDate": { $gte: checkStart },
        },
      ],
    }).select(
      "details.startDate details.endDate status trackingId details.duration",
    );

    const isAvailable = overlappingBookings.length === 0;

    // Calculate multi-day details
    const diffTime = Math.abs(checkEnd - checkStart);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    const isMultiDay = diffDays > 1;

    let response = {
      success: true,
      data: {
        listingId: id,
        listingTitle: listing.title,
        requestedPeriod: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          days: diffDays,
          isMultiDay: isMultiDay,
        },
        isAvailable,
        conflictingBookings: overlappingBookings.map((booking) => ({
          trackingId: booking.trackingId,
          startDate: booking.details.startDate,
          endDate: booking.details.endDate,
          status: booking.status,
          isMultiDay: booking.details.duration?.isMultiDay || false,
        })),
      },
    };

    // Add multi-day discount info if applicable
    if (isMultiDay && listing.pricing?.multiDayDiscount?.enabled) {
      const discount = listing.pricing.multiDayDiscount;
      response.data.multiDayDiscount = {
        eligible: diffDays >= discount.minDays,
        percent: discount.percent,
        minDays: discount.minDays,
        description: discount.description,
      };
    }

    // Detailed day-by-day availability if requested
    if (detailed === "true" && isMultiDay) {
      const dailyAvailability = [];
      const currentDate = new Date(checkStart);

      for (let i = 0; i < diffDays; i++) {
        const dayStart = new Date(currentDate);
        const dayEnd = new Date(currentDate);
        dayEnd.setHours(23, 59, 59, 999);

        const dayConflicts = overlappingBookings.filter((booking) => {
          const bookingStart = new Date(booking.details.startDate);
          const bookingEnd = new Date(booking.details.endDate);
          return bookingStart <= dayEnd && bookingEnd >= dayStart;
        });

        dailyAvailability.push({
          date: dayStart.toISOString().split("T")[0],
          available: dayConflicts.length === 0,
          conflicts: dayConflicts.length,
          conflictingBookings: dayConflicts.map((b) => b.trackingId),
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      response.data.dailyAvailability = dailyAvailability;
    }

    res.json(response);
  } catch (error) {
    console.error("Error checking availability:", error);
    res.status(500).json({
      success: false,
      message: "Server error while checking availability",
    });
  }
};

// @desc    Filter listings by category or subcategory with essential details
// @route   GET /api/listings/filter
// @access  Public
const filterListings = async (req, res) => {
  try {
    const {
      categoryId,
      subCategoryId,
      page = 1,
      limit = 12,
      sortBy = "ratings.average",
      sortOrder = "desc",
    } = req.query;

    // Validate that at least one filter is provided
    if (!categoryId && !subCategoryId) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide either categoryId or subCategoryId to filter listings",
      });
    }

    const approvalSettings = await getApprovalSettings();

    // Build query object
    const query = {
      status: "active",
      isActive: true,
      "availability.isAvailable": true,
    };

    Object.assign(query, getPublicListingApprovalFilter(approvalSettings));

    // Filter by category AND/OR subcategory
    if (categoryId && subCategoryId) {
      // If both category and subcategory are provided, filter by both
      query.category = categoryId;
      query.subCategory = subCategoryId;
    } else if (subCategoryId) {
      // If only subcategory is provided
      query.subCategory = subCategoryId;
    } else if (categoryId) {
      // If only category is provided
      query.category = categoryId;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Build sort object
    const sortOptions = {};
    if (sortBy === "price") {
      // Sort by pricing per event (most common)
      sortOptions["pricing.perEvent"] = sortOrder === "desc" ? -1 : 1;
    } else if (sortBy === "rating") {
      sortOptions["ratings.average"] = sortOrder === "desc" ? -1 : 1;
    } else if (sortBy === "popularity") {
      sortOptions["bookings.completed"] = sortOrder === "desc" ? -1 : 1;
    } else if (sortBy === "newest") {
      sortOptions["createdAt"] = sortOrder === "desc" ? -1 : 1;
    } else {
      sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;
    }

    // Get listings with essential information
    const listings = await Listing.find(query)
      .populate("vendor", "businessName businessLocation rating")
      .populate("category", "name")
      .populate("subCategory", "name")
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .select(
        "title description pricing location ratings images media.featuredImage",
      );

    // Get total count for pagination
    const total = await Listing.countDocuments(query);
    let settings = await Settings.findOne();
    // Format the response data
    const formattedListings = listings.map((listing) => {
      // Get the main pricing (prefer per event, then per day, then per hour)
      let pricingPerEvent = null;
      if (listing.pricing.perEvent) {
        pricingPerEvent = `${listing.pricing.currency} ${listing.pricing.perEvent}`;
      } else if (listing.pricing.perDay) {
        pricingPerEvent = `${listing.pricing.currency} ${listing.pricing.perDay}/day`;
      } else if (listing.pricing.perHour) {
        pricingPerEvent = `${listing.pricing.currency} ${listing.pricing.perHour}/hour`;
      } else {
        pricingPerEvent = "Quote on request";
      }

      const data = listing.toObject();
      const sc = data.subCategory || {};
      console.log(sc, "scscscscscsc");

      return {
        id: listing._id,
        title: listing.title,
        description: listing.description,
        vendorName: listing.vendor?.businessName || "Unknown Vendor",
        rating: listing.ratings?.average || 0,
        ratingCount: listing.ratings?.count || 0,
        pricingPerEvent,
        location: `${listing.location.city}${
          listing.location.region ? ", " + listing.location.region : ""
        }`,
        featuredImage: listing.images?.[0] || "",
        images: listing.images || [],
        category: listing.category?.name,
        subCategory: listing.subCategory?.name,
        settings,
        paymentPolicy: sc,
      };
    });

    res.json({
      success: true,
      data: [],
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit),
      },
      filter: {
        categoryId: categoryId || "",
        subCategoryId: subCategoryId || "",
        sortBy,
        sortOrder,
      },
    });
  } catch (error) {
    console.error("Error filtering listings:", error);
    res.status(500).json({
      success: false,
      message: "Error filtering listings",
      error: error.message,
    });
  }
};

// @desc    GHet listings, vendors, and sale items by category and subcategory
// @route   GET /api/listings/by-category
// @access  Public

const getSubCategoryByName = async (req, res) => {
  try {
    console.log(req.query, "req.queryreq.queryreq.query");
    const { q, mainCategory } = req.query;

    // Debounce safety
    if (!q || q.trim().length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    const matchQuery = {
      isActive: true,
      $or: [
        { "name.en": { $regex: q, $options: "i" } },
        { "name.nl": { $regex: q, $options: "i" } },
      ],
    };

    // Optional main category filter
    if (mainCategory) {
      matchQuery.mainCategory = mainCategory;
    }

    const subCategories = await SubCategory.find(matchQuery)
      .select("name mainCategory icon sortOrder")
      .sort({ sortOrder: 1 })
      .limit(10);

    res.status(200).json({
      success: true,
      data: subCategories,
    });
  } catch (error) {
    console.error("SubCategory search failed:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search subcategories",
    });
  }
};

const getDayKey = (date) => {
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return days[new Date(date).getDay()];
};

const getDistanceInKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (value) => (value * Math.PI) / 180;

  const R = 6371; // Earth radius in KM
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const getHomeData = async (req, res) => {
  try {
    const { subCategoryId, categoryId, latitude, longitude, date, radius } =
      req.body;

    /*
     * ---------------------------------------------------------
     * VALIDATIONS
     * ---------------------------------------------------------
     */

    // Validate categoryId if provided
    if (categoryId !== undefined && categoryId !== null && categoryId !== "") {
      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid categoryId",
        });
      }
    }

    // Validate subCategoryId if provided
    if (
      subCategoryId !== undefined &&
      subCategoryId !== null &&
      subCategoryId !== ""
    ) {
      if (!mongoose.Types.ObjectId.isValid(subCategoryId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid subCategoryId",
        });
      }
    }

    // categoryId and subCategoryId should be used together
    if (categoryId && !subCategoryId) {
      // This is allowed:
      // Search the entire main category.
    }

    if (subCategoryId && !categoryId) {
      return res.status(400).json({
        success: false,
        message: "categoryId is required when subCategoryId is provided",
      });
    }

    /*
     * Validate latitude / longitude if provided
     */
    if (latitude !== undefined && latitude !== null && latitude !== "") {
      if (isNaN(Number(latitude))) {
        return res.status(400).json({
          success: false,
          message: "Invalid latitude",
        });
      }

      const parsedLatitude = Number(latitude);

      if (parsedLatitude < -90 || parsedLatitude > 90) {
        return res.status(400).json({
          success: false,
          message: "Latitude must be between -90 and 90",
        });
      }
    }

    if (longitude !== undefined && longitude !== null && longitude !== "") {
      if (isNaN(Number(longitude))) {
        return res.status(400).json({
          success: false,
          message: "Invalid longitude",
        });
      }

      const parsedLongitude = Number(longitude);

      if (parsedLongitude < -180 || parsedLongitude > 180) {
        return res.status(400).json({
          success: false,
          message: "Longitude must be between -180 and 180",
        });
      }
    }

    /*
     * Radius validation
     */
    if (radius !== undefined && radius !== null && radius !== "") {
      if (isNaN(Number(radius))) {
        return res.status(400).json({
          success: false,
          message: "Invalid radius",
        });
      }

      if (Number(radius) <= 0) {
        return res.status(400).json({
          success: false,
          message: "Radius must be greater than 0",
        });
      }
    }

/*
      * ---------------------------------------------------------
      * BUILD MAIN SEARCH QUERY
      * ---------------------------------------------------------
      */

    const approvalSettings = await getApprovalSettings();

    const query = {
      isActive: true,
    };

    // "edited" listings stay publicly visible while awaiting re-approval.
    Object.assign(query, getPublicListingApprovalFilter(approvalSettings));

    if (categoryId) {
      query.category = categoryId;
    }

    if (subCategoryId) {
      query.subCategory = subCategoryId;
    }

    /*
     * Date filter
     */
    if (date) {
      const parsedDate = new Date(date);

      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date",
        });
      }

      const dayKey = getDayKey(date);

      if (!dayKey) {
        return res.status(400).json({
          success: false,
          message: "Unable to determine availability day",
        });
      }

      query["availability.availableDays"] = dayKey;
    }

    /*
     * ---------------------------------------------------------
     * MAIN LISTINGS
     * ---------------------------------------------------------
     */

    const listings = await Listing.find(query)
      .populate("vendor", "firstName rating isActive")
      .populate("category", "name")
      .populate("subCategory", "name")
      .select(
        "title description pricing location ratings images media.featuredImage availability vendor approvalStatus",
      );

    /*
     * ---------------------------------------------------------
     * RELATED LISTINGS
     * ---------------------------------------------------------
     *
     * IMPORTANT:
     *
     * Related listings are searched independently from the main
     * listings.
     *
     * Therefore:
     *
     * Main subcategory has listings
     *        OR
     * Main subcategory has ZERO listings
     *
     * Both cases will still search for related listings.
     *
     * Related listings must:
     *
     * 1. Be active
     * 2. Pass the public approval filter (so pending/rejected listings never
     *    leak in, while "edited" listings stay visible with their last
     *    approved content)
     * 3. Belong to the SAME main category
     * 4. Belong to a DIFFERENT subcategory
     * 5. Match date availability if date was provided
     */

    let relatedListings = null;

    if (categoryId && subCategoryId) {
      const relatedQuery = {
        isActive: true,

        ...getPublicListingApprovalFilter(approvalSettings),

        // SAME MAIN CATEGORY
        category: categoryId,

        // DIFFERENT SUBCATEGORY
        subCategory: {
          $ne: subCategoryId,
        },
      };

      /*
       * Apply date filter to related listings as well
       */
      if (date) {
        const dayKey = getDayKey(date);

        relatedQuery["availability.availableDays"] = dayKey;
      }

      relatedListings = await Listing.find(relatedQuery)
        .populate("vendor", "firstName rating isActive")
        .populate("category", "name")
        .populate("subCategory", "name")
        .select(
          "title description pricing location ratings images media.featuredImage availability vendor approvalStatus",
        );
    }

    /*
     * ---------------------------------------------------------
     * COMBINE LISTINGS FOR ENRICHMENT
     * ---------------------------------------------------------
     */

    const allListings = [...listings, ...(relatedListings || [])];

    const listingIds = allListings.map((listing) => listing._id);

    const vendorIds = allListings
      .map((listing) => listing.vendor?._id)
      .filter(Boolean);

    /*
     * ---------------------------------------------------------
     * VENDOR PROFILE DETAILS (logo + business name)
     *
     * Listing.vendor points at the User, but the public-facing business name
     * lives on the Vendor profile. User.fullName is often empty ("undefined
     * undefined"), so businessName is exposed alongside it for the client to
     * use as a display-name fallback.
     * ---------------------------------------------------------
     */

    const vendorDetails = await Vendor.find({
      userId: {
        $in: vendorIds,
      },
    }).select("userId businessLogo businessName");

    const vendorProfileMap = {};

    vendorDetails.forEach((vd) => {
      vendorProfileMap[vd.userId.toString()] = {
        businessLogo: vd.businessLogo,
        businessName: vd.businessName,
      };
    });

    /*
     * ---------------------------------------------------------
     * BOOKINGS
     * ---------------------------------------------------------
     */

    const bookings = await BookingRequest.find({
      listingId: {
        $in: listingIds,
      },
    }).select("_id listingId");

    const bookingIds = bookings.map((booking) => booking._id);

    const bookingMap = {};

    bookings.forEach((booking) => {
      bookingMap[booking._id.toString()] = booking.listingId.toString();
    });

    /*
     * ---------------------------------------------------------
     * REVIEWS
     * ---------------------------------------------------------
     */

    const reviews = await Review.find({
      bookingId: {
        $in: bookingIds,
      },
    }).select("bookingId rating");

    const ratingData = {};

    reviews.forEach((review) => {
      const listingId = bookingMap[review.bookingId.toString()];

      if (!listingId) {
        return;
      }

      if (!ratingData[listingId]) {
        ratingData[listingId] = {
          totalRating: 0,
          count: 0,
        };
      }

      ratingData[listingId].totalRating += review.rating;

      ratingData[listingId].count += 1;
    });

    /*
     * ---------------------------------------------------------
     * ENRICH LISTINGS
     * ---------------------------------------------------------
     */

    const enrichListings = (listingArray) => {
      return listingArray.map((listing) => {
        const obj = listing.toObject();

        const id = obj._id.toString();

        const ratingInfo = ratingData[id] || {
          totalRating: 0,
          count: 0,
        };

        /*
         * Review statistics
         */
        obj.reviewStats = {
          average:
            ratingInfo.count > 0
              ? Number((ratingInfo.totalRating / ratingInfo.count).toFixed(1))
              : 0,

          totalReviews: ratingInfo.count,
        };

        /*
         * Vendor profile fields
         */
        const vendorId = obj.vendor?._id?.toString();

        if (obj.vendor) {
          const profile = vendorProfileMap[vendorId];

          obj.vendor.businessLogo = profile?.businessLogo || "";

          // The business name is a display-name fallback: User.fullName is
          // frequently unset, which would otherwise render as
          // "undefined undefined". Left undefined when the vendor has no
          // profile row so the client can fall back further up the chain.
          if (profile?.businessName) {
            obj.vendor.businessName = profile.businessName;
          }
        }

        return obj;
      });
    };

    /*
     * Enrich main listings
     */
    let enrichedListings = enrichListings(listings);

    /*
     * Enrich related listings
     */
    if (relatedListings) {
      relatedListings = enrichListings(relatedListings);
    }

    /*
     * ---------------------------------------------------------
     * REMOVE BLOCKED / INACTIVE VENDORS
     * ---------------------------------------------------------
     */

    enrichedListings = enrichedListings.filter(
      (listing) => listing.vendor?.isActive !== false,
    );

    if (relatedListings) {
      relatedListings = relatedListings.filter(
        (listing) => listing.vendor?.isActive !== false,
      );
    }

    /*
     * ---------------------------------------------------------
     * LOCATION / RADIUS FILTER
     * ---------------------------------------------------------
     */

    if (
      latitude !== undefined &&
      latitude !== null &&
      latitude !== "" &&
      longitude !== undefined &&
      longitude !== null &&
      longitude !== ""
    ) {
      const userLatitude = Number(latitude);
      const userLongitude = Number(longitude);

      const allowedRadius =
        radius !== undefined && radius !== null && radius !== ""
          ? Number(radius)
          : 100;

      const filterByRadius = (listingArray) => {
        return listingArray.filter((listing) => {
          const lat = listing.location?.coordinates?.latitude;

          const lng = listing.location?.coordinates?.longitude;

          /*
           * Listing without valid coordinates
           * cannot be included in radius search.
           */
          if (
            lat === undefined ||
            lat === null ||
            lng === undefined ||
            lng === null
          ) {
            return false;
          }

          const listingLatitude = Number(lat);
          const listingLongitude = Number(lng);

          if (isNaN(listingLatitude) || isNaN(listingLongitude)) {
            return false;
          }

          const distance = getDistanceInKm(
            userLatitude,
            userLongitude,
            listingLatitude,
            listingLongitude,
          );

          return distance <= allowedRadius;
        });
      };

      enrichedListings = filterByRadius(enrichedListings);

      if (relatedListings) {
        relatedListings = filterByRadius(relatedListings);
      }
    }

    /*
     * ---------------------------------------------------------
     * RELATED ITEMS FALLBACK
     * ---------------------------------------------------------
     *
     * If the selected subcategory has no listings:
     *
     * data = []
     *
     * But if other subcategories in the SAME category have
     * listings:
     *
     * relatedItems = [...]
     *
     * If there are no other listings:
     *
     * relatedItems = null
     */

    if (relatedListings && relatedListings.length === 0) {
      relatedListings = null;
    }

    /*
     * ---------------------------------------------------------
     * RESPONSE
     * ---------------------------------------------------------
     */

    return res.status(200).json({
      success: true,

      // Main search results
      count: enrichedListings.length,

      data: enrichedListings,

      // Other subcategories within same main category
      relatedItems: relatedListings,
    });
  } catch (error) {
    console.error("Search listings error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to search listings",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const fetchAllListings = async (req, res) => {
  try {
    const approvalSettings = await getApprovalSettings();

    const listings = await Listing.find({
      isActive: true,
      ...getPublicListingApprovalFilter(approvalSettings),
    }).sort({
      createdAt: -1,
    });
    res.status(200).json({
      success: true,
      data: listings.map((doc) => doc.toObject()),
    });
  } catch (error) {
    console.error("Fetch all listings error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch listings",
    });
  }
};

module.exports = {
  getListings,
  getListingById,
  getFeaturedListings,
  getPopularListings,
  searchListings,
  getListingsByVendor,
  checkListingAvailability,
  getListingCalendar,
  filterListings,
  getHomeData,
  getSubCategoryByName,
  fetchAllListings,
};
