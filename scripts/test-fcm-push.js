/**
 * Send a test FCM push using current Firebase config.
 * Usage: node scripts/test-fcm-push.js <fcmToken>
 */
require("dotenv").config();
const { sendNotification } = require("../utils/notifications");

const token = process.argv[2];
if (!token) {
  console.error("Usage: node scripts/test-fcm-push.js <fcmToken>");
  process.exit(1);
}

(async () => {
  const result = await sendNotification({
    token,
    title: "Evenlyo FCM test",
    body: "Firebase push test from backend",
    data: { type: "test" },
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
