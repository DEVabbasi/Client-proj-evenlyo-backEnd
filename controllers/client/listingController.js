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

    // Build query object
    const query = {
      status: status,
      isActive: true,
    };

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
    // const sortOptions = {};
    // if (sortBy === "price") {
    //   // Sort by lowest available price option
    //   sortOptions["pricing.perHour"] = sortOrder === "desc" ? -1 : 1;
    // } else if (sortBy === "rating") {
    //   sortOptions["ratings.average"] = sortOrder === "desc" ? -1 : 1;
    // } else if (sortBy === "popularity") {
    //   sortOptions["bookings.completed"] = sortOrder === "desc" ? -1 : 1;
    // } else {
    //   sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;
    // }

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
    // 2️⃣ Get Bookings for these listings
    const bookings = await BookingRequest.find({
      listingId: { $in: listingIds },
    }).select("_id listing");

    const bookingIds = bookings.map((b) => b._id);
    console.log(bookingIds, "bookingIdsbookingIdsbookingIdsbookingIds");
    const bookingMap = {};
    bookings.forEach((b) => {
      bookingMap[b._id.toString()] = b.listing.toString();
    });

    // 3️⃣ Get Reviews for these bookings
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

    // ❌ Agar listing hi nahi mili
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    // ✅ Vendor logo fetch
    let businessLogo = "";
    if (listing.vendor?._id) {
      const vendorDetails = await Vendor.findOne({
        userId: listing.vendor._id,
      }).select("businessLogo");

      businessLogo = vendorDetails?.businessLogo || "";
    }

    // ✅ Booking IDs
    const bookings = await BookingRequest.find({
      listingId: req.params.id,
    }).select("_id");

    const bookingIds = bookings.map((b) => b._id);

    // ✅ Reviews aggregation
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

    // ✅ Safe reviews object
    const reviewsData = reviewAgg[0] || {
      averageRating: 0,
      totalReviews: 0,
      reviews: [],
    };

    // ✅ Views increment safe
    listing.views = (listing.views || 0) + 1;
    await listing.save();

    // ✅ Convert object
    const data = listing.toObject();

    // ✅ Attach extra data
    data.vendor = data.vendor || {};
    data.vendor.businessLogo = businessLogo;

    const sc = data.subCategory || {};
    const settings = await Settings.findOne();

    // ✅ IMPORTANT: toggle flag for frontend
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

    const query = {
      isFeatured: true,
      status: "active",
      isActive: true,
      "availability.isAvailable": true,
    };

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
      data: listings,
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

    const query = {
      status: "active",
      isActive: true,
      popular: true,
    };

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

    // Build query object
    const query = {
      status: "active",
      isActive: true,
      "availability.isAvailable": true,
    };

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
      data: listings,
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
    const vendor = await User.findById({ _id: vendorId });
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not",
      });
    }

    const query = {
      vendor: vendorId,
      isActive: true,
    };

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
      data: listings,
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

    // Build query object
    const query = {
      status: "active",
      isActive: true,
      "availability.isAvailable": true,
    };

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

// @desc    Get listings, vendors, and sale items by category and subcategory
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

    const query = {
      isActive: true,
    };

    // ✅ Category filter
    if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
      query.category = categoryId;
    }

    // ✅ Subcategory filter
    if (subCategoryId && mongoose.Types.ObjectId.isValid(subCategoryId)) {
      query.subCategory = subCategoryId;
    }

    // ✅ Availability filter
    if (date) {
      const dayKey = getDayKey(date);
      query["availability.availableDays"] = dayKey;
    }

    // 1️⃣ Fetch listings
    const listings = await Listing.find(query)
      .populate("vendor", "firstName rating")
      .populate("category", "name")
      .populate("subCategory", "name")
      .select(
        "title description pricing location ratings images media.featuredImage availability vendor",
      );

    const listingIds = listings.map((l) => l._id);

    // ✅ 2️⃣ GET ALL VENDOR IDS
    const vendorIds = listings.map((l) => l.vendor?._id).filter(Boolean);

    // ✅ 3️⃣ FETCH ALL VENDOR DETAILS (ONE QUERY)
    const vendorDetails = await Vendor.find({
      userId: { $in: vendorIds },
    }).select("userId businessLogo");

    // ✅ CREATE MAP userId → businessLogo
    const vendorLogoMap = {};
    vendorDetails.forEach((vd) => {
      vendorLogoMap[vd.userId.toString()] = vd.businessLogo;
    });

    // 4️⃣ BOOKINGS
    const bookings = await BookingRequest.find({
      listingId: { $in: listingIds },
    }).select("_id listingId");

    const bookingIds = bookings.map((b) => b._id);

    // bookingId → listingId map
    const bookingMap = {};
    bookings.forEach((b) => {
      bookingMap[b._id.toString()] = b.listingId.toString();
    });

    // 5️⃣ REVIEWS
    const reviews = await Review.find({
      bookingId: { $in: bookingIds },
    }).select("bookingId rating");

    // 6️⃣ CALCULATE RATINGS
    const ratingData = {};
    reviews.forEach((review) => {
      const listingId = bookingMap[review.bookingId.toString()];
      if (!listingId) return;

      if (!ratingData[listingId]) {
        ratingData[listingId] = {
          totalRating: 0,
          count: 0,
        };
      }

      ratingData[listingId].totalRating += review.rating;
      ratingData[listingId].count += 1;
    });

    // 7️⃣ FINAL RESPONSE BUILD
    let enrichedListings = listings.map((listing) => {
      const obj = listing.toObject();
      const id = obj._id.toString();

      const ratingInfo = ratingData[id] || {
        totalRating: 0,
        count: 0,
      };

      // ✅ ADD REVIEWS
      obj.reviewStats = {
        average:
          ratingInfo.count > 0
            ? Number((ratingInfo.totalRating / ratingInfo.count).toFixed(1))
            : 0,
        totalReviews: ratingInfo.count,
      };

      // ✅ ADD BUSINESS LOGO
      const vendorId = obj.vendor?._id?.toString();
      obj.vendor.businessLogo = vendorLogoMap[vendorId] || "";

      return obj;
    });

    // 8️⃣ LOCATION FILTER
    if (latitude && longitude) {
      const allowedRadius = radius || 100;

      enrichedListings = enrichedListings.filter((listing) => {
        const lat = listing.location?.coordinates?.latitude;
        const lng = listing.location?.coordinates?.longitude;
        if (!lat || !lng) return false;

        const distance = getDistanceInKm(latitude, longitude, lat, lng);
        return distance <= allowedRadius;
      });
    }

    res.status(200).json({
      success: true,
      count: enrichedListings.length,
      data: enrichedListings,
    });
  } catch (error) {
    console.error("Search listings error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search listings",
    });
  }
};

const fetchAllListings = async (req, res) => {
  try {
    const listings = await Listing.find({ isActive: true });
    res.status(200).json({
      success: true,
      data: listings,
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
