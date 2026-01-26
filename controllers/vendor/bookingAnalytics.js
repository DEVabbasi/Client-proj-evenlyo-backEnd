const asyncHandler = require("express-async-handler");
const Booking = require("../../models/Booking");
const Vendor = require("../../models/Vendor");
const User = require("../../models/User");
const BookingRequest = require("../../models/Booking");
const notificationController = require("../notificationController");
const Listing = require("../../models/Listing");
const StockLog = require("../../models/StockLog");
const {
  getAvailabilityDetails,
  checkAvailability,
} = require("../../utils/bookingUtils");
const { createActivityLog } = require("../../utils/activityLogger");
const stripe = require("../../config/stripe");
// GET /api/vendor/bookings/analytics
const getVendorBookingAnalytics = async (req, res) => {
  console.log("HAHAHAHHA");

  try {
    const vendorId = req.user?.id;
    if (!vendorId)
      return res
        .status(400)
        .json({ success: false, message: "Vendor not found in request." });

    // Booking status counts
    const [total, completed, requested, inProcess, bookings] =
      await Promise.all([
        Booking.countDocuments({ vendorId }),
        Booking.countDocuments({ vendorId, status: "completed" }),
        Booking.countDocuments({ vendorId, status: "pending" }),
        Booking.countDocuments({
          vendorId,
          status: {
            $in: ["accepted", "paid", "on_the_way", "received", "picked_up"],
          },
        }),
        Booking.find({ vendorId })
          .sort({ createdAt: -1 })
          .populate("userId", "firstName lastName email")
          .populate("listingId", "title")
          .select(
            "details status trackingId userId listingId description eventLocation createdAt statusHistory listingDetails"
          ),
      ]);
    console.log(bookings, "bookingsbookingsbookingsbookingsbookings");

    // Get unique listing IDs
    const listingIds = [
      ...new Set(bookings.map((b) => b.listingId).filter((id) => id)),
    ];

    const bookingsList = bookings.map((b) => ({
      id: b._id,
      startDate: b.details?.startDate,
      endDate: b.details?.endDate,
      startTime: b.details?.startTime,
      endTime: b.details?.endTime,
      status: b.status,
      title: b.listingDetails?.title || "",
      customer: b.userId ? `${b.userId.firstName} ${b.userId.lastName}` : "",
      description:
        b.details?.specialRequests?.en || b.details?.specialRequests || "",
      ListingId: b.listingId?._id,
      location: b.details?.eventLocation || "",
      trackingId: b.trackingId,
      statusHistory: b.statusHistory,
      createdAt: b.createdAt,
      listingDetails: bookings[0]?.listingDetails,
    }));
    res.json({
      success: true,
      stats: {
        totalBookings: total,
        completedBookings: completed,
        requestBookings: requested,
        inProcessBookings: inProcess,
      },
      bookings: bookingsList,
    });
  } catch (err) {
    console.error("Vendor booking analytics error:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};
// @desc    Accept booking request
// @route   POST /api/booking/:id/accept
// @access  Private (Vendor)
const acceptBooking = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const vendor = await Vendor.findOne({ userId: req.user.id });
  if (!vendor) {
    return res.status(404).json({
      success: false,
      message: "Vendor profile not found",
    });
  }

  const booking = await BookingRequest.findOne({
    _id: id,
    vendorId: vendor.userId,
    status: "pending",
  });

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking request not found or already processed",
    });
  }
  console.log(vendor, "vendorvendorvendorvendorvendor");
  const isAvailable = await Listing.findOne({
    _id: booking.listingId,
    vendor: vendor.userId,
    quantity: { $gte: 1 },
  });

  if (!isAvailable) {
    return res.status(400).json({
      success: false,
      message: "Not enough stock to accept this booking",
    });
  }

  // const availabilityResult = await getAvailabilityDetails(
  //   booking.listingId,
  //   booking.details.startDate,
  //   booking.details.endDate,
  //   booking._id
  // );

  // if (!availabilityResult.isAvailable) {
  //   console.log(
  //     `Booking acceptance failed for booking ${id}: conflicting bookings found for listing ${booking.listingId}`
  //   );
  //   return res.status(409).json({
  //     success: false,
  //     message: "Booking is no longer available due to conflicting bookings",
  //     details:
  //       "Another booking has been accepted for overlapping dates. Please check the booking calendar and try a different time slot.",
  //     conflictingBookings: availabilityResult.conflictingBookings,
  //   });
  // }

  console.log(`Accepting booking ${id} for vendor ${vendor.userId}`);

  const decrementBy = 1;
  const updatedListing = await Listing.findOneAndUpdate(
    {
      _id: booking.listingId,
      vendor: vendor.userId,
      quantity: { $gte: decrementBy },
    },
    { $inc: { quantity: -decrementBy } },
    { new: true }
  );

  if (!updatedListing) {
    return res.status(400).json({
      success: false,
      message: "Not enough stock to accept this booking",
    });
  }

  try {
    await StockLog.create({
      listing: updatedListing._id,
      type: "checkout",
      quantity: decrementBy,
      note: `Checked out for booking ${booking._id}`,
      createdBy: req.user?._id,
    });
  } catch (e) {
    console.error("Failed to create stock log for booking accept", e);
  }

  booking.status = "accepted";
  try {
    await booking.save();
  } catch (e) {
    console.error("Failed to save booking after stock update", e);
    try {
      await Listing.updateOne(
        { _id: updatedListing._id },
        { $inc: { quantity: decrementBy } }
      );
    } catch (rbErr) {
      console.error(
        "Failed to rollback listing quantity after booking save failure",
        rbErr
      );
    }
    return res.status(500).json({
      success: false,
      message: "Failed to accept booking",
    });
  }

  try {
    await createActivityLog({
      vendorId: vendor.userId,
      heading: {
        en: "Booking Accepted",
        nl: "Boeking Geaccepteerd",
      },
      type: "booking_accepted",
      description: {
        en: `Booking ${booking.trackingId} has been accepted`,
        nl: `Boeking ${booking.trackingId} is Geaccepteerd`,
      },
      bookingId: booking._id,
      userId: req.user?._id,
    });
  } catch (e) {
    console.error("Failed to create activity log", e);
  }

  try {
    await notificationController.createNotification({
      title: {
        en: "Booking Status",
        nl: "Boekingstatus",
      },
      notificationFor: "Vendor",
      vendorId: booking.vendorId, // vendor's user account receives notification
      clientId: booking.userId, //
      bookingId: booking._id,
      message: {
        en: `Booking against ${booking.trackingId} has been accepted`,
        nl: `Boeking met betrekking tot ${booking.trackingId} is geaccepteerd.`,
      },
    });
  } catch (e) {
    console.error(
      "Failed to create client notification for accepted booking:",
      e
    );
  }

  await booking.populate([
    { path: "userId", select: "firstName lastName email contactNumber" },
    { path: "listingId", select: "title featuredImage pricing" },
  ]);

  res.json({
    success: true,
    message: "Booking request accepted successfully",
    data: {
      booking,
    },
  });
});

