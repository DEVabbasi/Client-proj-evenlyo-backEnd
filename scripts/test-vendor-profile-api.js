/**
 * Smoke-test vendor profile fetch endpoints on Heroku.
 * Usage: node scripts/test-vendor-profile-api.js [evenlyo-backend-production|evenlyo-backend]
 */
const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const { execSync } = require("child_process");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const APP = process.argv[2] || "evenlyo-backend-production";
const API_BASE =
  APP === "evenlyo-backend-production"
    ? "https://evenlyo-backend-production-7482992ce6c7.herokuapp.com/api"
    : "https://evenlyo-backend-20036df510ad.herokuapp.com/api";

const VENDOR_USER_ID =
  APP === "evenlyo-backend-production"
    ? "6a4237d5f785c15aeb88fe8c"
    : null;

function herokuGet(key) {
  return execSync(`heroku config:get ${key} -a ${APP}`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

async function timedFetch(label, url, options = {}) {
  const start = Date.now();
  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(35000) });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 500);
    }
    return {
      label,
      status: res.status,
      ms: Date.now() - start,
      ok: res.ok,
      bodyPreview:
        typeof body === "object"
          ? {
              keys: Object.keys(body),
              message: body.message,
              success: body.success,
              accountType: body.accountType,
              businessName: body.businessName || body.data?.businessInfo?.businessName,
            }
          : body,
    };
  } catch (err) {
    return {
      label,
      status: 0,
      ms: Date.now() - start,
      ok: false,
      error: err.message,
    };
  }
}

async function main() {
  const mongoUri = herokuGet("MONGODB_URI");
  const jwtSecret = herokuGet("JWT_SECRET");
  await mongoose.connect(mongoUri);

  const User = require("../models/User");
  const Vendor = require("../models/Vendor");

  let vendorUserId = VENDOR_USER_ID;
  if (!vendorUserId) {
    const v = await User.findOne({ userType: "vendor", isActive: true }).select("_id").lean();
    vendorUserId = v ? String(v._id) : null;
  }

  if (!vendorUserId) {
    console.log(JSON.stringify({ app: APP, error: "No vendor user found" }, null, 2));
    process.exit(1);
  }

  const vendorProfile = await Vendor.findOne({ userId: vendorUserId })
    .select("_id businessName accountType userId")
    .lean();

  const token = jwt.sign({ id: vendorUserId }, jwtSecret, { expiresIn: "1h" });
  const auth = { Authorization: `Bearer ${token}` };

  const results = [];

  // Vendor app: GET /api/vendor/profile (authenticated)
  results.push(
    await timedFetch("GET /api/vendor/profile (vendor app)", `${API_BASE}/vendor/profile`, {
      headers: auth,
    }),
  );

  // Client app: public profile by Vendor._id
  if (vendorProfile) {
    results.push(
      await timedFetch(
        "GET /api/vendor/profile/:vendorId (public)",
        `${API_BASE}/vendor/profile/${vendorProfile._id}`,
      ),
    );
  }

  // Alternate client route
  results.push(
    await timedFetch("GET /api/vendor/vendorprofile", `${API_BASE}/vendor/vendorprofile`, {
      headers: auth,
    }),
  );

  const report = {
    app: APP,
    vendorUserId,
    vendorProfileId: vendorProfile ? String(vendorProfile._id) : null,
    accountType: vendorProfile?.accountType,
    results,
    crashing: results.some((r) => r.status >= 500 || r.error),
  };

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
  process.exit(report.crashing ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
