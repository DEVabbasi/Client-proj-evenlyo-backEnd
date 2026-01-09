const Listing = require("../../models/Listing");
const Category = require("../../models/Category");
const SubCategory = require("../../models/SubCategory");
const Vendor = require("../../models/Vendor");
const BookingRequest = require("../../models/Booking");
const ServiceItem = require("../../models/Item");
const Cart = require("../../models/Cart");
const { verifyAccessToken } = require("../../utils/jwtUtils");
const Item = require("../../models/Item");
const User = require("../../models/User");
const Settings = require("../../models/Settings");
const Review = require("../../models/Review")
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
      "details.startDate details.endDate details.startTime details.endTime"
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
        ])
      ).values()
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
    if (city) {
      query["location.city"] = { $regex: city, $options: "i" };
    }

    // Search by title, description, or tags
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { shortDescription: { $regex: search, $options: "i" } },
        { tags: { $in: [new RegExp(search, "i")] } },
      ];
    }

    // Filter by price range (check all pricing options)
    if (minPrice || maxPrice) {
      const priceQuery = { $or: [] };

      if (minPrice) {
        priceQuery.$or.push(
          { "pricing.perHour": { $gte: parseFloat(minPrice) } },
          { "pricing.perDay": { $gte: parseFloat(minPrice) } },
          { "pricing.perEvent": { $gte: parseFloat(minPrice) } }
        );
      }

      if (maxPrice) {
        priceQuery.$or.push(
          { "pricing.perHour": { $lte: parseFloat(maxPrice) } },
          { "pricing.perDay": { $lte: parseFloat(maxPrice) } },
          { "pricing.perEvent": { $lte: parseFloat(maxPrice) } }
        );
      }

      if (priceQuery.$or.length > 0) {
        query.$and = query.$and || [];
        query.$and.push(priceQuery);
      }
    }

    // Filter by pricing type
    if (pricingType) {
      query["pricing.type"] = pricingType;
    }

    // Filter by featured status
    if (isFeatured !== undefined) {
      query.isFeatured = isFeatured === "true";
    }

    // Filter by availability
    if (isAvailable !== undefined) {
      query["availability.isAvailable"] = isAvailable === "true";
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Build sort object
    const sortOptions = {};
    if (sortBy === "price") {
      // Sort by lowest available price option
      sortOptions["pricing.perHour"] = sortOrder === "desc" ? -1 : 1;
    } else if (sortBy === "rating") {
      sortOptions["ratings.average"] = sortOrder === "desc" ? -1 : 1;
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
        "name icon escrowEnabled upfrontFeePercent upfrontHour evenlyoProtectFeePercent"
      )
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .select("-seo -__v -contact.email -contact.phone"); // Hide contact info in list view

    // Attach payment policy (from subcategory) to each listing
    const listings = listingsDocs.map((doc) => {
      console.log(doc, "docdocdocdoc");

      const obj = doc.toObject();
      const sc = obj.subCategory || {};
      obj.paymentPolicy = {
        escrowEnabled: !!sc.escrowEnabled,
      };
      return obj;
    });

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
        "_id email contactNumber firstName lastName accountType address"
      )
      .populate("category", "name icon description")
      .populate(
        "subCategory",
        "name icon description isUpfrontEnabled upfrontFeePercent escrowHours isEvenlyoProtectEnabled evenlyoProtectFeePercent"
      )
      .populate("reviews.clientId", "firstName lastName profileImage");
    console.log(listing, "listinglistinglisting");

    const bookings = await BookingRequest
      .find({ listingId: req.params.id })
      .select("_id");

    const bookingIds = bookings.map(b => b._id);

    const ddd = await Review.aggregate([
      {
        $match: {
          bookingId: { $in: bookingIds }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "vendorId",
          foreignField: "_id",
          as: "vendor"
        }
      },
      { $unwind: "$vendor" },
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
                firstName: "$vendor.firstName",
                lastName: "$vendor.lastName",
                image: "$vendor.image"
              }
            }
          }
        }
      }
    ]);
    console.log(ddd, "ddddddddd");


    if (listing.status !== "active") {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    // Increment view count
    listing.views += 1;
    await listing.save();

    // Include contact information for detailed view and attach payment policy from subcategory
    const data = listing.toObject();
    const sc = data.subCategory || {};
    console.log(sc, "scscscscscsc");


    let settings = await Settings.findOne()

    data.paymentPolicy = sc
    data.settings = settings
    data.reviews = ddd
    res.json({
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

    res.status(500).json({
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
      "details.startDate details.endDate status trackingId details.duration"
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
        "title description pricing location ratings images media.featuredImage"
      );

    // Get total count for pagination
    const total = await Listing.countDocuments(query);
    let settings = await Settings.findOne()
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
        location: `${listing.location.city}${listing.location.region ? ", " + listing.location.region : ""
          }`,
        featuredImage: listing.images?.[0] || "",
        images: listing.images || [],
        category: listing.category?.name,
        subCategory: listing.subCategory?.name,
        settings,
        paymentPolicy: sc
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
const getListingsAndVendorsByCategory = async (req, res) => {
  try {
    const {
      categoryId,
      subCategoryId,
      subcategoryId, // Alternative parameter name for compatibility
      page = 1,
      limit = 12,
      includeListings = true,
      includeVendors = true,
      includeSaleItems = true,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Use either subCategoryId or subcategoryId (for compatibility)
    const finalSubCategoryId = subCategoryId || subcategoryId;

    // Validate input
    if (!categoryId && !finalSubCategoryId) {
      return res.status(400).json({
        success: false,
        message: "Either categoryId or subCategoryId/subcategoryId is required",
      });
    }

    // Validate that at least one type of data is requested
    if (
      includeListings === "false" &&
      includeVendors === "false" &&
      includeSaleItems === "false"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "At least one of includeListings, includeVendors, or includeSaleItems must be true",
      });
    }

    // Build query object for listings
    const listingQuery = {
      status: "active",
      isActive: true,
    };

    // Filter by category
    if (categoryId) {
      listingQuery.category = categoryId;
    }

    // Filter by subcategory
    if (finalSubCategoryId) {
      listingQuery.subCategory = finalSubCategoryId;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Build sort object
    const sortOptions = {};
    if (sortBy === "rating") {
      sortOptions["ratings.average"] = sortOrder === "desc" ? -1 : 1;
    } else if (sortBy === "popularity") {
      sortOptions["bookings.completed"] = sortOrder === "desc" ? -1 : 1;
    } else {
      sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;
    }

    const results = {};

    // Resolve current user id (public route: optionally from req.user or Bearer token)
    let currentUserId = null;
    if (req.user && (req.user.id || req.user._id)) {
      currentUserId = req.user.id || req.user._id;
    } else if (req.userId) {
      currentUserId = req.userId;
    } else {
      const authHeader =
        req.headers["authorization"] || req.headers["Authorization"];
      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const token = authHeader.substring(7);
          const decoded = verifyAccessToken(token);
          if (decoded && decoded.id) currentUserId = decoded.id;
        } catch (e) {
          // ignore invalid token on public route
        }
      }
    }

    // Fetch cart for logged-in user (if any)
    let cartItems = [];
    if (currentUserId) {
      const cartDoc = await Cart.findOne({ userId: currentUserId }).select(
        "items"
      );
      if (cartDoc && Array.isArray(cartDoc.items)) {
        cartItems = [cartDoc];
      }
    }

    // Flatten cart items for easier consumption
    let cartItemList = [];
    let cartListingIdSet = new Set();
    if (cartItems && cartItems.length > 0) {
      cartItems.forEach((cart) => {
        if (Array.isArray(cart.items)) {
          cart.items.forEach((item) => {
            // Use raw listingId for matching
            if (item.listingId) {
              cartListingIdSet.add(String(item.listingId));
            }
            cartItemList.push({
              listingId: item.listingId?._id || item.listingId || null,
              serviceItemId:
                item.serviceItemId?._id || item.serviceItemId || null,
              quantity: item.quantity || 1,
              title: item.listingId?.title || item.serviceItemId?.title || "",
              image:
                item.listingId?.images?.[0] ||
                item.serviceItemId?.images?.[0] ||
                "",
              price:
                item.listingId?.pricing?.perEvent ||
                item.serviceItemId?.sellingPrice ||
                "",
            });
          });
        }
      });
    }

    // Fetch listings if requested
    if (includeListings === "true" || includeListings === true) {
      const listings = await Listing.find(listingQuery)
        .populate(
          "vendor",
          "firstName lastName _id businessName businessLocation businessLogo bannerImage userId"
        )
        .populate("category", "name icon")
        .populate("subCategory", "name icon")
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .select("-seo -__v -contact.email -contact.phone");

      // Use cartListingIdSet for quick lookup
      console.log("Cart listing IDs:", Array.from(cartListingIdSet));
      console.log(
        "Listings returned:",
        listings.map((l) => String(l._id))
      );

      // Add isFavourite boolean to each listing (compare as strings)
      const listingsWithCartFlag = listings.map((listing) => {
        const obj = listing.toObject();
        obj.isFavourite = cartListingIdSet.has(String(listing._id));
        if ("isFavorite" in obj) {
          delete obj.isFavorite;
        }
        if (!obj.isFavourite) {
          console.log(`Listing ${obj._id} is NOT in cart.`);
        } else {
          console.log(`Listing ${obj._id} is in cart.`);
        }
        return obj;
      });

      const totalListings = await Listing.countDocuments(listingQuery);

      results.listings = {
        data: listingsWithCartFlag,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(totalListings / limit),
          total: totalListings,
          limit: parseInt(limit),
        },
      };
    }

    // Fetch vendors if requested
    if (includeVendors === "true" || includeVendors === true) {
      // Build vendor query based on their mainCategories and subCategories fields
      const vendorQuery = {
        isApproved: true, // Use isApproved instead of isActive for vendors
      };

      // Build query conditions
      const queryConditions = [];

      // If both category and subcategory are provided
      if (categoryId && finalSubCategoryId) {
        queryConditions.push({
          $and: [
            { mainCategories: { $in: [categoryId] } },
            { subCategories: { $in: [finalSubCategoryId] } },
          ],
        });
      }
      // If only category is provided
      else if (categoryId) {
        queryConditions.push({
          mainCategories: { $in: [categoryId] },
        });
      }
      // If only subcategory is provided
      else if (finalSubCategoryId) {
        queryConditions.push({
          subCategories: { $in: [finalSubCategoryId] },
        });
      }

      // Add the conditions to the main query
      if (queryConditions.length > 0) {
        vendorQuery.$or = queryConditions;
      }

      console.log("Vendor Query:", JSON.stringify(vendorQuery, null, 2));

      const vendorSortOptions = {};
      vendorSortOptions[sortBy === "rating" ? "rating.average" : sortBy] =
        sortOrder === "desc" ? -1 : 1;
      console.log(vendorQuery, "vendorQueryvendorQueryvendorQueryvendorQuery");
      const vendors = await Vendor.find(vendorQuery)
        .populate("userId", "firstName lastName email profileImage")
        .populate("mainCategories", "name icon")
        .populate("subCategories", "name icon")
        .sort(vendorSortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .select(
          "-__v -businessEmail -businessPhone -passportDetails -kvkNumber"
        ); // Hide sensitive info

      console.log("Found Vendors:", vendors.length);

      const totalVendors = await Vendor.countDocuments(vendorQuery);

      results.vendors = {
        data: vendors,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(totalVendors / limit),
          total: totalVendors,
          limit: parseInt(limit),
        },
      };
    }

    // Fetch sale items if requested
    if (includeSaleItems === "true" || includeSaleItems === true) {
      // Build sale items query based on mainCategory and subCategory fields
      const saleItemsQuery = {};

      // Filter by category
      if (categoryId) {
        saleItemsQuery.mainCategory = categoryId;
      }

      // Filter by subcategory
      if (finalSubCategoryId) {
        saleItemsQuery.subCategory = finalSubCategoryId;
      }

      // Build sort options for sale items
      const saleItemsSortOptions = {};
      if (sortBy === "price") {
        saleItemsSortOptions["sellingPrice"] = sortOrder === "desc" ? -1 : 1;
      } else {
        saleItemsSortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;
      }

      console.log("Sale Items Query:", JSON.stringify(saleItemsQuery, null, 2));

      const saleItems = await ServiceItem.find(saleItemsQuery)
        .populate({
          path: "vendor",
          select: "-password", // vendor ka sab kuch except password
        })
        .populate({
          path: "linkedListing",
          select: "title",
        })
        .sort(saleItemsSortOptions)
        .skip(skip)
        .limit(Number(limit))
        .select("-__v");

      const totalSaleItems = await ServiceItem.countDocuments(saleItemsQuery);

      results.saleItems = {
        data: saleItems,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(totalSaleItems / limit),
          total: totalSaleItems,
          limit: parseInt(limit),
        },
      };
    }

    // Get category and subcategory info for context
    const categoryInfo = categoryId
      ? await Category.findById(categoryId).select("name icon description")
      : "";
    const subCategoryInfo = finalSubCategoryId
      ? await SubCategory.findById(finalSubCategoryId)
        .populate("mainCategory", "name")
        .select("name icon description mainCategory")
      : "";
    const otherSaleItems = await Item.find({
      mainCategory: null,
      subCategory: null,
    }).populate({
      path: "vendor",
      select: "-password", // sab kuch aayega except password
    });
    console.log(otherSaleItems, "otherSaleItemsotherSaleItems");
    const settings = await Settings.findOne()
    res.json({
      success: true,
      data: results,
      cartItems: cartItemList,
      categoryInfo,
      subCategoryInfo,
      otherSaleItems,
      saleItemPlatformFees: settings.salesItemPlatformFee
    });
  } catch (error) {
    console.error("Error fetching listings and vendors by category:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching listings and vendors by category",
      error: error.message,
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
  getListingsAndVendorsByCategory,
};
