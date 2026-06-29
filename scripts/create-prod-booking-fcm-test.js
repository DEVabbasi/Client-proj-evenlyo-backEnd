/**
 * Create a production booking via API and report notification/FCM readiness.
 * Usage: node scripts/create-prod-booking-fcm-test.js
 */
const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const { execSync } = require("child_process");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const PROD_API =
  "https://evenlyo-backend-production-7482992ce6c7.herokuapp.com/api";
const CLIENT_ID = "6a1e86c69440a1f8a0d7b226";
const VENDOR_ID = "6a4237d5f785c15aeb88fe8c";
const LISTING_ID = "6a42397bf785c15aeb88ff01";

function herokuGet(key) {
  return execSync(`heroku config:get ${key} -a evenlyo-backend-production`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function futureBookingDate(daysAhead = 10) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const mongoUri = herokuGet("MONGODB_URI");
  const jwtSecret = herokuGet("JWT_SECRET");

  await mongoose.connect(mongoUri);
  const User = require("../models/User");
  const Listing = require("../models/Listing");

  const vendor = await User.findById(VENDOR_ID)
    .select("firstName lastName email appFcm webFcm userType isActive")
    .lean();
  const client = await User.findById(CLIENT_ID)
    .select("firstName lastName email userType isActive")
    .lean();
  const listing = await Listing.findById(LISTING_ID)
    .select("title status isActive vendor")
    .lean();

  const startDate = futureBookingDate(12);
  const token = jwt.sign({ id: CLIENT_ID }, jwtSecret, { expiresIn: "1h" });

  const body = {
    listingId: LISTING_ID,
    vendorId: VENDOR_ID,
    details: {
      startDate,
      endDate: startDate,
      startTime: "10:00",
      endTime: "18:00",
      eventLocation:
        "Disco more bus stop, Shahrah-e-Qaddafi, Sector 14 A Orangi Town, Karachi, Pakistan",
      eventLatitude: 24.955393,
      eventLongitude: 66.9954118,
      specialRequests: "FCM production test booking - please ignore",
      contactPreference: "email",
      distanceKm: 9,
      evenyloProtect: false,
      willPayUpfront: true,
      pricingBreakdown: {
        baseAmount: "462.00",
        extraTimeCost: "20.00",
        distanceCost: 180,
        securityFee: "500.00",
        subtotal: "662.00",
        vatFeePercent: 21,
        vatFee: "139.02",
        platformFee: "66.20",
        evenyloProtectFee: "0.00",
        upfrontFee: "683.61",
        total: "1367.22",
        calculationDetails: "FCM test booking",
        breakdown: [
          {
            label: "Standard Service (8 hours)",
            amount: "462.00",
          },
        ],
        paymentPolicy: {
          isEvenlyoProtectEnabled: false,
          upfrontFeePercent: 50,
        },
      },
    },
  };

  console.log(
    JSON.stringify(
      {
        phase: "preflight",
        client: client
          ? { id: CLIENT_ID, name: `${client.firstName} ${client.lastName}` }
          : null,
        vendor: vendor
          ? {
              id: VENDOR_ID,
              hasAppFcm: !!vendor.appFcm,
              hasWebFcm: !!vendor.webFcm,
              appFcmLen: vendor.appFcm?.length || 0,
            }
          : null,
        listing: listing
          ? { id: LISTING_ID, status: listing.status, isActive: listing.isActive }
          : null,
        bookingDate: startDate,
      },
      null,
      2,
    ),
  );

  const res = await fetch(`${PROD_API}/booking/request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.error("Non-JSON response:", text.slice(0, 500));
    process.exit(1);
  }

  const bookingId =
    json?.data?.data?.bookingRequest?._id ||
    json?.data?.bookingRequest?._id ||
    json?.bookingRequest?._id;

  const trackingId =
    json?.data?.data?.bookingRequest?.trackingId ||
    json?.data?.bookingRequest?.trackingId;

  console.log(
    JSON.stringify(
      {
        phase: "api_response",
        httpStatus: res.status,
        success: json?.data?.success ?? json?.success,
        bookingId,
        trackingId,
        message: json?.data?.message || json?.message,
        error: json?.message || json?.error,
      },
      null,
      2,
    ),
  );

  if (!bookingId) {
    await mongoose.disconnect();
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 3000));

  const Notification = require("../models/Notification");
  const notif = await Notification.findOne({ bookingId })
    .sort({ createdAt: -1 })
    .lean();

  console.log(
    JSON.stringify(
      {
        phase: "db_check",
        bookingId,
        trackingId,
        notification: notif
          ? {
              _id: String(notif._id),
              notificationFor: notif.notificationFor,
              createdAt: notif.createdAt,
              title: notif.title,
            }
          : null,
        vendorHasFcmInDb: !!vendor?.appFcm,
        note:
          "bookingController passes vendorUser without appFcm to sendPushOnly; expect No FCM tokens found in logs unless code reloads token",
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
