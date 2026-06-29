const asyncHandler = require("express-async-handler");
const notificationController = require("../notificationController");
const BookingRequest = require("../../models/Booking");
const Listing = require("../../models/Listing");
const User = require("../../models/User");
const Vendor = require("../../models/Vendor");
const Review = require("../../models/Review");
const Cart = require("../../models/Cart"); // path apne project ke mutabiq adjust karo
const StockLog = require("../../models/StockLog");
const AdminEmployee = require("../../models/AdminEmployee");
const Settings = require("../../models/Settings");
const {
  checkAvailability,
  calculateFullBookingPrice,
  checkListingStock,
  getListingPaymentPolicy,
} = require("../../utils/bookingUtils");
const { toMultilingualText } = require("../../utils/textUtils");
const stripe = require("../../config/stripe");
const Booking = require("../../models/Booking");
const mongoose = require("mongoose");
const { resolveVendorUserId } = require("../../utils/resolveVendorUserId");
const { notifyVendorNewBooking } = require("../../utils/notifyVendorNewBooking");
const SupportTicket = require("../../models/SupportTicket");
const {
  sendEvenlyoProtectBookingEmail,
  sendVendorCancellationEmail,
} = require("../../utils/mailer");
const { createActivityLog } = require("../../utils/activityLogger");
const { getVendorDisplayName } = require("../../utils/vendorDisplayName");

const momentTime = require("moment-timezone");
// @desc    Create Stripe PaymentIntent for a booking
// @route   POST /api/booking/:id/create-payment-intent
// @access  Private (User)
const createBookingPaymentIntent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Find the booking by ID and user
  const booking = await BookingRequest.findOne({
    _id: id,
    userId: req.user.id,
  });
  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found",
    });
  }
  // Get amount from booking (assume pricing.totalPrice exists)
  const amount = Math.round((booking.pricing?.totalPrice || 0) * 100); // cents
  if (!amount || amount < 1) {
    return res.status(400).json({
      success: false,
      message: "Invalid booking amount",
    });
  }
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "eur",
      metadata: {
        bookingId: booking._id ? booking._id.toString() : "",
        userId: booking.userId
          ? booking.userId._id
            ? booking.userId._id.toString()
            : booking.userId.toString()
          : "",
      },
    });
    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

const restockItem = asyncHandler(async (req, res) => {
  const { id } = req.params; // bookingId
  const userId = req.user.id;

  // 1. Validate booking exists and belongs to user
  const booking = await Booking.findOne({ trackingId: id });
  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found",
    });
  }
  // 2. Check if stock already updated
  if (booking.claimDetails?.stockUpdated === true) {
    return res.status(400).json({
      success: false,
      message: "Stock already updated for this booking",
    });
  }

  // 3. Get item details (assuming booking contains itemId + quantity)
  const itemId = booking.listingId;
  const quantity = 1;

  if (!itemId) {
    return res.status(400).json({
      success: false,
      message: "ItemId not found in booking",
    });
  }

  const item = await Listing.findById({ _id: itemId });
  if (!item) {
    return res.status(404).json({
      success: false,
      message: "Item not found",
    });
  }

  // 4. Restock the item
  item.quantity = (item.quantity || 0) + quantity;
  await item.save();
  // 5. Mark stock updated in booking.claimDetails
  await Booking.findOneAndUpdate(
    { trackingId: id },
    {
      $set: {
        "claimDetails.stockUpdated": true,
      },
    },
    { new: true },
  );
  res.json({
    success: true,
    message: "Item restocked successfully",
    restockedQuantity: quantity,
    item: {
      id: item._id,
      newStock: item.stockQuantity,
    },
  });
});

// @desc    Leave a review and rating for a booking
// @route   POST /api/booking/:id/review
// @access  Private (Client)
const reviewBooking = asyncHandler(async (req, res) => {
  const { rating, review } = req.body;
  const { id } = req.params;
  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({
      success: false,
      message: "Rating must be between 1 and 5.",
    });
  }

  const details = await Booking.findOne({ _id: id });

  // Fetch booking
  if (!id || !details.vendorId) {
    return res.status(400).json({
      success: false,
      message: "Booking ID and Vendor ID are required.",
    });
  }

  const newReview = await Review.create({
    bookingId: id,
    vendorId: details.vendorId,
    rating,
    review: review || "",
    userId: req.user.id,
  });
  // Append review to vendor
  res.json({
    success: true,
    message: { en: "Review submitted successfully.", nl: "Beoordeling succesvol ingediend." },
    data: newReview,
  });
});

function getDayCount(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const diffTime = end - start;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 for inclusive
}

// @desc    Create a booking request
// @route   POST /api/booking/request
// @access  Private (User)

