const asyncHandler = require("express-async-handler");
const Booking = require("../../models/Booking");
const Vendor = require("../../models/Vendor");
const User = require("../../models/User");
const BookingRequest = require("../../models/Booking");
const notificationController = require("../notificationController");
const Listing = require("../../models/Listing");
const StockLog = require("../../models/StockLog");
const moment = require("moment");
const {
  getAvailabilityDetails,
  checkAvailability,
} = require("../../utils/bookingUtils");
const { createActivityLog } = require("../../utils/activityLogger");
const stripe = require("../../config/stripe");
const { default: mongoose } = require("mongoose");
const { sendOrderStatusEmail, sendEvenlyoProtectBookingEmail } = require("../../utils/mailer");
const AdminEmployee = require("../../models/AdminEmployee");
const { notifyVendorNewBooking } = require("../../utils/notifyVendorNewBooking");
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
          .populate("userId", "firstName lastName email contactNumber address")
          .populate("listingId", "title")
          .select(
            "pricingBreakdown details status trackingId userId listingId description eventLocation createdAt statusHistory listingDetails"
          ),
      ]);

    // Get unique listing IDs
    const listingIds = [
      ...new Set(bookings.map((b) => b.listingId).filter((id) => id)),
    ];

    const bookingsList = bookings.map((b) => ({
      pricingBreakdown: b.pricingBreakdown,
      id: b._id,
      startDate: b.details?.startDate,
      endDate: b.details?.endDate,
      startTime: b.details?.startTime,
      endTime: b.details?.endTime,
      status: b.status,
      title: b.listingDetails?.title || "",
      customer: b.userId,
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

const getVendorBookingById = async (req, res) => {
  try {
    const vendorId = req.user?.id;
    const { bookingId } = req.params;
    console.log(bookingId, "bookingIdbookingIdbookingIdbookingId12323");

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "Vendor not found in request",
      });
    }

    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid bookingId",
      });
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      vendorId: vendorId,
    })
      .populate("userId", "firstName lastName email phone")
      .populate("listingId")
      .populate("vendorId", "firstName lastName email")
      .lean();

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found for this vendor",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Booking details fetched successfully",
      data: booking,
    });
  } catch (error) {
    console.error("Get vendor booking by ID error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Accept booking request
// @route   POST /api/booking/:id/accept
// @access  Private (Vendor)
const acceptBooking = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const vendor = await Vendor.findOne({ userId: req.user.id });
  const vendorDetails = await User.findOne({ _id: req.user.id });
  console.log(vendorDetails, 'vendorvendorvendorvendor');

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

  console.log(booking, "bookingbookingbookingbooking");


  const listingDetails = await Listing.findOne({
    _id: booking.listingId,
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
      message: {
        en: `Booking against ${booking.trackingId} has been accepted`,
        nl: `Boeking met betrekking tot ${booking.trackingId} is geaccepteerd.`,
      },
      notificationFor: "Client",
      clientId: booking.userId, //
      vendorId: booking.vendorId, // vendor's user account receives notification
      bookingId: booking._id,

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

  console.log(booking, "bookingbookingbookingbookingbookingbookingbooking");

  const user = await User.findById({ _id: booking.userId._id });
  console.log(user, "useruseruseruser");

  if (user.notifications?.email === true) {
    try {
      await sendOrderStatusEmail({
        customerEmail: booking.userId.email,
        customerName: `${booking.userId.firstName} ${booking.userId.lastName}`,
        bookingId: booking.trackingId,
        status: "ACCEPTED",
        bookingDate: booking.details.startDate,
        bookingTime: `${booking.details.startTime} - ${booking.details.endTime}`,
      });
    }
    catch (e) {
      console.error("Failed to send order acceptance email:", e);
    }
  }

  if (user.notifications?.push === true) {
    try {
      await notifyVendorNewBooking({
        title: "Boeking Geaccepteerd",
        message: `Nieuwe boekingsaanvraag voor uw aanbod "${listingDetails.title.nl}" van ${moment(booking.details.startDate).format("DD MMM YYYY")} is geaccepteerd.`,
        receiverDetails: user,
        bookingRequest: booking,
      });
    } catch (e) {
      console.error("Failed to create vendor notification for new booking:", e);
    }
  }

  const bookingDates = `${moment(booking.details.startDate).format("DD-MMM-YYYY")}${booking.details.endDate !== booking.details.startDate ? ` to ${moment(booking.details.endDate).format("Do MMM YYYY")}` : ""}`;
  try {
    const isEvenlyoProtectEnabled =
      booking.pricingBreakdown?.paymentPolicy?.isEvenlyoProtectEnabled === true;

    if (isEvenlyoProtectEnabled) {
      const adminsToNotifyPush = await AdminEmployee.findOne({
        role: "Admin",
        status: "active",
        "notificationSettings.push.evenlyoProtect": true
      }).select("_id name email");

      const adminsToNotifyEmail = await AdminEmployee.findOne({
        role: "Admin",
        status: "active",
        "notificationSettings.email.evenlyoProtect": true
      }).select("_id name email");

      if (adminsToNotifyPush) {
        await notificationController.createNotification({
          title: {
            en: "Evenlyo protected booking accepted",
            nl: "Door Evenlyo beschermde boeking geaccepteerd"
          },
          notificationFor: "Admin",
          vendorId: vendorDetails._id,
          clientId: booking.userId,
          bookingId: booking._id,
          message: {
            en: `A evenlyo protected booking request from ${user.fullName} for "${booking.listingId.title.en}" on ${bookingDates} is accepted. Tracking ID: ${booking.trackingId}`,
            nl: `Een beschermde boekingsaanvraag op Evenlyo van ${user.fullName} voor "${booking.listingId.title.nl}" op ${bookingDates} is geaccepteerd. Tracking-ID: ${booking.trackingId}`,
          },
        });
      }
      if (adminsToNotifyEmail) {
        sendEvenlyoProtectBookingEmail(
          booking,
          user.fullName,
          vendorDetails.fullName,
          'ACCEPTED',
          adminsToNotifyEmail.email,
        );
      }
    }
  } catch (e) {
    console.error("Failed to send admin notifications for accepted booking:", e);
  }

  res.json({
    success: true,
    message: {
      en: "Booking request accepted successfully",
      nl: "Boeking aanvraag succesvol geaccepteerd",
    },
    data: {
      booking,
    },
  });
});

const rejectBooking = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rejectionReason } = req.body;

  const vendor = await User.findOne({ _id: req.user.id });
  const vendorDetails = await User.findOne({ _id: req.user.id });
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
    await notificationController.createNotification({
      title: {
        en: "Booking Status",
        nl: "Boekingstatus",
      },
      notificationFor: "Client",
      vendorId: booking.vendorId,
      clientId: booking.userId,
      bookingId: booking._id,
      message: {
        en: `Booking against ${booking.trackingId} has been rejected`,
        nl: `Boeking met betrekking tot ${booking.trackingId} is Geweigerd.`,
      },
    });
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

  console.log(booking, "bookingbookingbookingbookingbookingbookingbooking");

  const listingDetails = await Listing.findOne({
    _id: booking.listingId,
  });
  const user = await User.findById({ _id: booking.userId._id });
  console.log(user, "useruseruseruser");

  if (user.notifications?.email === true) {
    try {
      await sendOrderStatusEmail({
        customerEmail: booking.userId.email,
        customerName: `${booking.userId.firstName} ${booking.userId.lastName}`,
        bookingId: booking.trackingId,
        status: "REJECTED",
        bookingDate: booking.details.startDate,
        bookingTime: `${booking.details.startTime} - ${booking.details.endTime}`,
      });
    }
    catch (e) {
      console.error("Failed to send order acceptance email:", e);
    }
  }

  if (user.notifications?.push === true) {
    try {
      await notifyVendorNewBooking({
        title: "Boeking Geweigerd",
        message: `Nieuwe boekingsaanvraag voor uw aanbod "${listingDetails.title.nl}" van ${moment(booking.details.startDate).format("DD MMM YYYY")} is geweigerd.`,
        receiverDetails: user,
        bookingRequest: booking,
      });
    } catch (e) {
      console.error("Failed to create vendor notification for new booking:", e);
    }
  }

  const bookingDates = `${moment(booking.details.startDate).format("DD-MMM-YYYY")}${booking.details.endDate !== booking.details.startDate ? ` to ${moment(booking.details.endDate).format("Do MMM YYYY")}` : ""}`;
  try {
    const isEvenlyoProtectEnabled =
      booking.pricingBreakdown?.paymentPolicy?.isEvenlyoProtectEnabled === true;

    if (isEvenlyoProtectEnabled) {
      const adminsToNotifyPush = await AdminEmployee.findOne({
        role: "Admin",
        status: "active",
        "notificationSettings.push.evenlyoProtect": true
      }).select("_id name email");

      const adminsToNotifyEmail = await AdminEmployee.findOne({
        role: "Admin",
        status: "active",
        "notificationSettings.email.evenlyoProtect": true
      }).select("_id name email");

      if (adminsToNotifyPush) {
        await notificationController.createNotification({
          title: {
            en: "Evenlyo protected booking rejected",
            nl: "Door Evenlyo beschermde boeking geweigerd"
          },
          notificationFor: "Admin",
          vendorId: vendorDetails._id,
          clientId: booking.userId,
          bookingId: booking._id,
          message: {
            en: `A evenlyo protected booking request from ${user.fullName} for "${booking.listingId.title.en}" on ${bookingDates} is rejected. Tracking ID: ${booking.trackingId}`,
            nl: `Een beschermde boekingsaanvraag op Evenlyo van ${user.fullName} voor "${booking.listingId.title.nl}" op ${bookingDates} is geweigerd. Tracking-ID: ${booking.trackingId}`,
          },
        });
      }
      if (adminsToNotifyEmail) {
        sendEvenlyoProtectBookingEmail(
          booking,
          user.fullName,
          vendorDetails.fullName,
          'REJECTED',
          adminsToNotifyEmail.email,
        );
      }
    }
  } catch (e) {
    console.error("Failed to send admin notifications for rejected booking:", e);
  }

  res.json({
    success: true,
    message: {
      en: "Booking request rejected",
      nl: "Boeking aanvraag geweigerd",
    },
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
    const { amount, currency = "eur", bookingId } = req.body;

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (!amount) {
      return res.status(400).json({ error: "Amount is required" });
    }

    // 🔥 Combine endDate + endTime into one Date object
    const eventEndDateTime = new Date(
      `${booking.details.startDate.toISOString().split("T")[0]}T${booking.details.startTime}:00Z`
    );

    const now = new Date();

    // 🚫 If event already finished
    if (now > eventEndDateTime) {
      return res.status(400).json({
        error: "This event has already ended. Payment is no longer allowed.",
      });
    }

    console.log(Math.round(amount * 100), "Math.round(amount * 100)Math.round(amount * 100)Math.round(amount * 100)");

    // ✅ Create PaymentIntent if event not passed
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
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


const paymentConfirmation = async (req, res) => {
  try {
    const { bookingId, paymentIntent, amount } = req.body;

    if (!bookingId || !paymentIntent || !amount) {
      return res.status(400).json({
        success: false,
        message: "bookingId, paymentIntent and amount are required.",
      });
    }

    const booking = await Booking.findById(bookingId);
    const vendorDetails = await User.findOne({ _id: booking.vendorId });
    console.log(vendorDetails, "vendorDetailsvendorDetailsvendorDetailsvendorDetails");

    if (vendorDetails.notifications?.push === true) {
      try {
        await notifyVendorNewBooking({
          title: "Betaling Ontvangen",
          message: `Een betaling van €${amount} is ontvangen voor boeking ${booking.trackingId}.`,
          receiverDetails: vendorDetails,
          bookingRequest: booking,
        });
      } catch (e) {
        console.error("Failed to create vendor notification for new booking:", e);
      }
    }

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

    // ❌ Prevent payment if already fully paid
    if (booking.paymentStatus === "paid" || booking.isFullyPaid) {
      return res.status(400).json({
        success: false,
        message: "This booking is already fully paid.",
      });
    }

    // ✅ INIT payments array if not exists
    if (!booking.payments) {
      booking.payments = [];
    }

    // ✅ Prevent duplicate paymentIntent
    const alreadyExists = booking.payments.find(
      (p) => p.paymentIntentId === paymentIntent
    );

    if (alreadyExists) {
      return res.status(400).json({
        success: false,
        message: "This payment is already recorded.",
      });
    }

    // ✅ Calculate total before adding new payment
    const currentPaid = booking.AmountPaid || 0;
    const totalAmount = Number(booking.pricingBreakdown?.total || 0);

    // ❌ Prevent overpayment
    console.log(currentPaid, paidAmount, totalAmount, "payment amounts");

    if (currentPaid + paidAmount > totalAmount) {
      return res.status(400).json({
        success: false,
        message: "Payment exceeds total booking amount.",
      });
    }

    // ✅ Detect payment type
    let paymentType = "remaining";

    if (currentPaid === 0 && paidAmount === totalAmount) {
      paymentType = "full";
    } else if (currentPaid === 0) {
      paymentType = "advance";
    }

    // ✅ PUSH PAYMENT (IMPORTANT FIX)
    booking.payments.push({
      paymentIntentId: paymentIntent,
      amount: paidAmount,
      type: paymentType,
      status: "paid",
      createdAt: new Date(),
    });

    // ✅ Update totals
    booking.AmountPaid = currentPaid + paidAmount;
    booking.AmountLeft = totalAmount - booking.AmountPaid;

    // ✅ Fully Paid Check
    if (booking.AmountPaid >= totalAmount) {
      booking.isFullyPaid = true;
      booking.AmountLeft = 0;
      booking.paymentStatus = "paid";

      await notificationController.createNotification({
        title: {
          en: "Payment Status",
          nl: "Betalingstatus",
        },
        notificationFor: "Vendor",
        vendorId: booking?.vendorId,
        clientId: booking?.userId,
        bookingId: booking?._id,
        message: {
          en: `Full payment against ${booking.trackingId} has been paid`,
          nl: `De volledige betaling voor ${booking.trackingId} is voldaan`,
        },
      });
    } else {
      booking.paymentStatus = "upfront_paid";
      booking.isUpfrontPaid = true;

      await notificationController.createNotification({
        title: {
          en: "Payment Status",
          nl: "Betalingstatus",
        },
        notificationFor: "Vendor",
        vendorId: booking?.vendorId,
        clientId: booking?.userId,
        bookingId: booking?._id,
        message: {
          en: `Partial payment against ${booking.trackingId} has been received.`,
          nl: `Gedeeltelijke betaling voor ${booking.trackingId} is ontvangen.`,
        },
      });
    }

    await booking.save();

    res.status(200).json({
      success: true,
      message: "Payment recorded successfully.",
      data: {
        bookingId: booking._id,
        amountPaid: booking.AmountPaid,
        amountLeft: booking.AmountLeft,
        isFullyPaid: booking.isFullyPaid,
        totalPayments: booking.payments.length,
      },
    });
  } catch (error) {
    console.error("Payment confirmation error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
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
  getVendorBookingById,
};
