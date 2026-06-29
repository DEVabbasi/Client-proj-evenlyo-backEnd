const Module = require("module");

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (String(request).includes("serviceAccountKey.json")) {
    const err = new Error(`Cannot find module '${request}'`);
    err.code = "MODULE_NOT_FOUND";
    throw err;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const mongoose = require("mongoose");
const User = require("../models/User");
const { sendNotification } = require("../utils/notifications");

const mask = (value) =>
  value ? `${String(value).slice(0, 8)}...${String(value).slice(-6)}` : null;

(async () => {
  const app = process.env.HEROKU_SMOKE_APP || "unknown";
  await mongoose.connect(process.env.MONGODB_URI);

  const user = await User.findOne({
    appFcm: { $exists: true, $nin: [null, ""] },
  })
    .select("_id appFcm")
    .lean();

  if (!user?.appFcm) {
    process.stdout.write(
      JSON.stringify({ ok: false, reason: "no_app_fcm_token_in_db", app }),
    );
    process.exit(1);
  }

  const push = await sendNotification({
    token: user.appFcm,
    title: "Evenlyo FCM smoke test",
    body: `Firebase push test (${app})`,
    data: { type: "smoke_test", app },
  });

  await mongoose.disconnect();

  process.stdout.write(
    JSON.stringify({
      ok: push.ok,
      app,
      userId: String(user._id),
      tokenMasked: mask(user.appFcm),
      messageId: push.messageId || null,
      reason: push.reason || null,
      code: push.code || null,
    }),
  );
  process.exit(push.ok ? 0 : 1);
})().catch((err) => {
  process.stdout.write(
    JSON.stringify({ ok: false, error: err.message }),
  );
  process.exit(1);
});
