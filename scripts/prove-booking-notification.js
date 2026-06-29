require("dotenv").config();
const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const mongoose = require("mongoose");
const BookingRequest = require("../models/Booking");
const Notification = require("../models/Notification");

const BOOKING_ID = "6a424078f785c15aeb8900c0";
const NOTIF_ID = "6a42407af785c15aeb8900c9";
const TRACKING = "TRK1782726776824Y7BQ6KA0O";
const uri =
  "mongodb+srv://talal:X1vb2CgwaaRg7vNy@cluster0.yghxjij.mongodb.net/evenlyo-production?retryWrites=true&w=majority";

async function main() {
  await mongoose.connect(uri);

  const booking = await BookingRequest.findById(BOOKING_ID).lean();
  const notifById = await Notification.findById(NOTIF_ID).lean();
  const notifsByBooking = await Notification.find({ bookingId: BOOKING_ID })
    .sort({ createdAt: 1 })
    .lean();
  const notifsNearTime = await Notification.find({
    createdAt: {
      $gte: new Date("2026-06-29T09:52:56.000Z"),
      $lte: new Date("2026-06-29T09:53:05.000Z"),
    },
  })
    .sort({ createdAt: 1 })
    .lean();

  const msDiff =
    notifById && booking
      ? new Date(notifById.createdAt) - new Date(booking.createdAt)
      : null;

  console.log("========== BOOKING ==========");
  console.log(
    JSON.stringify(
      {
        _id: booking?._id?.toString(),
        trackingId: booking?.trackingId,
        status: booking?.status,
        userId: booking?.userId?.toString(),
        vendorId: booking?.vendorId?.toString(),
        listingId: booking?.listingId?.toString(),
        createdAt: booking?.createdAt,
        updatedAt: booking?.updatedAt,
      },
      null,
      2,
    ),
  );

  console.log("========== NOTIFICATION BY _id ==========");
  console.log(JSON.stringify(notifById, null, 2));

  console.log("========== ALL NOTIFICATIONS FOR THIS bookingId ==========");
  console.log("count:", notifsByBooking.length);
  console.log(JSON.stringify(notifsByBooking, null, 2));

  console.log("========== NOTIFICATIONS IN 9s WINDOW AFTER BOOKING ==========");
  console.log("count:", notifsNearTime.length);
  console.log(
    JSON.stringify(
      notifsNearTime.map((n) => ({
        _id: n._id.toString(),
        bookingId: n.bookingId?.toString(),
        notificationFor: n.notificationFor,
        vendorId: n.vendorId?.toString(),
        clientId: n.clientId?.toString(),
        title: n.title,
        message: n.message,
        createdAt: n.createdAt,
      })),
      null,
      2,
    ),
  );

  console.log("========== PROOF CHECKS ==========");
  const checks = {
    notificationExists: !!notifById,
    bookingExists: !!booking,
    notifBookingIdMatches: notifById?.bookingId?.toString() === BOOKING_ID,
    notifIsOnlyNotifForThisBooking:
      notifsByBooking.length === 1 &&
      notifsByBooking[0]._id.toString() === NOTIF_ID,
    trackingIdInMessageEn: !!notifById?.message?.en?.includes(TRACKING),
    trackingIdInMessageNl: !!notifById?.message?.nl?.includes(TRACKING),
    vendorIdMatchesBooking:
      notifById?.vendorId?.toString() === booking?.vendorId?.toString(),
    clientIdMatchesBooking:
      notifById?.clientId?.toString() === booking?.userId?.toString(),
    notificationForVendor: notifById?.notificationFor === "Vendor",
    titleMatchesNewBookingRequest:
      notifById?.title?.en === "New Booking Request",
    msAfterBookingSave: msDiff,
    createdAfterBooking: msDiff > 0,
    withinExpectedWindow: msDiff !== null && msDiff < 5000,
  };
  console.log(JSON.stringify(checks, null, 2));
  const pass = Object.entries(checks).every(([k, v]) => {
    if (k === "msAfterBookingSave") return typeof v === "number" && v > 0 && v < 5000;
    return v === true;
  });
  console.log("ALL_CHECKS_PASS:", pass);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