const createBookingRequest = asyncHandler(async (req, res) => {
  const {
    listingId,
    vendorId,
    upfrontAmount,
    details: {
      startDate,
      endDate,
      startTime,
      endTime,
      eventLocation,
      eventType,
      guestCount,
      distanceKm,
      specialRequests,
      pricingBreakdown,
    },
  } = req.body;
  try {
    // Calculate duration and multi-day details early to determine validation
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    const diffTime = Math.abs(endDateObj - startDateObj);
    let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Include both start and end dates
    let isMultiDay = diffDays > 1;

    if (!listingId || !vendorId || !startDate || !endDate || !eventLocation) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    if (!isMultiDay && (!startTime || !endTime)) {
      return res.status(400).json({
        success: false,
        message:
          "Start time and end time are required for single-day bookings.",
      });
    }

    const TIMEZONE = "Europe/Amsterdam";
    const now = momentTime().tz(TIMEZONE);

    let bookingStartDateTime;
    if (startTime) {
      bookingStartDateTime = momentTime
        .tz(`${startDate} ${startTime}`, "YYYY-MM-DD HH:mm", TIMEZONE);
    } else {
      bookingStartDateTime = momentTime
        .tz(`${startDate} 00:00`, "YYYY-MM-DD HH:mm", TIMEZONE);
    }
    if (bookingStartDateTime.isBefore(now)) {
      return res.status(400).json({
        success: false,
        message: {
          en: "You cannot create a booking for a past date or time.",
          nl: "Je kunt geen boeking maken voor een datum of tijd in het verleden."
        },
      });
    }
    if (bookingStartDateTime.isSame(now, "day")) {
      const diffMinutes = bookingStartDateTime.diff(now, "minutes");

      if (diffMinutes < 120) {
        return res.status(400).json({
          success: false,
          message: "Same-day bookings must be at least 2 hours in advance.",
        });
      }
    }

    const listing = await Listing.findOne({
      _id: listingId,
      isActive: true,
      status: "active",
    })
      .populate("vendor")
      .populate("category", "name")
      .populate("subCategory", "name");

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found or not available",
      });
    }

    // Check stock before proceeding (default required quantity = 1, allow override from body.quantity)
    const requestedQty = 1;
    const stock = await checkListingStock(listingId, requestedQty);
    if (!stock.ok) {
      return res.status(400).json({
        success: false,
        message: stock.message,
        availableQty: stock.availableQty,
      });
    }

    if (
      typeof distanceKm === "undefined" ||
      isNaN(Number(distanceKm)) ||
      Number(distanceKm) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
        {
          en: "distance is required and must be a positive number for this listing.",
          nl: "Afstand is verplicht en moet een positief getal zijn voor deze vermelding."
        }
      });
    }

    // Always use listing owner (User id), not client-sent vendorId alone
    const vendorUserId = await resolveVendorUserId(vendorId, listing);
    if (!vendorUserId) {
      return res.status(400).json({
        success: false,
        message: "Vendor not found for this listing",
      });
    }

    const clientVendorId = await resolveVendorUserId(vendorId, null);
    if (clientVendorId && clientVendorId.toString() !== vendorUserId.toString()) {
      return res.status(400).json({
        success: false,
        message: "Vendor mismatch",
      });
    }
    // Calculate hours per day and total hours depending on presence of times and multi-day
    let dailyHours = 0;
    let totalHours = 0;
    const calculateHours = (startTime, endTime) => {
      const startTimeObj = new Date(`2000-01-01 ${startTime}`);
      const endTimeObj = new Date(`2000-01-01 ${endTime}`);
      let diffHours = (endTimeObj - startTimeObj) / (1000 * 60 * 60);
      if (diffHours < 0) diffHours += 24; // Handle overnight
      return Math.max(diffHours, 0);
    };

    if (startTime && endTime) {
      // We have times; compute daily hours and total hours across days
      dailyHours = calculateHours(startTime, endTime);
      totalHours = isMultiDay ? dailyHours * diffDays : dailyHours;
    } else {
      // No times provided. For per-hour pricing assume full days = 24 hours per day
      dailyHours = isMultiDay ? 24 : 0; // if single-day and no times, leave dailyHours 0 but totalHours as 24
      totalHours = diffDays * 24;
    }

    // Fetch platform fee from Settings
    const settings = await Settings.findOne();
    let platformFeePercent = 0.015; // default 1.5%
    if (settings && typeof settings.bookingItemPlatformFee === "number") {
      platformFeePercent = settings.bookingItemPlatformFee;
    }

    // Calculate pricing using utility
    const pricingResult = calculateFullBookingPrice(listing, {
      startDate,
      endDate,
      startTime,
      endTime,
      distanceKm,
    });

    if (pricingResult && pricingResult.error) {
      return res
        .status(pricingResult.status || 400)
        .json({ success: false, message: pricingResult.error });
    }

    const bookingPrice = pricingResult.bookingPrice;
    const platformFee = Math.round(bookingPrice * platformFeePercent) / 100;
    const extratimeCost = pricingResult.extratimeCost;
    const securityFee = pricingResult.securityFee;
    const kmCharge = pricingResult.kmCharge;
    const subtotal = bookingPrice + extratimeCost + securityFee + kmCharge;
    const totalPrice = subtotal + platformFee;
    dailyHours = pricingResult.dailyHours;
    totalHours = pricingResult.totalHours;
    diffDays = pricingResult.diffDays;
    isMultiDay = pricingResult.isMultiDay;

    // Calculate platform fee as percentage of booking price

    // Transform eventType and specialRequests to multilingual format if they are strings
    let processedEventType = eventType;
    let processedSpecialRequests = specialRequests;

    // If eventType is a string, convert to multilingual object
    if (typeof eventType === "string") {
      processedEventType = {
        en: eventType,
        nl: eventType, // Use same value for Dutch, can be translated later
      };
    }

    // If specialRequests is a string, convert to multilingual object
    if (typeof specialRequests === "string") {
      processedSpecialRequests = {
        en: specialRequests,
        nl: specialRequests, // Use same value for Dutch, can be translated later
      };
    }
    // Create booking request with multi-day support

    const result = getDayCount(startDate, endDate);

    const bookingRequest = new BookingRequest({
      statusHistory: [
        {
          status: "pending",
          notes: {
            en: "New Request",
            nl: "Nieuwe aanvraag",
          }
        },
      ],
      willPayUpfront: req?.body?.details.willPayUpfront,
      AmountLeft: req?.body?.details?.pricingBreakdown?.total,
      userId: req.user.id,
      pricingBreakdown,
      vendorId: vendorUserId,
      listingId,
      listingDetails: {
        title: listing.title,
        subtitle: listing.subtitle,
        description: listing.description,
        featuredImage:
          listing.images && listing.images.length > 0 ? listing.images[0] : "",
        images: listing.images || [],
        pricing: {
          type: listing.pricing.type,
          amount: listing.pricing.amount,
          extratimeCost: listing.pricing.extratimeCost || 0,
          securityFee: listing.pricing.securityFee || 0,
          pricePerKm: listing.pricing.pricePerKm || 0,
          days: result,
        },
        category: listing.category
          ? {
            _id: listing.category._id,
            name: listing.category.name,
          }
          : "",
        subCategory: listing.subCategory
          ? {
            _id: listing.subCategory._id,
            name: listing.subCategory.name,
          }
          : "",
        serviceDetails: {
          serviceType: listing.serviceDetails?.serviceType,
        },
        location: {
          fullAddress: listing.location?.fullAddress,
          coordinates: {
            latitude: listing.location?.coordinates?.latitude,
            longitude: listing.location?.coordinates?.longitude,
          },
        },
        contact: {
          phone: listing.contact?.phone,
          email: listing.contact?.email,
          website: listing.contact?.website,
        },
        features: listing.features || [],
        rating: {
          average: listing.rating?.average || 0,
          totalReviews: listing.rating?.totalReviews || 0,
        },
      },
      details: {
        startDate,
        endDate,
        startTime,
        endTime,
        duration: {
          hours: dailyHours,
          days: diffDays,
          totalHours: totalHours,
          isMultiDay: isMultiDay,
        },
        eventLocation,
        eventLatitude: req.body.details.eventLatitude,
        eventLongitude: req.body.details.eventLongitude,
        eventType: processedEventType,
        guestCount,
        specialRequests: processedSpecialRequests,
      },
      pricing: {
        type: listing.pricing.type,
        amount: listing.pricing.amount,
        extratimeCost: extratimeCost,
        securityPrice: securityFee,
        extraCharges: 0,
        subtotal: subtotal,
        pricePerKm: listing.pricing.pricePerKm || 0,
        distanceKm: Number(distanceKm) || 0,
        kmCharge: kmCharge,
        bookingPrice: bookingPrice,
        extratimeCostApplied: extratimeCost,
        totalPrice: totalPrice,
        platformFee: platformFee,
        // Optionally add dailyRate for multi-day
        ...(isMultiDay && {
          dailyRate: Math.round(bookingPrice / diffDays),
        }),
      },
      platformFee: req?.body?.details?.pricingBreakdown?.platformFee,
    });

    await bookingRequest.save();
    try {
      const cart = await Cart.findOne({ userId: req.user.id });
      if (cart) {
        await cart.removeItem(listingId);
      }
    } catch (cartError) {
      console.error("Failed to remove item from cart:", cartError);
    }
    try {
      const client = await User.findById(bookingRequest.userId).select(
        "firstName lastName",
      );
      const vendorUser = await User.findById(vendorUserId).select(
        "firstName lastName email accountType appFcm webFcm",
      );
      const vendorProfile = await Vendor.findOne({ userId: vendorUserId }).select(
        "businessName",
      );
      const vendorDisplayName = getVendorDisplayName(vendorUser, vendorProfile);
      const bookingDates = `${startDate}${endDate !== startDate ? ` to ${endDate}` : ""}`;
      const clientName = client
        ? `${client.firstName} ${client.lastName}`.trim()
        : "A client";
      const message = {
        en: `New booking request from ${clientName} for "${listing.title.en}" on ${bookingDates}. Tracking ID: ${bookingRequest.trackingId}`,
        nl: `Nieuwe boekingsaanvraag van ${clientName} voor "${listing.title.nl}" op ${bookingDates}. Tracking-ID: ${bookingRequest.trackingId}`,
      };

      const listingTitle = listing.title || { en: "your listing", nl: "uw aanbod" };
      const isEvenlyoProtectEnabled =
        req.body?.details?.pricingBreakdown?.paymentPolicy
          ?.isEvenlyoProtectEnabled === true;

      try {
        await notifyVendorNewBooking({
          title: {
            en: "New Booking Request",
            nl: "Nieuwe boekingsaanvraag",
          },
          message: {
            en: `New booking request for "${listing.title.en}" on ${bookingDates}. Tracking ID: ${bookingRequest.trackingId}`,
            nl: `Nieuwe boekingsaanvraag voor "${listing.title.nl}" op ${bookingDates}. Tracking-ID: ${bookingRequest.trackingId}`,
          },
          receiverDetails: vendorUser,
          bookingRequest,
          listing,
          startDate,
          endDate,
        });
      } catch (e) {
        console.error("Failed to create vendor notification for new booking:", e);
      }

      if (isEvenlyoProtectEnabled) {
        const adminsToNotifyPush = await AdminEmployee.findOne({
          role: "Admin",
          status: "active",
          "notificationSettings.push.evenlyoProtect": true,
        }).select("_id name email");

        const adminsToNotifyEmail = await AdminEmployee.findOne({
          role: "Admin",
          status: "active",
          "notificationSettings.email.evenlyoProtect": true,
        }).select("_id name email");

        if (adminsToNotifyPush) {
          await notificationController.createNotification({
            title: {
              en: "Evenlyo protected booking",
              nl: "Door Evenlyo beschermde boeking",
            },
            notificationFor: "Admin",
            vendorId: vendorUserId,
            clientId: client?._id,
            bookingId: bookingRequest._id,
            message: {
              en: `A evenlyo protected booking request from ${clientName} for "${listingTitle.en}" on ${bookingDates}. Tracking ID: ${bookingRequest.trackingId}`,
              nl: `Een beschermde boekingsaanvraag op Evenlyo van ${clientName} voor "${listingTitle.nl}" op ${bookingDates}. Tracking-ID: ${bookingRequest.trackingId}`,
            },
          });
        }

        if (adminsToNotifyEmail && vendorDisplayName !== "N/A") {
          sendEvenlyoProtectBookingEmail(
            bookingRequest,
            clientName,
            vendorDisplayName,
            "NEW",
            adminsToNotifyEmail.email,
          );
        }
        try {
          await createActivityLog({
            ActivityType: "booking",
            heading: {
              en: "New Booking Request",
              nl: "Nieuwe boekingsaanvraag",
            },
            type: "booking_created",
            description: message,
            bookingId: bookingRequest._id,
            userId: client?._id,
            vendorId: vendorId,
          });
        } catch (activityErr) {
          console.error("Activity log failed (booking notification continues):", activityErr);
        }
      }
    } catch (e) {
      console.error("Failed to create admin notification for protected booking:", e);
    }
    // Populate the response (listing details are now stored directly in listingDetails field)
    await bookingRequest.populate([
      { path: "userId", select: "firstName lastName email contactNumber" },
      { path: "vendorId", select: "businessName businessEmail businessPhone" },
    ]);

    // Determine subcategory payment policy (escrow/upfront)
    const policy = await getListingPaymentPolicy(listing);
    // const upfrontAmount = 0
    policy.escrowEnabled && policy.upfrontFeePercent > 0
      ? Math.round(((totalPrice * policy.upfrontFeePercent) / 100) * 100) / 100
      : 0;
    const remainingAmount = Math.max(
      Math.round((totalPrice - upfrontAmount) * 100) / 100,
      0,
    );

    const vendorUser = await User.findById(vendorUserId).select("firstName");


    res.status(201).json({
      success: true,
      message: {
        en: "Booking request created successfully",
        nl: "Boekingsaanvraag succesvol aangemaakt",
      },
      data: {
        vendorName: vendorUser?.firstName || "",
        bookingRequest,
        paymentPolicy: {
          escrowEnabled: policy.escrowEnabled,
          upfrontFeePercent: policy.upfrontFeePercent,
          upfrontHour: policy.upfrontHour,
          evenlyoProtectFeePercent: policy.evenlyoProtectFeePercent,
          upfrontAmount,
          remainingAmount,
        },
      },
    });
  } catch (error) {
    console.error("createBookingRequest error:", error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: {
          en: "Failed to create booking request",
          nl: "Boekingsaanvraag aanmaken mislukt",
        },
      });
    }
  }
});