const getAmountToPay = async (req, res) => {
  try {
    const { id } = req.params;
    const bookingDetails = await Booking.findOne({ _id: id });

    if (!bookingDetails) {
      return res.status(404).json({ error: "Booking not found" });
    }

    let amountToPay;

    // Condition 1: User is not paying upfront
    if (!bookingDetails.willPayUpfront) {
      amountToPay = bookingDetails.AmountLeft;
    }
    // Condition 2: Paying upfront but upfront NOT paid yet
    else if (bookingDetails.willPayUpfront && !bookingDetails.isUpfrontPaid) {
      amountToPay = bookingDetails?.pricingBreakdown?.upfrontFee;
    }
    // Condition 3: Paying upfront BUT upfront already paid → still amountLeft
    else if (bookingDetails.willPayUpfront && bookingDetails.isUpfrontPaid) {
      amountToPay = bookingDetails.AmountLeft;
    }

    res.json({ amountToPay });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createPaymentIntent = async (req, res) => {
  try {
    const { amount, currency = "usd" } = req.body;
    if (!amount) {
      return res.status(400).json({ error: "Amount is required" });
    }
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // convert to cents
      currency,
      automatic_payment_methods: { enabled: true },
    });
    res.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const rejectBooking = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rejectionReason } = req.body;

  const vendor = await User.findOne({ _id: req.user.id });
  if (!vendor) {
    return res.status(404).json({
      success: false,
      message: "Vendor profile not found",
    });
  }

  const booking = await BookingRequest.findOne({
    _id: id,
    vendorId: vendor._id,
    status: "pending",
  });

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking request not found or already processed",
    });
  }

  booking.status = "rejected";
  booking.rejectionReason = rejectionReason || "No reason provided";
  await booking.save();

  try {
    await createActivityLog({
      vendorId: req.user.id,
      heading: {
        en: "Booking Rejected",
        nl: "Boeking Geweigerd",
      },
      type: "booking_rejected",
      description: {
        en: `Booking ${booking.trackingId} has been rejected`,
        nl: `Boeking ${booking.trackingId} is Geweigerd`,
      },
      bookingId: booking._id,
      userId: req.user?.id,
    });
  } catch (e) {
    console.error("Failed to create activity log", e);
  }

  try {
    // await notificationController.createNotification({
    //   user: booking.userId,
    //   bookingId: booking._id,
    //   message: `Your booking has been rejected.`,
    // });
    console.log(vendor, "vendorvendorvendorvendor");

    if (vendor?.notifications?.push === true) {
      await notificationController.createNotification({
        title: {
          en: "Booking Status",
          nl: "Boekingstatus",
        },
        notificationFor: "Vendor",
        vendorId: booking.vendorId, // vendor's user account receives notification
        clientId: booking.userId, //
        bookingId: booking._id,
        message: {
          en: `Booking against ${booking.trackingId} has been rejected`,
          nl: `Boeking met betrekking tot ${booking.trackingId} is Geweigerd.`,
        },
      });
    }
  } catch (e) {
    console.error(
      "Failed to create client notification for rejected booking:",
      e
    );
  }

  await booking.populate([
    { path: "userId", select: "firstName lastName email contactNumber" },
    { path: "listingId", select: "title featuredImage pricing" },
  ]);

  res.json({
    success: true,
    message: "Booking request rejected",
    data: {
      booking,
    },
  });
});

