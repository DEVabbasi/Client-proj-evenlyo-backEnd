const asyncHandler = require("express-async-handler");
const Booking = require("../../models/Booking");
const BookingRequest = require("../../models/Booking");
const User = require("../../models/User");
const Listing = require("../../models/Listing");
const Vendor = require("../../models/Vendor");
const Purchase = require("../../models/SaleItemPurchase");
const ServiceItem = require("../../models/Item");
const StockLog = require("../../models/StockLog");
const notificationController = require("../notificationController");
const SupportTicket = require("../../models/SupportTicket");

// GET /api/vendor/tracking
const getVendorBookings = async (req, res) => {
  try {
    // Find the vendor profile for the logged-in user

    const vendor = await Vendor.findOne({ userId: req.user.id });
    console.log(vendor, "vendorvendorvendorvendorvendorvendorvendorasdasd");

    if (!vendor) {
      return res
        .status(404)
        .json({ bookings: [], message: "Vendor profile not found" });
    }
    const bookings = await Booking.find({ vendorId: vendor.userId })
      .populate({
        path: "userId",
        select: "firstName lastName profileImage address",
      })
      .populate({
        path: "listingId",
        select: "title",
      })
      .sort({ createdAt: -1 });

    const result = bookings.map((b) => ({
      paymentStatus: b.paymentStatus,
      trackingId: b.trackingId,
      eventDate: b.details?.startDate,
      pricingBreakdown: b?.pricingBreakdown,
      buyer: {
        name: b.userId?.firstName + " " + b.userId?.lastName,
        profileImage: b.userId?.profileImage,
      },
      title: b.listingDetails?.title || "",
      deliveryDate: b.details?.endDate,
      location: b.details?.eventLocation || b.userId?.address?.city,
      status: b.status,
      _id: b._id,
      statusHistory: b.statusHistory || [],
    }));
    res.json({ bookings: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// @desc    Mark booking as on the way (Vendor action)
// @route   POST /api/booking/:id/mark-on-the-way
// @access  Private (Vendor)
const markBookingOnTheWay = asyncHandler(async (req, res) => {
  // const { driverInfo } = req.body; // driverInfo is not required for now

  // Get vendor profile
  const vendor = await Vendor.findOne({ userId: req.user.id });
  console.log(vendor, "vendorvendorvendor");

  if (!vendor) {
    return res.status(404).json({
      success: false,
      message: "Vendor profile not found",
    });
  }

  const booking = await BookingRequest.findOne({
    _id: req.params.id,
    vendorId: vendor.userId,
    paymentStatus: "paid",
  });

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found or not eligible for this action",
    });
  }

  booking.status = "on_the_way";

  await booking.save();

  // Notify client (user) that booking is on the way
  try {
    await notificationController.createNotification({
      title: {
        en: "Your booking is on the way!",
        nl: "Uw boeking is onderweg!"
      },
      notificationFor: "Vendor",
      vendorId: booking?.vendorId, // vendor's user account receives notification
      clientId: booking?.userId, // 
      bookingId: booking?._id,
      message: {
        en: `booking against ${booking.trackingId} is on the way`,
        nl: `Boeking met tracking ID ${booking.trackingId} is onderweg`
      }
    });
  } catch (e) {
    console.error(
      "Failed to create client notification for on_the_way booking:",
      e
    );
  }
  res.json({
    success: true,
    message: "Booking marked as on the way",
    data: { booking },
  });
});

// @desc    Mark booking as picked up (Vendor action)
// @route   POST /api/booking/:id/mark-picked-up
// @access  Private (Vendor)
const markBookingPickedUp = asyncHandler(async (req, res) => {
  const { condition, securityFee, claimAmount } = req.body;
  // condition: 'Good', 'Fair', 'Claim'
  // securityFee: number (required for Fair/Claim)
  // claimAmount: number (required for Claim)

  // Get vendor profile

  console.log(req.user, "req.userreq.userreq.userreq.user");

  const vendor = await Vendor.findOne({ userId: req.user.id });
  if (!vendor) {
    return res.status(404).json({
      success: false,
      message: "Vendor profile not found",
    });
  }

  const booking = await BookingRequest.findOne({
    _id: req.params.id,
    vendorId: vendor.userId,
    // status: "finished",
  }).populate("vendorId", "email _id");

  console.log(booking.vendorId, "bookingbookingbookingbooking")

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found or not eligible for this action",
    });
  }

  // Store condition and set status based on condition
  booking.condition = (condition || "").toLowerCase();
  if (condition === "claim") {
    booking.status = "claim";
  } else {
    booking.status = "picked_up";
  }

  console.log(booking.condition, "booking.conditionbooking.condition");


  if (condition === "good") {
  } else if (condition === "fair") {
    const parsedSecurityFee = Number(securityFee);
    if (!Number.isFinite(parsedSecurityFee) || parsedSecurityFee <= 0) {
      return res.status(400).json({
        success: false,
        message: "Security fee is required for fair condition.",
      });
    }
    // booking.pricing.securityFee = parsedSecurityFee;
    // booking.pricing.claimAmount = 0;
    // Store in claimDetails for admin review
    booking.claimDetails = {
      reason: {
        en: "Fair condition - security fee deduction",
        nl: "Redelijke staat - aftrek van borg",
      },
      claimedBy: "vendor",
      claimedAt: new Date(),
      status: "pending",
      amount: parsedSecurityFee,
      stockUpdated: false
    };
    // await notificationController.createNotification({
    //   notificationFor: "Admin",
    //   bookingId: booking._id,
    //   message: `Claim request submitted by vendor for booking. Claim Amount is ${parsedClaimAmount} against the tracking id ${booking.trackingId}`,
    // });
    // const supportTicket = new SupportTicket({
    //   userEmail: booking.vendorId.email,
    //   userId: booking.vendorId.id,
    //   issueRelatedto: "Claim",
    //   details: `Claim request submitted by vendor for booking. Claim Amount is ${parsedClaimAmount} against the tracking id ${booking.trackingId}`
    // });
    // await supportTicket.save();
  } else if (condition === "claim") {
    const parsedClaimAmount = Number(claimAmount);
    if (!Number.isFinite(parsedClaimAmount) || parsedClaimAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Claim amount is required for claim condition.",
      });
    }
    // securityFee can be optional for claim; default to 0 if not provided
    // const parsedSecurityFee = Number(securityFee);
    // const safeSecurityFee =
    //   Number.isFinite(parsedSecurityFee) && parsedSecurityFee >= 0
    //     ? parsedSecurityFee
    //     : 0;
    // booking.pricing.securityFee = safeSecurityFee;
    booking.claimDetails = {
      reason: {
        en: "Claim requested by vendor",
        nl: "Claim aangevraagd door leverancier",
      },
      claimedBy: "vendor",
      claimedAt: new Date(),
      status: "pending",
      amount: parsedClaimAmount,
      stockUpdated: false
    };
    // Send request/notification to admin for claim approval
    try {
      await notificationController.createNotification({
        notificationFor: "Admin",
        bookingId: booking._id,
        message: `Claim request submitted by vendor for booking. Claim Amount is ${parsedClaimAmount} against the tracking id ${booking.trackingId}`,
      });
      const supportTicket = new SupportTicket({
        userEmail: booking.vendorId.email,
        userId: booking.vendorId.id,
        issueRelatedto: "Claim",
        details: `Claim request submitted by vendor for booking. Claim Amount is ${parsedClaimAmount} against the tracking id ${booking.trackingId}`
      });
      await supportTicket.save();
    } catch (e) {
      console.error("Failed to notify admin for claim request:", e);
    }
  } else {
    return res.status(400).json({
      success: false,
      message: "Invalid condition. Must be one of: Good, Fair, Claim.",
    });
  }

  await booking.save();

  // Notify vendor that booking is picked up
  try {
    const vendor = await Vendor.findById(booking.vendorId);
    await notificationController.createNotification({
      title: {
        en: "Booking Status",
        nl: "Boekingstatus"
      },
      notificationFor: "Vendor",
      vendorId: booking?.vendorId, // vendor's user account receives notification
      clientId: booking?.userId, //
      bookingId: booking?._id,
      message: {
        en: `booking against ${booking.trackingId} has been marked as picked-up`,
        nl: `Boeking met betrekking tot ${booking.trackingId} is gemarkeerd als opgehaald.`,
      }
    });
  } catch (e) {
    console.error(
      "Failed to create vendor notification for picked up booking:",
      e
    );
  }

  res.json({
    success: true,
    message: "Booking marked as picked up",
    data: {
      booking: {
        _id: booking._id,
        status: booking.status,
        condition: booking.condition,
        // securityFee: booking.pricing.securityFee,
        // claimAmount: booking.pricing.claimAmount,
        // totalClaim:
        //   booking.condition === "claim"
        //     ? booking.pricing.securityFee + booking.pricing.claimAmount
        //     : booking.pricing.securityFee,
      },
    },
  });
});