// @desc    Get pending bookings for vendor
// @route   GET /api/booking/pending
// @access  Private (Vendor)
const getPendingBookings = asyncHandler(async (req, res) => {
  // Get vendor profile
  const vendor = await Vendor.findOne({ userId: req.user.id });
  if (!vendor) {
    return res.status(404).json({
      success: false,
      message: "Vendor profile not found",
    });
  }

  const pendingBookings = await BookingRequest.find({
    vendorId: vendor._id,
    status: "pending",
  })
    .populate("userId", "firstName lastName email contactNumber")
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    data: {
      bookings: pendingBookings,
      count: pendingBookings.length,
    },
  });
});

// @desc    Get accepted bookings for user (before payment)
// @route   GET /api/booking/accepted
// @access  Private (User)

const getAcceptedBookings = asyncHandler(async (req, res) => {

  const acceptedBookings = await BookingRequest.find({
    userId: req.user.id,
    status: "accepted",
    paymentStatus: { $ne: "paid" },
  })
    .populate("vendorId", "firstName lastName")
    .sort({ createdAt: -1 })
    .lean();

  const vendorIds = acceptedBookings.map(b => b.vendorId?._id);

  const vendorDetails = await Vendor.find({
    userId: { $in: vendorIds }
  }).lean();

  const bookingsWithVendorDetails = acceptedBookings.map(booking => {
    const vendorDetail = vendorDetails.find(
      v => v.userId.toString() === booking.vendorId?._id.toString()
    );

    return {
      ...booking,
      vendorDetails: vendorDetail || null
    };
  });

  res.json({
    success: true,
    data: {
      bookings: bookingsWithVendorDetails,
      count: bookingsWithVendorDetails.length,
    },
  });
})

