const Notification = require("../models/Notification");
const { toMultilingualText } = require("../utils/textUtils");
const User = require("../models/User");
const Vendor = require("../models/Vendor");
const Admin = require("../models/Admin");
const { sendNotification } = require("../utils/notifications");
const { resolveVendorOwnerUserId } = require("../utils/resolveVendorUserId");

const normalizeObjectId = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") return value._id ? String(value._id) : String(value);
  return String(value);
};

const resolveTargetUser = async ({ notificationFor, clientId, vendorId, projection = "" }) => {
  if (notificationFor === "Client" && clientId) {
    const id = normalizeObjectId(clientId);
    return User.findById(id).select(projection);
  }

  if (notificationFor === "Vendor" && vendorId) {
    const id = normalizeObjectId(vendorId);
    let user = await User.findById(id).select(projection);
    if (user) return user;

    // Fallback: in some flows vendorId is vendor profile id, not User id.
    const vendorProfile = await Vendor.findById(id).select("userId");
    if (!vendorProfile?.userId) return null;
    return User.findById(vendorProfile.userId).select(projection);
  }

  return null;
};

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
    const notification = await Notification.create({
      title,
      message,
      notificationFor,
      clientId,
      vendorId,
      bookingId,
    });
    return notification;
  } catch (err) {
    console.error("❌ createNotification error:", err);
    return null;
  }
};

const pickBestText = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.nl || value.en || "";
};

const stringifyFcmData = (data = {}) =>
  Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      value == null ? "" : String(value),
    ]),
  );

// Send push notification only (without storing in DB)
const sendPushOnly = async (data) => {
  try {
    console.log("sendPushOnly called with data:", data);
  let receiverDetails = data?.receiverDetails;
  if (receiverDetails && !receiverDetails.appFcm && !receiverDetails.webFcm) {
    const userId = normalizeObjectId(receiverDetails._id || receiverDetails.id);
    if (userId) {
      receiverDetails = await User.findById(userId).select("appFcm webFcm");
    }
  }
  if (!receiverDetails) {
      receiverDetails = await resolveTargetUser({
        notificationFor: data.notificationFor,
        clientId: data.clientId,
        vendorId: data.vendorId,
        projection: "appFcm webFcm",
      });
    }
    if (!receiverDetails) {
      console.warn("⚠️ Receiver not found for push notification");
      return false;
    }
    const tokens = [receiverDetails.appFcm, receiverDetails.webFcm].filter(
      Boolean,
    );
    const uniqueTokens = [...new Set(tokens)];
    if (!uniqueTokens.length) {
      console.warn("⚠️ No FCM tokens found");
      return false;
    }
    console.log(uniqueTokens, "uniqueTokensuniqueTokensuniqueTokensuniqueTokens");

    const title = pickBestText(data.title);
    const body = pickBestText(data.message);
    const fcmData = stringifyFcmData(data.data);
    const results = await Promise.allSettled(
      uniqueTokens.map((token) =>
        sendNotification({
          token,
          title,
          body,
          data: fcmData,
        })
      )
    );
    const success = results.some(
      (r) => r.status === "fulfilled" && r.value?.ok
    );
    return success;
  } catch (err) {
    console.error("❌ sendPushOnly error:", err);
    return false;
  }
};

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
  sendPushOnly,
};
