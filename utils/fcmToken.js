const User = require("../models/User");

/**
 * Prefer appFcm (mobile). Legacy `fcm` is only used when appFcm/webFcm are empty.
 */
const resolveUserFcmToken = (user) => {
  if (!user) return null;
  if (user.appFcm) return { token: user.appFcm, source: "appFcm" };
  if (user.webFcm) return { token: user.webFcm, source: "webFcm" };
  if (user.fcm) return { token: user.fcm, source: "fcm (legacy)" };
  return null;
};

const saveUserAppFcm = async (userId, token) => {
  if (!userId || !token) return null;
  return User.findByIdAndUpdate(
    userId,
    { $set: { appFcm: token }, $unset: { fcm: "" } },
    { new: true },
  );
};

module.exports = { resolveUserFcmToken, saveUserAppFcm };