// @desc    Mark booking as paid
// @route   POST /api/booking/:id/pay
// @access  Private (User)
const markBookingAsPaid = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { paymentMethod, transactionId } = req.body;

  const booking = await BookingRequest.findOne({
    _id: id,
    userId: req.user.id,
    status: "accepted",
  });

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found or not in accepted status",
    });
  }

  booking.status = "paid";
  booking.paymentStatus = "paid";
  booking.paymentMethod = paymentMethod || "stripe";

  if (transactionId) {
    booking.transactionId = transactionId;
  }

  await booking.save();

  // Notify vendor of payment
  try {
    const vendor = await Vendor.findById(booking.vendorId);
    if (vendor && vendor.userId) {
      await notificationController.createNotification({
        user: vendor.userId,
        bookingId: booking._id,
        message: `A client has paid for a booking.`,
      });
    }
  } catch (e) {
    console.error("Failed to create vendor notification for paid booking:", e);
  }
  await booking.save();

  await booking.populate([
    { path: "vendorId", select: "businessName businessEmail businessPhone" },
    { path: "listingId", select: "title featuredImage pricing" },
  ]);

  res.json({
    success: true,
    message: {
      en: "Payment confirmed successfully",
      nl: "Betaling bevestigd succesvol"
    },
    data: {
      booking,
    },
  });
});

// @desc    Get user's booking history
// @route   GET /api/booking/history
// @access  Private (User)
const getBookingHistory = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 30 } = req.query;
  const filter = { userId: req.user.id };
  if (status) {
    filter.status = status;
  }
  const bookings = await BookingRequest.find(filter)
    .populate("vendorId", "firstName lastName")
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const isReviewed = Review.findOne({
    bookingId: bookings._id,
    userId: req.user.id,
  });

  const total = await BookingRequest.countDocuments(filter);

  // Format bookings with action buttons based on status
  const formattedBookings = await Promise.all(
    bookings.map(async (booking) => {
      const reviewExists = await Review.exists({
        bookingId: booking._id,
      });
      const vendorDetailsId = await Vendor.findOne({ userId: booking.vendorId.id }).select("businessName");
      const bookingData = {
        ...booking.toObject(),
        _id: booking._id,
        trackingId: booking.trackingId,
        bookingDateTime: {
          start: booking.details.startDate,
          end: booking.details.endDate,
          startTime: booking.details.startTime,
          endTime: booking.details.endTime,
        },
        totalPrice: booking?.pricing?.totalPrice,
        status: booking.status,
        vendor: booking.vendorId,
        listing: booking.listingId,
        createdAt: booking.createdAt,
        statusHistory: booking.statusHistory,
        // Action buttons based on status for client
        actionButtons: getClientActionButtons(booking.status),
        // Additional details
        eventLocation: booking.details.eventLocation,
        guestCount: booking.details.guestCount,
        specialRequests: booking.details.specialRequests,
        paymentStatus: booking.paymentStatus,
        rejectionReason: booking.rejectionReason,
        claimDetails: booking.claimDetails,
        images: booking.images || [],
        isReviewed: !!reviewExists,
        vendorDetailsId: vendorDetailsId._id
      };
      return bookingData;
    }),
  );
  res.json({
    success: true,
    data: {
      bookings: formattedBookings,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
      },
    },
  });
});

// Helper function to get action buttons for clients based on status
const getClientActionButtons = (status) => {
  const buttons = [];

  switch (status) {
    case "pending":
      buttons.push({
        action: "cancel",
        label: "Cancel Request",
        color: "red",
        type: "danger",
      });
      break;

    case "accepted":
      buttons.push(
        {
          action: "pay",
          label: "Make Payment",
          color: "purple",
          type: "primary",
        },
        {
          action: "cancel",
          label: "Cancel",
          color: "red",
          type: "danger",
        },
      );
      break;

    case "paid":
      buttons.push({
        action: "view_details",
        label: "View Details",
        color: "blue",
        type: "info",
      });
      break;

    case "on the way":
      buttons.push({
        action: "track",
        label: "Track Delivery",
        color: "orange",
        type: "info",
      });
      break;

    case "received":
      buttons.push(
        {
          action: "mark_finished",
          label: "Mark Finished",
          color: "green",
          type: "success",
        },
        {
          action: "claim",
          label: "Report Issue",
          color: "orange",
          type: "warning",
        },
      );
      break;

    case "picked up":
      buttons.push(
        {
          action: "mark_complete",
          label: "Mark Complete",
          color: "green",
          type: "success",
        },
        {
          action: "claim",
          label: "Report Issue",
          color: "orange",
          type: "warning",
        },
      );
      break;

    case "completed":
      buttons.push(
        {
          action: "view_invoice",
          label: "View Invoice",
          color: "blue",
          type: "info",
        },
        {
          action: "leave_review",
          label: "Leave Review",
          color: "purple",
          type: "secondary",
        },
      );
      break;

    case "claim":
      buttons.push({
        action: "view_claim",
        label: "View Claim Status",
        color: "orange",
        type: "warning",
      });
      break;

    case "rejected":
      buttons.push({
        action: "view_reason",
        label: "View Rejection Reason",
        color: "red",
        type: "danger",
      });
      break;

    default:
      break;
  }

  return buttons;
};

