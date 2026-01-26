const { admin } = require("./firebaseConfig");

const sendNotification = async ({ token, title, body, data = {} }) => {
  try {
    if (!token) {
      console.log("⚠️ No FCM token found, skipping push");
      return;
    }

    const message = {
      token,
      notification: {
        title: title?.en,
        body: body?.en,
      },
      data,
    };

    await admin.messaging().send(message);

    console.log("✅ FCM sent successfully");
  } catch (error) {
    console.error("❌ FCM error:", error.message);
  }
};

module.exports = { sendNotification };
