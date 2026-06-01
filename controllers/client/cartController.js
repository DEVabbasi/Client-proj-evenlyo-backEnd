const asyncHandler = require("express-async-handler");
const Cart = require("../../models/Cart");
const Listing = require("../../models/Listing");
const BookingRequest = require("../../models/Booking");
const Vendor = require("../../models/Vendor");

// Helper function to create listing snapshot
const createListingSnapshot = (listing) => {
  return {
    title: listing.title,
    featuredImage: listing.media?.featuredImage,
    pricing: {
      type: listing.pricing?.type,
      perHour: listing.pricing?.perHour,
      perDay: listing.pricing?.perDay,
      perEvent: listing.pricing?.perEvent,
      currency: listing.pricing?.currency || "EUR",
    },
    vendorId: listing.vendor,
  };
};

// Helper function to check listing availability
const checkAvailability = async (listingId, startDate, endDate) => {
  // Check for overlapping bookings that are not rejected or cancelled
  const overlappingBookings = await BookingRequest.find({
    listingId,
    status: { $nin: ["rejected", "cancelled"] },
    $or: [
      {
        "details.startDate": { $lte: endDate },
        "details.endDate": { $gte: startDate },
      },
    ],
  });

  return overlappingBookings.length === 0;
};

// @desc    Add item to user cart
// @route   POST /api/cart/add
// @access  Private (User)
const addToCart = asyncHandler(async (req, res) => {
  const { listingId, tempDetails } = req.body;

  if (!listingId) {
    return res.status(400).json({
      success: false,
      message: "Listing ID is required",
    });
  }

  // Check if listing exists and is active
  const listing = await Listing.findOne({
    _id: listingId,
    isActive: true,
    status: "active",
  }).populate("vendor");

  if (!listing) {
    return res.status(404).json({
      success: false,
      message: "Listing not found or not available",
    });
  }

  // Get or create user's cart
  let cart = await Cart.findOne({ userId: req.user.id });
  if (!cart) {
    cart = new Cart({ userId: req.user.id, items: [] });
  }

  // Check if item is already in cart
  const alreadyInCart = cart.items.some(
    (item) => item.listingId.toString() === listingId
  );
  if (alreadyInCart) {
    await cart.populate(
      "items.listingId",
      "title featuredImage pricing vendor"
    );
    return res.status(400).json({
      success: false,
      message: {
        en: "Item is already in cart",
        nl: "Item zit al in de winkelmand",
      },
      data: cart.items,
    });
  }

  // Create listing snapshot
  const listingSnapshot = createListingSnapshot(listing);

  // Add item to cart
  await cart.addItem(listingId, listingSnapshot, tempDetails);

  // Populate cart for response
  await cart.populate("items.listingId", "title featuredImage pricing vendor");

  res.status(201).json({
    success: true,
    message: {
      en: "Item added to cart successfully",
      nl: "Item succesvol toegevoegd aan winkelmand",
    },
    data: cart.items,
  });
});

// @desc    Get user's cart
// @route   GET /api/cart
// @access  Private (User)
const getCart = asyncHandler(async (req, res) => {
  console.log(req.user.id, "asdas");

  let cart = await Cart.findOne({ userId: req.user.id }).populate({
    path: "items.listingId",
    populate: {
      path: "vendor",
    },
  });

  // const listingsDocs = await Listing.find(query).populate(
  //   "subCategory",
  //   "name icon escrowEnabled upfrontFeePercent upfrontHour evenlyoProtectFeePercent"
  // );
  console.log(cart, "cartcartcartcartcartcart");

  if (!cart) {
    cart = new Cart({ userId: req.user.id, items: [] });
    await cart.save();
  }

  // Filter out any items that reference inactive or deleted listings
  const validItems = cart.items.filter(
    (item) =>
      item.listingId &&
      item.listingId.isActive &&
      item.listingId.status === "active"
  );

  // Update cart if invalid items were found
  if (validItems.length !== cart.items.length) {
    cart.items = validItems;
    await cart.save();
  }

  res.json({
    success: true,
    data: cart.items,
  });
});

// @desc    Remove item from cart
// @route   DELETE /api/cart/:listingId
// @access  Private (User)
const removeFromCart = asyncHandler(async (req, res) => {
  const { listingId } = req.params;

  const cart = await Cart.findOne({ userId: req.user.id });
  if (!cart) {
    return res.status(404).json({
      success: false,
      message: "Cart not found",
    });
  }

  await cart.removeItem(listingId);

  // Populate cart for response
  await cart.populate({
    path: "items.listingId",
    select: "title featuredImage pricing vendor",
    populate: {
      path: "vendor",
      select: "businessName",
    },
  });

  res.json({
    success: true,
    message: "Item removed from cart successfully",
    data: {
      cart,
    },
  });
});