// @desc    Get vendor's booking history
// @route   GET /api/booking/vendor-history
// @access  Private (Vendor)
const getVendorBookingHistory = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;

  // Get vendor profile
  const vendor = await Vendor.findOne({ userId: req.user.id });
  if (!vendor) {
    return res.status(404).json({
      success: false,
      message: "Vendor profile not found",
    });
  }

  const filter = { vendorId: vendor._id };
  if (status) {
    filter.status = status;
  }

  const bookings = await BookingRequest.find(filter)
    .populate("userId", "firstName lastName email contactNumber")
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await BookingRequest.countDocuments(filter);

  // Format bookings with action buttons based on status for vendor
  const formattedBookings = bookings.map((booking) => {
    const bookingData = {
      _id: booking._id,
      trackingId: booking.trackingId,
      bookingDateTime: {
        start: booking.details.startDate,
        end: booking.details.endDate,
        startTime: booking.details.startTime,
        endTime: booking.details.endTime,
      },
      totalPrice: booking.pricing.totalPrice,
      status: booking.status,
      client: booking.userId,
      listing: booking.listingId,
      createdAt: booking.createdAt,
      statusHistory: booking.statusHistory,
      // Action buttons based on status for vendor
      actionButtons: getVendorActionButtons(booking.status),
      // Additional details
      eventLocation: booking.details.eventLocation,
      guestCount: booking.details.guestCount,
      specialRequests: booking.details.specialRequests,
      paymentStatus: booking.paymentStatus,
      rejectionReason: booking.rejectionReason,
      claimDetails: booking.claimDetails,
    };

    return bookingData;
  });

  res.json({
    success: true,
    data: {
      bookings: formattedBookings,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
      },
    },
  });
});

// @desc    Mark booking as received (Client action)
// @route   POST /api/bookzing/:id/mark-received
// @access  Private (Client)
const markBookingReceived = asyncHandler(async (req, res) => {
  const booking = await BookingRequest.findOne({
    _id: req.params.id,
    userId: req.user.id,
    status: "on_the_way",
  });

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found or not eligible for this action",
    });
  }

  booking.status = "received";
  await booking.save();

  try {
    const isEvenlyoProtectEnabled =
      booking.pricingBreakdown?.paymentPolicy?.isEvenlyoProtectEnabled === true;

    if (isEvenlyoProtectEnabled) {
      const adminToNotifyEmail = await AdminEmployee.findOne({
        role: "Admin",
        status: "active",
        "notificationSettings.email.evenlyoProtect": true,
      }).select("_id name email");

      if (adminToNotifyEmail?.email) {
        const bookingWithRelations = await BookingRequest.findById(booking._id)
          .populate("userId", "firstName lastName fullName")
          .populate("listingId", "title");

        const vendorUserId = await resolveVendorUserId(booking.vendorId);
        const vendorUser = vendorUserId
          ? await User.findById(vendorUserId).select("firstName lastName fullName")
          : null;

        if (bookingWithRelations?.userId && vendorUser) {
          await sendEvenlyoProtectBookingEmail(
            bookingWithRelations,
            bookingWithRelations.userId,
            vendorUser,
            "RECEIVED",
            adminToNotifyEmail.email,
          );
        }
      }
    }
  } catch (emailErr) {
    console.error("Failed to send Evenlyo Protect received email:", emailErr);
  }

  // Notify vendor that booking is received
  try {
    const vendor = await Vendor.findById(booking.vendorId);
    await notificationController.createNotification({
      title: {
        en: "Booking Received by Client",
        nl: "Boeking ontvangen door klant",
      },
      notificationFor: "Vendor",
      vendorId: booking?.vendorId, // vendor's user account receives notification
      clientId: booking?.userId, //
      bookingId: booking?._id,
      message: {
        en: `booking against ${booking.trackingId} has been received by the client`,
        nl: `Boeking met tracking-ID ${booking.trackingId} is ontvangen door de klant`,
      },
    });
  } catch (e) {
    console.error(
      "Failed to create vendor notification for received booking:",
      e,
    );
  }
  res.json({
    success: true,
    message: {
      en: "Booking marked as received",
      nl: "Boeking gemarkeerd als ontvangen"
    },
    data: { booking },
  });
});

// @desc    Mark booking as complete (Client action)
// @route   POST /api/booking/:id/mark-complete
// @access  Private (Client)
const markBookingFinished = asyncHandler(async (req, res) => {
  const booking = await BookingRequest.findOne({
    _id: req.params.id,
    userId: req.user.id,
    status: { $in: ["received", "picked_up"] },
  });

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found or not eligible for this action",
    });
  }

  booking.status = "finished";
  await booking.save();

  // Notify vendor that booking is completed
  try {
    const vendor = await Vendor.findById(booking.vendorId);
    await notificationController.createNotification({
      title: {
        en: "Booking Completed By the client",
        nl: "Boeking voltooid door de klant",
      },
      notificationFor: "Vendor",
      vendorId: booking?.vendorId, // vendor's user account receives notification
      clientId: booking?.userId, //
      bookingId: booking?._id,
      message: {
        en: `booking against ${booking.trackingId} has been completed by the client`,
        nl: `Boeking met betrekking tot ${booking.trackingId} is voltooid door de klant`,
      },
    });
  } catch (e) {
    console.error(
      "Failed to create vendor notification for completed booking:",
      e,
    );
  }

  res.json({
    success: true,
    message: {
      en: "Booking marked as complete",
      nl: "Boeking gemarkeerd als voltooid"
    },
    data: { booking },
  });
});

// @desc    Create a claim (Client action)
// @route   POST /api/booking/:id/claim
// @access  Private (Client)
const createClaim = asyncHandler(async (req, res) => {
  const { reason, claimType } = req.body;

  if (!reason) {
    return res.status(400).json({
      success: false,
      message: "Claim reason is required",
    });
  }

  if (!claimType) {
    return res.status(400).json({
      success: false,
      message: "Claim type is required",
    });
  }

  const booking = await BookingRequest.findOne({
    _id: req.params.id,
    userId: req.user.id,
    status: { $in: ["received", "finished", "paid"] },
  });
  if (!booking) {
    return res.status(404).json({
      success: false,
      message: {
        en: "Booking not eligible for Complaint",
        nl: "Boeking niet geschikt voor klacht"
      },
    });
  }

  booking.status = "complain";
  booking.claimDetails = {
    reason: reason,
    claimedBy: "client",
    claimedAt: new Date(),
    status: "pending",
    claimType
  };

  await booking.save();

  const supportTicket = new SupportTicket({
    userEmail: req.user.email,
    userId: req.user.id,
    issueRelatedto: "booking",
    details: reason,
    trackingId: booking.trackingId,
  });

  await notificationController.createNotification({
    title: {
      en: `New Support Ticket Created, Against Tracking ID ${booking.trackingId}`,
      nl: `Nieuw supportticket aangemaakt, met betrekking tot tracking-ID ${booking.trackingId}`
    },
    notificationFor: "Admin",
    vendorId: booking.vendorId, // vendor's user account receives notification
    clientId: booking.userId, // vendor's user account receives notification
    bookingId: booking._id,
    message: {
      en: `New Support Ticket Created, Against Tracking ID ${booking.trackingId}`,
      nl: `Nieuw supportticket aangemaakt, met betrekking tot tracking-ID ${booking.trackingId}`
    }
  });

  await notificationController.createNotification({
    title: {
      en: "New Support Ticket Created By Client",
      nl: "Nieuw supportticket aangemaakt door de klant",
    },
    notificationFor: "Vendor",
    vendorId: booking.vendorId, // vendor's user account receives notification
    clientId: booking.userId, // vendor's user account receives notification
    bookingId: booking._id,
    message: {
      en: `A new Support ticket has been created by the client against bookingId ${booking.trackingId}`,
      nl: `Nieuw supportticket aangemaakt door de klant met betrekking tot boekings-ID ${booking.trackingId}`,
    },
  });

  await supportTicket.save();

  // TODO: Send email notification to admin about the claim

  res.json({
    success: true,
    message: {
      en: "Complain created successfully. Admin will review and contact you.",
      nl: "Klacht succesvol aangemaakt. De admin zal de klacht beoordelen en contact met u opnemen."
    },
    data: { booking },
  });
});