// @desc    Mark booking as completed
// @route   POST /api/booking/:id/mark-completed
// @access  Private (Vendor) markBookingCompleted
const markBookingCompleted = asyncHandler(async (req, res) => {
  // Get vendor profile
  const vendor = await Vendor.findOne({ userId: req.user.id });
  if (!vendor) {
    return res.status(404).json({
      success: false,
      message: "Vendor profile not found",
    });
  }

  const booking = await BookingRequest.findOne({
    _id: req.params.id,
    vendorId: vendor.userId,
    status: { $in: ["received_back"] },
  });
  console.log("markBookingCompleted - Found booking:", booking);
  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found or not eligible for this action",
    });
  }

  booking.status = "completed";

  // Atomically increment listing quantity by 1 (item returned to stock)
  try {
    const updatedListing = await Listing.findOneAndUpdate(
      { _id: booking.listingId, vendor: vendor.userId },
      { $inc: { quantity: 1 } },
      { new: true }
    );
    if (updatedListing) {
      // Log check-in
      try {
        await StockLog.create({
          listing: updatedListing._id,
          type: "checkin",
          quantity: 1,
          note: `Returned after booking ${booking._id}`,
          createdBy: req.user?._id,
        });
      } catch (logErr) {
        console.error(
          "Failed to create stock log on booking completion",
          logErr
        );
      }
    } else {
      console.warn(
        "Listing not found for increment on booking completion",
        booking.listingId?.toString()
      );
    }
  } catch (incErr) {
    console.error(
      "Failed to increment listing quantity on booking completion",
      incErr
    );
  }

  await booking.save();

  // Notify client that booking is completed
  try {
    await notificationController.createNotification({
      title: {
        en: "Tracking Status",
        nl: "Trackingstatus"
      },
      notificationFor: "Vendor",
      vendorId: booking?.vendorId, // vendor's user account receives notification
      clientId: booking?.userId, //
      bookingId: booking?._id,
      message: {
        en: `booking against ${booking.trackingId} has been marked as completed`,
        nl: `Boeking met betrekking tot ${booking.trackingId} is gemarkeerd als voltooid.`,
      }
    });
  } catch (e) {
    console.error(
      "Failed to create client notification for completed booking:",
      e
    );
  }

  // Notify admins that booking is completed
  try {
    await notificationController.createAdminNotification({
      message: `A booking has been marked as completed by the vendor.`,
      bookingId: booking._id,
    });
  } catch (e) {
    console.error(
      "Failed to create admin notification for completed booking:",
      e
    );
  }
  res.json({
    success: true,
    message: "Booking marked as complete",
    data: { booking },
  });
});

