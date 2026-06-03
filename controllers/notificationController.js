const Notification = require("../models/Notification");
const { toMultilingualText } = require("../utils/textUtils");
const User = require("../models/User");
const Vendor = require("../models/Vendor");
const Admin = require("../models/Admin");
const { sendNotification } = require("../utils/notifications");
const { resolveUserFcmToken } = require("../utils/fcmToken");
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
    let resolvedVendorId = vendorId;
    if (notificationFor === "Vendor" && vendorId) {
      const ownerUserId = await resolveVendorOwnerUserId(vendorId);
      if (ownerUserId) resolvedVendorId = ownerUserId;
    }

    // 1️⃣ Save in DB
    const notification = await Notification.create({
      title,
      message,
      notificationFor,
      clientId,
      vendorId: resolvedVendorId,
      bookingId,
    });

    console.log(notification,"notificationnotificationnotificationnotification");
    
    // 2️⃣ Find target user
    const user = await resolveTargetUser({
      notificationFor,
      clientId,
      vendorId: resolvedVendorId,
      projection: "appFcm webFcm fcm notifications",
    });

    if (!user && notificationFor !== "Admin") {
      console.warn("⚠️ createNotification: user not found for push", {
        notificationFor,
        clientId: normalizeObjectId(clientId),
        vendorId: normalizeObjectId(resolvedVendorId),
      });
    }

    const pushEnabled = user?.notifications?.push !== false;
    const resolved = resolveUserFcmToken(user);
    const fcmToken = resolved?.token;

    // 3️⃣ Send FCM (respect user push preference)
    if (fcmToken && pushEnabled) {
      const pushResult = await sendNotification({
        token: fcmToken,
        title,
        body: message,
        data: {
          notificationId: notification._id.toString(),
          type: "notification",
        },
      });
      if (!pushResult?.ok) {
        console.warn("⚠️ createNotification push failed", {
          notificationFor,
          userId: user?._id?.toString(),
          tokenSource: resolved?.source,
          reason: pushResult?.reason,
          code: pushResult?.code,
          hint:
            pushResult?.reason === "invalid_token"
              ? "User must open the mobile app while logged in to refresh FCM token"
              : undefined,
        });
      }
    } else if (notificationFor !== "Admin") {
      console.warn("⚠️ createNotification skipped push", {
        notificationFor,
        clientId: normalizeObjectId(clientId),
        vendorId: normalizeObjectId(resolvedVendorId),
        userId: user?._id?.toString(),
        pushEnabled,
        hasToken: Boolean(fcmToken),
        tokenSource: resolved?.source,
      });
    }

    return notification;
  } catch (err) {
    console.error("❌ createNotification error:", err);
    return null;
  }
};

// Send push notification only (without storing in DB)
const sendPushOnly = async ({
  title,
  message,
  notificationFor, // "Client" | "Vendor"
  clientId = null,
  vendorId = null,
  data = {},
  ignorePushPreference = false,
}) => {
  try {
    const user = await resolveTargetUser({
      notificationFor,
      clientId,
      vendorId,
      projection: "appFcm webFcm fcm notifications",
    });

    // Chat messages always deliver; booking/marketing respect settings
    if (!ignorePushPreference && user?.notifications?.push === false) {
      console.warn("⚠️ sendPushOnly skipped (push disabled in settings)", {
        notificationFor,
        clientId: normalizeObjectId(clientId),
        vendorId: normalizeObjectId(vendorId),
      });
      return false;
    }

    const resolved = resolveUserFcmToken(user);
    const token = resolved?.token;
    if (!token) {
      console.warn("⚠️ sendPushOnly skipped push (missing token)", {
        notificationFor,
        clientId: normalizeObjectId(clientId),
        vendorId: normalizeObjectId(vendorId),
        userId: user?._id?.toString(),
      });
      return false;
    }

    const pushResult = await sendNotification({
      token,
      title,
      body: message,
      data,
    });
    return Boolean(pushResult?.ok);
  } catch (err) {
    console.error("❌ sendPushOnly error:", err);
    return false;
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
  sendPushOnly,
};