// @desc    Cancel a booking (Client action, only within 30 min)
// @route   POST /api/booking/:id/cancel
// @access  Private (Client)
const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await BookingRequest.findOne({
    _id: req.params.id,
    userId: req.user.id,
    status: { $in: ["pending", "accepted", "paid"] },
  });

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found or not eligible for cancellation.",
    });
  }

  // Check if within 30 minutes of creation
  const now = new Date();
  const createdAt = new Date(booking.createdAt);
  const diffMinutes = (now - createdAt) / (1000 * 60);
  if (diffMinutes > 30) {
    return res.status(400).json({
      success: false,
      message:
      {
        en: "Cancellation period expired. You can only cancel within 30 minutes of booking.",
        nl: "Annuleringsperiode verlopen. U kunt alleen annuleren binnen 30 minuten na de boeking."
      },
    });
  }

  // Accept cancellation reason from request body (optional)
  let reason = req.body && req.body.reason;
  let notes = {
    en: "Booking cancelled by client",
    nl: "Boeking geannuleerd door klant",
  };
  if (reason) {
    if (typeof reason === "object" && (reason.en || reason.nl)) {
      notes = {
        en: reason.en || notes.en,
        nl: reason.nl || notes.nl,
      };
    } else if (typeof reason === "string") {
      notes = {
        en: reason,
        nl: reason, // Use same for Dutch, can be translated later
      };
    }
  }

  booking.status = "cancelled";
  booking.cancellationDetails.reason = reason || "No reason provided";
  booking.statusHistory.push({
    status: "cancelled",
    updatedBy: {
      userId: req.user.id,
      userType: "client",
      name: req.user.firstName + " " + req.user.lastName,
    },
    notes: notes,
  });
  await booking.save();

  try {
    const bookingForEmail = await BookingRequest.findById(booking._id)
      .populate("vendorId", "firstName email notifications")
      .populate("userId", "firstName")
      .populate("listingId", "title");

    if (
      bookingForEmail?.vendorId?.email &&
      bookingForEmail?.vendorId?.notifications?.email !== false
    ) {
      await sendVendorCancellationEmail(bookingForEmail, "client_cancelled");
    }
  } catch (emailErr) {
    console.error("Failed to send vendor cancellation email:", emailErr);
  }

  const incrementBy = 1;

  const updatedListing = await Listing.findOneAndUpdate(
    {
      _id: booking.listingId,
      vendor: booking.vendorId,
    },
    { $inc: { quantity: incrementBy } },
    { new: true }
  );

  if (updatedListing) {
    // Log check-in
    try {
      await StockLog.create({
        listing: updatedListing._id,
        type: "checkin",
        quantity: 1,
        note: `Returned after cancelled booking ${booking._id}`,
        createdBy: req.user?._id,
      });
    } catch (logErr) {
      console.error(
        "Failed to create stock log on booking completion",
        logErr
      );
    }
  }
  res.json({
    success: true,
    message: {
      en: "Booking cancelled successfully.",
      nl: "Boeking succesvol geannuleerd."
    },
    data: { booking },
  });
});
// @desc    Get booking details
// @route   GET /api/booking/:id
// @access  Private (User/Vendor)
const getBookingDetails = asyncHandler(async (req, res) => {
  const booking = await BookingRequest.findById(req.params.id).populate(
    "userId",
    "firstName lastName email contactNumber",
  );
  const vendorDetails = await User.findById(booking.vendorId).select(
    "firstName lastName email image fullName",
  );
  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found",
    });
  }
  // Check if user has access to this booking
  const vendor = await Vendor.findOne({ userId: booking.vendorId });
  let vendorDetailsss = {
    ...vendorDetails.toObject(),
    businessLogo: vendor ? vendor.businessLogo : null,
  };
  const bookingUserIdStr =
    booking.userId && booking.userId._id
      ? booking.userId._id.toString()
      : booking.userId
        ? booking.userId.toString()
        : "";
  const bookingVendorIdStr =
    booking.vendorId && booking.vendorId._id
      ? booking.vendorId._id.toString()
      : booking.vendorId
        ? booking.vendorId.toString()
        : "";
  const vendorIdStr = vendor && vendor._id ? vendor._id.toString() : "";
  const bookingUserId = booking.userId?._id
    ? booking.userId._id.toString()
    : booking.userId?.toString();
  const bookingVendorId = booking.vendorId?.toString();
  const hasAccess =
    bookingUserId === req.user.id || bookingVendorId === req.user.id;
  if (!hasAccess) {
    return res.status(403).json({
      success: false,
      message: "Access denied",
    });
  }
  // Determine user type and get appropriate action buttons
  const isVendor =
    vendor &&
    booking.vendorId &&
    booking.vendorId._id &&
    vendor._id &&
    booking.vendorId._id.toString() === vendor._id.toString();
  const actionButtons = isVendor
    ? getVendorActionButtons(booking.status)
    : getClientActionButtons(booking.status);

  const reviewExists = await Review.exists({ bookingId: booking._id });

  const bookingData = {
    ...booking.toObject(),
    _id: booking._id,
    vendorDetails: vendorDetailsss,
    trackingId: booking.trackingId,
    bookingDateTime: {
      start: booking.details.startDate,
      end: booking.details.endDate,
      startTime: booking.details.startTime,
      endTime: booking.details.endTime,
    },
    totalPrice: booking?.pricingBreakdown?.total,
    status: booking.status,
    client: booking.userId,
    vendor: booking.vendorId,
    listing: booking.listingId,
    createdAt: booking.createdAt,
    statusHistory: booking.statusHistory,
    actionButtons: actionButtons,
    eventLocation: booking.details.eventLocation,
    guestCount: booking.details.guestCount,
    specialRequests: booking.details.specialRequests,
    paymentStatus: booking.paymentStatus,
    rejectionReason: booking.rejectionReason,
    claimDetails: booking.claimDetails,
    deliveryDetails: booking.deliveryDetails,
    feedback: booking.feedback,
    isReviewed: !!reviewExists,
  };
  res.json({
    success: true,
    data: { booking: bookingData },
  });
});