// @desc    Update item details in cart
// @route   PUT /api/cart/:listingId
// @access  Private (User)
const updateCartItem = asyncHandler(async (req, res) => {
  const { listingId } = req.params;
  const {
    startDate,
    endDate,
    startTime,
    endTime,
    eventLongitude,
    eventLocation,
    description,
    eventLatitude,
  } = req.body;

  // Validation
  if (!startDate || !eventLocation) {
    return res.status(400).json({
      success: false,
      message: "startDate and location are required.",
    });
  }

  let isMultiDay = false;
  let start = new Date(startDate);
  let end = endDate ? new Date(endDate) : start;
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  isMultiDay = diffDays > 1;

  if (!isMultiDay && (!startTime || !endTime)) {
    return res.status(400).json({
      success: false,
      message: "startTime and endTime are required for single-day events.",
    });
  }

  const cart = await Cart.findOne({ userId: req.user.id });
  if (!cart) {
    return res.status(404).json({
      success: false,
      message: "Cart not found",
    });
  }

  // Prepare tempDetails conditionally
  let tempDetails = {
    eventLocation: eventLocation,
    eventLatitude: eventLatitude,
    eventLongitude: eventLongitude,
    description: description || "",
  };

  if (isMultiDay) {
    // Multi-day event
    tempDetails.startDate = startDate;
    tempDetails.endDate = endDate || startDate;
  } else {
    // Single-day event
    tempDetails.startDate = startDate;
    tempDetails.endDate = startDate;
    tempDetails.startTime = startTime;
    tempDetails.endTime = endTime;
  }

  try {
    await cart.updateItemDetails(listingId, tempDetails);

    // Populate cart for response
    await cart.populate({
      path: "items.listingId",
      select: "title featuredImage pricing vendor",
      populate: {
        path: "vendor",
        select: "businessName",
      },
    });

    res.json({
      success: true,
      message: "Cart item updated successfully",
      data: {
        cart,
      },
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
});

/// @desc Submit all cart items as booking requests
/// @route POST /api/cart/submit
/// @access Private (User)
const submitCart = asyncHandler(async (req, res) => {
  const { startDate, endDate, listingIds } = req.body;
  const cart = await Cart.findOne({ userId: req.user.id }).populate(
    "items.listingId",
    "title pricing vendor isActive status"
  );

  if (!cart || cart.items.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Cart is empty",
    });
  }

  // If listingIds provided, filter items; else process all
  let itemsToProcess = cart.items;
  if (Array.isArray(listingIds) && listingIds.length > 0) {
    itemsToProcess = cart.items.filter((item) =>
      listingIds.includes(item.listingId._id.toString())
    );
  }

  if (itemsToProcess.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No valid listings selected for booking request.",
    });
  }

  const bookingResults = [];
  const errors = [];

  // Process each selected cart item
  for (const cartItem of itemsToProcess) {
    try {
      const listing = cartItem.listingId;
      const tempDetails = cartItem.tempDetails;

      // Validate listing is still active
      if (!listing || !listing.isActive || listing.status !== "active") {
        errors.push({
          listingId: listing?._id,
          listingTitle: listing?.title,
          error: "Listing is no longer available",
        });
        continue;
      }

      // Use startDate and endDate from req.body, fallback to tempDetails if not provided
      const bookingStartDate = startDate || tempDetails.startDate;
      const bookingEndDate = endDate || tempDetails.endDate || bookingStartDate;

      if (!bookingStartDate || !bookingEndDate || !tempDetails.eventLocation) {
        errors.push({
          listingId: listing._id,
          listingTitle: listing.title,
          error: "Missing required booking details (date, location)",
        });
        continue;
      }

      // Check availability
      const start = new Date(bookingStartDate);
      const end = new Date(bookingEndDate);
      const isAvailable = await checkAvailability(listing._id, start, end);
      if (!isAvailable) {
        errors.push({
          listingId: listing._id,
          listingTitle: listing.title,
          error: "Selected dates are not available",
        });
        continue;
      }

      // Calculate duration
      const diffTime = Math.abs(end - start);
      const diffDays = Math.max(
        1,
        Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
      );
      const isMultiDay = diffDays > 1;

      // Calculate hours per day (use 24h for multi-day, or fallback to 1h)
      const dailyHours = isMultiDay ? 24 : 1;
      const totalHours = dailyHours * diffDays;

      // Pricing calculation
      let bookingPrice = 0;
      if (listing.pricing.type === "daily") {
        bookingPrice = listing.pricing.amount * diffDays;
      } else if (listing.pricing.type === "hourly") {
        bookingPrice = listing.pricing.amount * totalHours;
      } else if (listing.pricing.type === "per_event") {
        bookingPrice = listing.pricing.amount * (isMultiDay ? diffDays : 1);
      }

      // Apply multi-day discounts if configured
      if (isMultiDay && listing.pricing.multiDayDiscount) {
        const discountPercent = listing.pricing.multiDayDiscount.percent || 0;
        const minDays = listing.pricing.multiDayDiscount.minDays || 2;
        if (diffDays >= minDays) {
          const discount = (bookingPrice * discountPercent) / 100;
          bookingPrice = bookingPrice - discount;
        }
      }

      // Create booking request
      const bookingRequest = new BookingRequest({
        userId: req.user.id,
        vendorId: listing.vendor,
        listingId: listing._id,
        details: {
          startDate: bookingStartDate,
          endDate: bookingEndDate,
          eventLocation: tempDetails.eventLocation,
          eventType: tempDetails.eventType,
          guestCount: tempDetails.guestCount,
          specialRequests: tempDetails.specialRequests,
          contactPreference: tempDetails.contactPreference || "email",
        },
        pricing: {
          bookingPrice,
          securityPrice: listing.pricing.securityFee || 0,
          totalPrice: bookingPrice + (listing.pricing.securityFee || 0),
          ...(isMultiDay && {
            dailyRate: Math.round(bookingPrice / diffDays),
            multiDayDiscount: listing.pricing.multiDayDiscount || "",
          }),
        },
      });

      await bookingRequest.save();
      await bookingRequest.populate([
        {
          path: "vendorId",
          select: "businessName businessEmail businessPhone",
        },
        { path: "listingId", select: "title featuredImage pricing" },
      ]);

      bookingResults.push({
        bookingId: bookingRequest._id,
        listingTitle: listing.title,
        totalPrice: bookingRequest.pricing.totalPrice,
        status: "success",
      });
    } catch (error) {
      errors.push({
        listingId: cartItem.listingId?._id,
        listingTitle: cartItem.listingId?.title,
        error: error.message,
      });
    }
  }

  // Remove only processed items from cart if any bookings were created successfully
  if (bookingResults.length > 0) {
    cart.items = cart.items.filter(
      (item) =>
        !itemsToProcess.some(
          (proc) =>
            proc.listingId._id.toString() === item.listingId._id.toString()
        )
    );
    await cart.save();
  }

  res.json({
    success: bookingResults.length > 0,
    message: `${bookingResults.length} booking requests created successfully`,
    data: {
      successfulBookings: bookingResults,
      errors: errors,
      summary: {
        total: cart.items.length + bookingResults.length,
        successful: bookingResults.length,
        failed: errors.length,
      },
    },
  });
});

