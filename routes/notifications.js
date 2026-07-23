const express = require("express");
const router = express.Router();
const { getNotifications, markAsRead, markAllAsRead } = require('../controllers/notificationController');
const { requireAuth } = require('../middleware/authMiddleware');
const BookingRequest = require("../models/Booking");

// Get all notifications for the logged-in user
const Vendor = require("../models/Vendor");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { default: mongoose } = require("mongoose");
const {
  getVendorNotificationRecipientIds,
} = require("../utils/resolveVendorUserId");

router.get("/", requireAuth, async (req, res) => {
  try {
    const notifications = await Notification.find({
      notificationFor: "Client",
      clientId: req.user.id,
    }).sort({ createdAt: -1 });

    res.json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


router.get("/admin-notifications", async (req, res) => {
  try {
    const notifications = await Notification.aggregate([
      {
        $match: { notificationFor: "Admin" },
      },
      {
        $lookup: {
          from: "bookingrequests",      // MongoDB collection name
          localField: "bookingId",
          foreignField: "_id",
          as: "booking",
        },
      },
      {
        $unwind: {
          path: "$booking",
          preserveNullAndEmptyArrays: true, // In case notification has no booking
        },
      },
      {
        $project: {
          message: 1,
          type: 1,
          createdAt: 1,
          bookingId: 1,
          isRead: 1,
          trackingId: "$booking.trackingId", // get trackingId from booking
        },
      },
      {
        $sort: { createdAt: -1 },
      },
    ]);

    res.json({ success: true, data: notifications });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/vendor-notifications", requireAuth, async (req, res) => {
  try {
    const vendorIds = await getVendorNotificationRecipientIds(req.user);

    const notifications = await Notification.find({
      notificationFor: "Vendor",
      vendorId: { $in: vendorIds },
    }).sort({ createdAt: -1 });

    const finalNotifications = await Promise.all(
      notifications.map(async (notification) => {
        let trackingId = null;

        if (notification.bookingId) {
          const booking = await BookingRequest.findById(
            notification.bookingId,
          ).select("trackingId");

          trackingId = booking?.trackingId || null;
        }

        return {
          ...notification.toObject(),
          trackingId,
        };
      }),
    );

    res.json({ success: true, data: finalNotifications });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark a notification as read
router.patch("/:id/client-read", requireAuth, async (req, res) => {
  const notification = await Notification.findByIdAndUpdate(
    req.params.id,
    { isClientRead: true },
    { new: true },
  );
  res.json({ success: true, data: notification });
});
router.patch("/:id/read", requireAuth, async (req, res) => {
  const notification = await Notification.findByIdAndUpdate(
    req.params.id,
    { isRead: true },
    { new: true },
  );
  res.json({ success: true, data: notification });
});

// Mark all notifications as read
router.patch("/read-all", async (req, res) => {
  await markAllAsRead();
  res.json({ success: true, message: "All notifications marked as read" });
});

// Mark all in-app notifications as read for a given userId (client or vendor)
router.patch("/mark-all-as-read/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, error: "Invalid userId" });
    }

    // Try to find the user
    let user = await User.findById(userId).select("userType");

    // Fallback: if userId belongs to a Vendor profile, resolve to the owner User
    if (!user) {
      const vendorProfile = await Vendor.findById(userId).select("userId");
      if (vendorProfile?.userId) {
        user = await User.findById(vendorProfile.userId).select("userType");
      }
    }

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    let updateResult;

    if (user.userType === "client") {
      updateResult = await Notification.updateMany(
        { clientId: userId, isClientRead: false },
        { isClientRead: true },
      );
    } else if (user.userType === "vendor") {
      updateResult = await Notification.updateMany(
        { vendorId: userId, isRead: false },
        { isRead: true },
      );
    } else {
      return res.status(400).json({ success: false, error: "Unsupported userType" });
    }

    res.json({
      success: true,
      modifiedCount: updateResult.modifiedCount,
      message: `Marked ${updateResult.modifiedCount} notification(s) as read`,
    });
  } catch (error) {
    console.error("Error marking notifications as read:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