// @desc    Get booking summary (tracking id, client name, client phone, total price, status history)
// @route   GET /api/booking/:id/summary
// @access  Private (User/Vendor)
const getBookingSummary = asyncHandler(async (req, res) => {
  const booking = await BookingRequest.findById(req.params.id)
    .populate("userId", "firstName lastName contactNumber")
    .populate("vendorId", "businessName businessPhone")
    .populate("listingId");

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found",
    });
  }

  // Access control: allow client who created booking or vendor who owns it
  const vendor = await Vendor.findOne({ userId: req.user.id });
  const bookingUserIdStr =
    booking.userId && booking.userId._id
      ? booking.userId._id.toString()
      : booking.userId
        ? booking.userId.toString()
        : "";
  const bookingVendorIdStr =
    booking.vendorId && booking.vendorId._id
      ? booking.vendorId._id.toString()
      : booking.vendorId
        ? booking.vendorId.toString()
        : "";
  const vendorIdStr = vendor && vendor._id ? vendor._id.toString() : "";

  const hasAccess =
    (bookingUserIdStr && bookingUserIdStr === req.user.id) ||
    (vendorIdStr && bookingVendorIdStr && bookingVendorIdStr === vendorIdStr);

  if (!hasAccess) {
    return res.status(403).json({
      success: false,
      message: "Access denied",
    });
  }

  const clientName = booking.userId
    ? `${booking.userId.firstName || ""} ${booking.userId.lastName || ""
      }`.trim()
    : "";
  const clientPhone = booking.userId ? booking.userId.contactNumber || "" : "";

  // Build listing object with requested fields
  let listingObj = null;
  if (booking.listingId) {
    const listing = booking.listingId;
    // Title fallback: if title is a string, wrap into {en,nl}
    let titleObj = listing.title;
    if (!titleObj) {
      titleObj = { en: "", nl: "" };
    } else if (typeof titleObj === "string") {
      titleObj = { en: titleObj, nl: titleObj };
    } else {
      // Ensure both en and nl exist
      titleObj = {
        en: titleObj.en || "",
        nl: titleObj.nl || titleObj.en || "",
      };
    }

    listingObj = {
      title: titleObj,
      location: {
        fullAddress:
          listing.location && listing.location.fullAddress
            ? listing.location.fullAddress
            : "",
        coordinates:
          listing.location && listing.location.coordinates
            ? listing.location.coordinates
            : { latitude: null, longitude: null },
      },
      images:
        Array.isArray(listing.images) && listing.images.length > 0
          ? listing.images[0]
          : listing.images
            ? typeof listing.images === "string"
              ? listing.images
              : ""
            : "",
    };
  }

  // Booking location: eventLocation (string) + coordinates if present in listing.location
  const bookingLocation = {
    eventLocation:
      booking.details && booking.details.eventLocation
        ? booking.details.eventLocation
        : "",
  };

  const summary = {
    trackingId: booking.trackingId,
    clientName: clientName,
    clientPhone: clientPhone,
    totalPrice:
      booking.pricing && typeof booking.pricing.totalPrice !== "undefined"
        ? booking.pricing.totalPrice
        : booking.pricing && booking.pricing.bookingPrice
          ? booking.pricing.bookingPrice
          : booking.pricing && booking.pricing.totalPrice
            ? booking.pricing.totalPrice
            : null,
    statusHistory: booking.statusHistory || [],
  };

  const direction = {
    listing: listingObj,
    bookingLocation: bookingLocation,
  };

  res.json({ success: true, data: { summary, direction } });
});

const TrackBooking = asyncHandler(async (req, res) => {
  const booking = await BookingRequest.findById(req.params.id)
    .populate("userId", "firstName lastName contactNumber")
    .populate("vendorId", "businessName businessPhone")
    .populate("listingId");

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found",
    });
  }

  // Access control: allow client who created booking or vendor who owns it
  const vendor = await Vendor.findOne({ userId: req.user.id });
  const bookingUserIdStr =
    booking.userId && booking.userId._id
      ? booking.userId._id.toString()
      : booking.userId
        ? booking.userId.toString()
        : "";
  const bookingVendorIdStr =
    booking.vendorId && booking.vendorId._id
      ? booking.vendorId._id.toString()
      : booking.vendorId
        ? booking.vendorId.toString()
        : "";
  const vendorIdStr = vendor && vendor._id ? vendor._id.toString() : "";

  const hasAccess =
    (bookingUserIdStr && bookingUserIdStr === req.user.id) ||
    (vendorIdStr && bookingVendorIdStr && bookingVendorIdStr === vendorIdStr);

  if (!hasAccess) {
    return res.status(403).json({
      success: false,
      message: "Access denied",
    });
  }

  const clientName = booking.userId
    ? `${booking.userId.firstName || ""} ${booking.userId.lastName || ""
      }`.trim()
    : "";
  const clientPhone = booking.userId ? booking.userId.contactNumber || "" : "";

  // Build listing object with requested fields
  let listingObj = null;
  if (booking.listingId) {
    const listing = booking.listingId;
    // Title fallback: if title is a string, wrap into {en,nl}
    let titleObj = listing.title;
    if (!titleObj) {
      titleObj = { en: "", nl: "" };
    } else if (typeof titleObj === "string") {
      titleObj = { en: titleObj, nl: titleObj };
    } else {
      // Ensure both en and nl exist
      titleObj = {
        en: titleObj.en || "",
        nl: titleObj.nl || titleObj.en || "",
      };
    }

    listingObj = {
      title: titleObj,
      location: {
        fullAddress:
          listing.location && listing.location.fullAddress
            ? listing.location.fullAddress
            : "",
        coordinates:
          listing.location && listing.location.coordinates
            ? listing.location.coordinates
            : { latitude: null, longitude: null },
      },
      images:
        Array.isArray(listing.images) && listing.images.length > 0
          ? listing.images[0]
          : listing.images
            ? typeof listing.images === "string"
              ? listing.images
              : ""
            : "",
    };
  }

  // Booking location: eventLocation (string) + coordinates if present in listing.location
  const bookingLocation = {
    eventLocation:
      booking.details && booking.details.eventLocation
        ? booking.details.eventLocation
        : "",
  };

  // Only return direction object with listing.title, listing.location, listing.images, and bookingLocation.eventLocation
  const directionOnly = {
    listing: listingObj
      ? {
        title: listingObj.title,
        location: listingObj.location,
        images: listingObj.images,
      }
      : null,
    bookingLocation: {
      eventLocation: bookingLocation.eventLocation || "",
    },
  };

  res.json({ success: true, data: { direction: directionOnly } });
});

