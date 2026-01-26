const Notification = require("../models/Notification");
const { toMultilingualText } = require("../utils/textUtils");
const User = require("../models/User");
const Admin = require("../models/Admin");
const { sendNotification } = require("../utils/notifications");

// Get all active admin users
const getActiveAdmins = async () => {
  try {
    const admins = await Admin.find({ isActive: true }).populate("userId");
    return admins
      .map((admin) => admin.userId)
      .filter((user) => user && user.isActive);
  } catch (err) {
    console.error("Error fetching active admins:", err);
    return [];
  }
};

// Create admin notification for all active admins
const createAdminNotification = async ({ message, bookingId = null }) => {
  try {
    const admins = await getActiveAdmins();
    const notifications = [];
    const multilingualMessage = toMultilingualText(message);

    for (const admin of admins) {
      const notification = new Notification({
        user: admin._id,
        bookingId,
        message: multilingualMessage,
      });
      await notification.save();
      notifications.push(notification);
    }

    return notifications;
  } catch (err) {
    console.error("Error creating admin notifications:", err);
    return [];
  }
};

// Create notification + send FCM
const createNotification = async ({
  title,
  message,
  notificationFor, // "Client" | "Vendor" | "Admin"
  clientId = null,
  vendorId = null,
  bookingId = null,
}) => {
  try {
    // 1️⃣ Save in DB
    const notification = await Notification.create({
      title,
      message,
      notificationFor,
      clientId,
      vendorId,
      bookingId,
    });

    // 2️⃣ Find target user
    let user = null;

    if (notificationFor === "Client" && clientId) {
      user = await User.findById(clientId);
    }

    if (notificationFor === "Vendor" && vendorId) {
      user = await User.findById(vendorId);
    }

    // 3️⃣ Send FCM
    if (user?.fcm) {
      await sendNotification({
        token: user.fcm,
        title,
        body: message,
        data: {
          notificationId: notification._id.toString(),
        },
      });
    }

    return notification;
  } catch (err) {
    console.error("❌ createNotification error:", err);
    return null;
  }
};

// Get notifications for a user
const getNotifications = async (userId) => {
  return Notification.find({ user: userId }).sort({ createdAt: -1 });
};

// Mark a notification as read
const markAsRead = async (notificationId) => {
  return Notification.findByIdAndUpdate(
    notificationId,
    { isRead: true },
    { new: true },
  );
};

// Mark all notifications as read for a user
const markAllAsRead = async (userId) => {
  return Notification.updateMany({ isRead: false }, { isRead: true });
};

module.exports = {
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  getActiveAdmins,
  createAdminNotification,
};
