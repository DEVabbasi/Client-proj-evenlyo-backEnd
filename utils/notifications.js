const { admin } = require("../config/firebase");
const User = require("../models/User");

const pickBestText = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.nl || value.en || "";
};

const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

const clearUserFcmToken = async (token) => {
  if (!token) return;
  try {
    await User.updateMany(
      { $or: [{ appFcm: token }, { webFcm: token }, { fcm: token }] },
      { $unset: { appFcm: "", webFcm: "", fcm: "" } },
    );
    console.warn("🧹 Cleared stale FCM token from user record(s)");
  } catch (err) {
    console.error("Failed to clear stale FCM token:", err.message);
  }
};

const sendNotification = async ({ token, title, body, data = {} }) => {
  console.log("Sending FCM notification", { token, title, body, data });
  try {
    const message = {
      token,
      notification: {
        title,
        body,
      },
      data,
      android: {
        priority: "high",
        notification: {
          channelId: "evenlyo_general",
          sound: "default",
          priority: "high",
        },
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log("✅ FCM sent successfully", {
      messageId: response,
      tokenPrefix: String(token).slice(0, 12),
    });
    return { ok: true, messageId: response };
  } catch (error) {
    console.error("❌ FCM error:", {
      message: error.message,
      code: error.code,
      errorInfo: error.errorInfo,
    });
    if (INVALID_TOKEN_CODES.has(error.code)) {
      // await clearUserFcmToken(token);
      return { ok: false, reason: "invalid_token", code: error.code };
    }

    return { ok: false, reason: "send_failed", code: error.code };
  }
};

module.exports = { sendNotification };