// const fetchBookingRequest = asyncHandler(async (req, res) => {
//   const { status, vendorId } = req.body;

//   let obj = {};
//   if (vendorId) obj.vendorId = vendorId;
//   if (status) obj.status = status;

//   const findBookingRequest = await Booking.find(obj).populate({
//     path: "userId",
//     model: "User",
//     select: "firstName lastName email",
//   });
const fetchBookingRequest = asyncHandler(async (req, res) => {
  const { status, vendorId } = req.body;

  let obj = {};
  if (vendorId) obj.vendorId = new mongoose.Types.ObjectId(vendorId);
  if (status) obj.status = status;


  const findBookingRequest = await Booking.find(obj);
  if (!findBookingRequest || findBookingRequest.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Cannot find a booking request!",
    });
  }

  return res.status(200).json({
    success: true,
    data: findBookingRequest,
    message: "Booking requests fetched successfully",
  });
});

const fetchBookingRequestByDate = asyncHandler(async (req, res) => {
  const { date, vendorId, userId } = req.body;

  if (!date) {
    return res.status(400).json({
      success: false,
      message: "Date is required",
    });
  }

  const obj = {};
  if (vendorId) obj.vendorId = vendorId;
  if (userId) obj.userId = userId;


  try {
    const inputDateString = date.split("T")[0];

    const allBookings = await Booking.find(obj);

    if (allBookings.length > 0) {
      allBookings.forEach((booking, index) => {
        const startDateStr = booking.details?.startDate
          ? new Date(booking.details.startDate).toISOString().split("T")[0]
          : "N/A";
      });
    }

    const filteredBookings = allBookings.filter((booking) => {
      if (!booking.details || !booking.details.startDate) {
        return false;
      }

      const bookingDateStr = new Date(booking.details.startDate)
        .toISOString()
        .split("T")[0];
      const matches = bookingDateStr === inputDateString;
      return matches;
    });

    if (filteredBookings.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No booking requests found starting on the specified date",
      });
    }

    const populatedBookings = await Booking.populate(filteredBookings, {
      path: "userId",
      model: "User",
      select: "firstName lastName email",
    });
    populatedBookings.sort((a, b) => {
      const timeA = a.details?.startTime || "00:00";
      const timeB = b.details?.startTime || "00:00";
      if (timeA < timeB) return -1;
      if (timeA > timeB) return 1;
      return 0;
    });

    return res.status(200).json({
      success: true,
      data: populatedBookings,
      count: populatedBookings.length,
      message: "Booking requests fetched successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

module.exports = {
  createBookingRequest,
  getPendingBookings,
  getAcceptedBookings,
  markBookingAsPaid,
  getBookingHistory,
  getVendorBookingHistory,
  markBookingReceived,
  markBookingFinished,
  createClaim,
  getBookingDetails,
  cancelBooking,
  reviewBooking,
  createBookingPaymentIntent,
  getBookingSummary,
  TrackBooking,
  fetchBookingRequest,
  fetchBookingRequestByDate,
  restockItem,
};

// @desc    Get simplified booking details for client/vendor
// @route   GET /api/booking/:id/details
// @access  Private (User/Vendor)
const getBookingSimpleDetails = asyncHandler(async (req, res) => {
  const booking = await BookingRequest.findById(req.params.id)
    .populate("vendorId")
    .populate("listingId");

  if (!booking) {
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  }

  // Access control: allow client who created booking or vendor who owns it
  const vendor = await Vendor.findOne({ userId: req.user.id });
  const bookingUserIdStr =
    booking.userId && booking.userId._id
      ? booking.userId._id.toString()
      : booking.userId
        ? booking.userId.toString()
        : "";
  const bookingVendorIdStr =
    booking.vendorId && booking.vendorId._id
      ? booking.vendorId._id.toString()
      : booking.vendorId
        ? booking.vendorId.toString()
        : "";
  const vendorIdStr = vendor && vendor._id ? vendor._id.toString() : "";

  const hasAccess =
    (bookingUserIdStr && bookingUserIdStr === req.user.id) ||
    (vendorIdStr && bookingVendorIdStr && bookingVendorIdStr === vendorIdStr);

  if (!hasAccess) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  // Vendor info
  const vendorName = booking.vendorId
    ? booking.vendorId.businessName ||
    `${booking.vendorId.firstName || ""} ${booking.vendorId.lastName || ""
      }`.trim()
    : "";
  const vendorLogo = booking.vendorId
    ? booking.vendorId.businessLogo || booking.vendorId.logo || ""
    : "";
  const vendorDescription = booking.vendorId
    ? booking.vendorId.description || booking.vendorId.businessDescription || ""
    : "";

  // Listing title and location
  let listingTitle = "";
  if (booking.listingId) {
    if (typeof booking.listingId.title === "string")
      listingTitle = booking.listingId.title;
    else if (booking.listingId.title && booking.listingId.title.en)
      listingTitle = booking.listingId.title.en;
  }

  const listingLocation =
    booking.listingId && booking.listingId.location
      ? booking.listingId.location
      : { fullAddress: "", coordinates: { latitude: null, longitude: null } };

  // Booking pricing: try totalPrice then bookingPrice
  const bookingTotalPrice =
    booking.pricing && typeof booking.pricing.totalPrice !== "undefined"
      ? booking.pricing.totalPrice
      : booking.pricing && booking.pricing.bookingPrice
        ? booking.pricing.bookingPrice
        : null;

  const result = {
    startDate:
      booking.details && booking.details.startDate
        ? booking.details.startDate
        : "",
    endDate:
      booking.details && booking.details.endDate ? booking.details.endDate : "",
    startTime:
      booking.details && booking.details.startTime
        ? booking.details.startTime
        : "",
    endTime:
      booking.details && booking.details.endTime ? booking.details.endTime : "",
    vendorName,
    vendorLogo,
    vendorDescription,
    listingTitle,
    bookingTotalPrice,
    listingLocation,
    // Ensure listing images is always an array
    listingImages:
      booking.listingId && booking.listingId.images
        ? Array.isArray(booking.listingId.images)
          ? booking.listingId.images
          : [booking.listingId.images]
        : [],
  };

  res.json({ success: true, data: result });
});

// add to exports
module.exports.getBookingSimpleDetails = getBookingSimpleDetails;