// @desc    Mark booking as received back
// @route   POST /api/vendor/bookings/:id/received-back
// @access  Private (Vendor)
const markAsReceivedBack = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Get vendor profile
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
    status: { $in: ["picked_up", "claim"] },
  });

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found or not in picked_up/claim status",
    });
  }

  console.log(
    `Marking booking ${id} as received_back for vendor ${vendor._id}`
  );

  booking.status = "received_back";
  await booking.save();

  // Notify client (user) of received back
  try {
    await notificationController.createNotification({
      title: {
        en: "Tracking Status",
        nl: "Trackingstatus"
      },
      notificationFor: "Vendor",
      vendorId: booking?.vendorId, // vendor's user account receives notification
      clientId: booking?.userId, //
      bookingId: booking?._id,
      message: {
        en: `booking against ${booking.trackingId} has been marked as received-back`,
        nl: `Boeking met betrekking tot ${booking.trackingId} is gemarkeerd als terugontvangen`,
      }
    });
  } catch (e) {
    console.error(
      "Failed to create client notification for received back booking:",
      e
    );
  }

  await booking.populate([
    { path: "userId", select: "firstName lastName email contactNumber" },
    { path: "listingId", select: "title featuredImage pricing" },
  ]);

  res.json({
    success: true,
    message: "Booking marked as received back successfully",
    data: {
      booking,
    },
  });
});

// GET /api/vendor/tracking/purchases
const getVendorPurchases = async (req, res) => {
  try {
    // Find the vendor profile for the logged-in user
    const vendor = await Vendor.findOne({ userId: req.user.id });
    if (!vendor) {
      return res
        .status(404)
        .json({ purchases: [], message: "Vendor profile not found" });
    }

    // Find all purchases for this vendor
    const purchases = await Purchase.find({ vendor: vendor._id })
      .populate({
        path: "user",
        select: "firstName lastName profileImage address",
      })
      .populate({
        path: "item",
        select: "title",
      })
      .sort({ createdAt: -1 });

    const result = purchases.map((purchase) => ({
      trackingId: purchase.trackingId || "",
      date: purchase.purchasedAt,
      userName: purchase.userName,
      itemName: purchase.itemName,
      location: purchase.location,
      status: purchase.status,
      _id: purchase._id,
    }));

    res.json({ purchases: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getVendorBookings,
  getVendorPurchases,
  markBookingOnTheWay,
  markBookingPickedUp,
  markAsReceivedBack,
  markBookingCompleted,
};