// @desc    Clear user's cart
// @route   DELETE /api/cart
// @access  Private (User)
const clearCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ userId: req.user.id });
  if (!cart) {
    return res.status(404).json({
      success: false,
      message: "Cart not found",
    });
  }

  await cart.clearCart();

  res.json({
    success: true,
    message: "Cart cleared successfully",
    data: {
      cart,
    },
  });
});

const addToCart2 = asyncHandler(async (req, res) => {
  const { listingId, tempDetails } = req.body;

  if (!listingId) {
    return res.status(400).json({
      success: false,
      message: "Listing ID is required",
    });
  }

  // Get or create user's cart
  let cart = await Cart.findOne({ userId: req.user.id });
  if (!cart) {
    cart = new Cart({ userId: req.user.id, items: [] });
  }

  // Toggle: if item exists -> remove, else -> add
  const alreadyInCart = cart.items.some(
    (item) => item.listingId.toString() === listingId
  );

  if (alreadyInCart) {
    // Remove item without requiring listing to still be active
    await cart.removeItem(listingId);
    await cart.populate(
      "items.listingId",
      "title featuredImage pricing vendor"
    );
    return res.status(200).json({
      success: true,
      message: "Item removed from cart successfully",
      data: cart.items,
    });
  }

  // Otherwise, validate listing is available before adding
  const listing = await Listing.findOne({
    _id: listingId,
    isActive: true,
    status: "active",
  }).populate("vendor");

  if (!listing) {
    return res.status(404).json({
      success: false,
      message: "Listing not found or not available",
    });
  }

  // Create listing snapshot
  const listingSnapshot = createListingSnapshot(listing);

  // Add item to cart
  await cart.addItem(listingId, listingSnapshot, tempDetails);

  // Populate cart for response
  await cart.populate("items.listingId", "title featuredImage pricing vendor");

  return res.status(201).json({
    success: true,
    message: {
      en: "Item added to cart successfully",
      nl: "Item succesvol toegevoegd aan winkelmand",
    },
    data: cart.items,
  });
});

module.exports = {
  addToCart,
  getCart,
  removeFromCart,
  updateCartItem,
  submitCart,
  clearCart,
  addToCart2,
};
