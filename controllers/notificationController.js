const Notification = require('../models/Notification');
const { toMultilingualText } = require('../utils/textUtils');
const User = require('../models/User');
const Admin = require('../models/Admin');

// Get all active admin users
const getActiveAdmins = async () => {
  try {
    const admins = await Admin.find({ isActive: true }).populate('userId');
    return admins.map(admin => admin.userId).filter(user => user && user.isActive);
  } catch (err) {
    console.error('Error fetching active admins:', err);
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
        message: multilingualMessage
      });
      await notification.save();
      notifications.push(notification);
    }

    return notifications;
  } catch (err) {
    console.error('Error creating admin notifications:', err);
    return [];
  }
};

// Create a notification
const createNotification = async ({ title, notificationFor, vendorId, clientId, bookingId, message }) => {
  console.log(message, "message");

  try {
    // const multilingualMessage = toMultilingualText(message);
    const notification = new Notification({ title, notificationFor, vendorId, clientId, bookingId, message });
    await notification.save();
    return notification;
  }
  catch (err) {
    console.error('Error creating notification:', err);
    return null;
  }
};

// Get notifications for a user
const getNotifications = async (userId) => {
  return Notification.find({ user: userId }).sort({ createdAt: -1 });
};

// Mark a notification as read
const markAsRead = async (notificationId) => {
  return Notification.findByIdAndUpdate(notificationId, { isRead: true }, { new: true });
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
