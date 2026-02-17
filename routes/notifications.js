const express = require("express");
const router = express.Router();
const { getNotifications, markAsRead, markAllAsRead } = require('../controllers/notificationController');
const { requireAuth } = require('../middleware/authMiddleware');
const BookingRequest = require("../models/Booking");

// Get all notifications for the logged-in user
const Vendor = require("../models/Vendor");
const Notification = require("../models/Notification");
const { default: mongoose } = require("mongoose");

router.get("/", requireAuth, async (req, res) => {
  console.log(req.user.id, " req.user.id req.user.id");

  const notifications = await Notification.find({ clientId: req.user.id }).sort(
    { createdAt: -1 },
  );
  // let userIdToQuery = req.user.id;
  // console.log(userIdToQuery,"userIdToQueryuserIdToQuery");

  // if (req.user.userType === 'vendor') {
  //   // Find vendor profile for this user
  //   const vendorProfile = await Vendor.findOne({ userId: req.user.id });
  //   if (vendorProfile) {
  //     userIdToQuery = vendorProfile._id;
  //   }
  // }
  // const notifications = await getNotifications(userIdToQuery);
  res.json({ success: true, data: notifications });
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
    const notifications = await Notification.find({
      notificationFor: "Vendor",
      vendorId: req.user.id,
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

module.exports = router;