const paymentConfirmation = async (req, res) => {
  try {
    const { bookingId, paymentIntent, amount } = req.body;
    console.log(req.body, "req.bodyreq.bodyreq.body");

    // Validate
    if (!bookingId || !paymentIntent || !amount) {
      return res.status(400).json({
        success: false,
        message: "bookingId, paymentIntent and amount are required.",
      });
    }

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    const paidAmount = Number(amount);

    if (isNaN(paidAmount) || paidAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a valid positive number.",
      });
    }
    console.log(booking, "bookingbookingbookingbookingbooking");

    // if (
    //   booking.willPayUpfront === true &&
    //   booking.isUpfrontPaid === true &&
    //   booking.paymentStatus === "upfront_paid" &&
    //   booking.AmountPaid > 0 &&
    //   booking.AmountPaid < booking.pricingBreakdown.total &&
    //   paidAmount === booking.pricingBreakdown.upfrontFee
    // ) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Upfront payment has already been made."
    //   });
    // }

    // ❌ Prevent any payment if already fully paid
    if (booking.paymentStatus === "fully_paid") {
      return res.status(400).json({
        success: false,
        message: "This booking is already fully paid.",
      });
    }

    // Update amounts
    booking.paymentIntentId = paymentIntent;
    booking.AmountPaid = (booking.AmountPaid || 0) + paidAmount;
    booking.AmountLeft =
      Number(booking.pricingBreakdown?.total || 0) - Number(paidAmount);

    // Fully paid check
    console.log(
      booking.AmountPaid,
      booking.pricingBreakdown,
      "bookingbookingbooking"
    );

    if (booking.AmountPaid >= (booking.pricingBreakdown?.total || 0)) {
      booking.isFullyPaid = true;
      booking.AmountLeft = 0;
      booking.paymentStatus = "paid"; // safety

      // await notificationController.createNotification({
      //   notificationFor: "Vendor",
      //   vendorId: booking?.vendorId, // vendor's user account receives notification
      //   clientId: booking?.userId, //
      //   bookingId: booking?._id,
      //   message: `full payment against ${booking.trackingId} has been paid`,
      // });
      await notificationController.createNotification({
        title: {
          en: "Payment Status",
          nl: "Betalingstatus",
        },
        notificationFor: "Vendor",
        vendorId: booking?.vendorId, // vendor's user account receives notification
        clientId: booking?.userId, //
        bookingId: booking?._id,
        message: {
          en: `full payment against ${booking.trackingId} has been paid`,
          nl: `De volledige betaling voor ${booking.trackingId} is voldaan`,
        },
      });
    } else {
      booking.paymentStatus = "upfront_paid";
      booking.isUpfrontPaid = true;
      // await notificationController.createNotification({
      //   notificationFor: "Vendor",
      //   vendorId: booking?.vendorId, // vendor's user account receives notification
      //   clientId: booking?.userId, //
      //   bookingId: booking?._id,
      //   message: `Upfront payment against ${booking.trackingId} has been paid`,
      // });
      await notificationController.createNotification({
        title: {
          en: "Payment Status",
          nl: "Betalingstatus",
        },
        notificationFor: "Vendor",
        vendorId: booking?.vendorId, // vendor's user account receives notification
        clientId: booking?.userId, //
        bookingId: booking?._id,
        message: {
          en: `Upfront payment against ${booking.trackingId} has been paid.`,
          nl: `De vooruitbetaling voor ${booking.trackingId} is voldaan.`,
        },
      });
    }

    // Optional: store payment intent ID

    await booking.save();

    res.status(200).json({
      success: true,
      message: "Payment Received Successfully.",
      data: {
        bookingId: booking._id,
        amountPaid: booking.AmountPaid,
        amountLeft: booking.AmountLeft,
        isFullyPaid: booking.isFullyPaid,
      },
    });
  } catch (error) {
    console.error("Payment confirmation error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

module.exports = {
  acceptBooking,
  rejectBooking,
  getVendorBookingAnalytics,
  createPaymentIntent,
  paymentConfirmation,
  getAmountToPay,
};
