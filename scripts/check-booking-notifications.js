/**
 * Check in-app + FCM readiness for a booking's notifications.
 * Usage: node scripts/check-booking-notifications.js <bookingId>
 */
require("dotenv").config();
const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const mongoose = require("mongoose");
const BookingRequest = require("../models/Booking");
const Notification = require("../models/Notification");
const User = require("../models/User");

const BOOKING_ID = process.argv[2] || "6a42462bf6f406277e75fb49";
const uri =
  process.argv[3] ||
  "mongodb+srv://talal:X1vb2CgwaaRg7vNy@cluster0.yghxjij.mongodb.net/evenlyo-production?retryWrites=true&w=majority";

async function main() {
  await mongoose.connect(uri);

  const booking = await BookingRequest.findById(BOOKING_ID).lean();
  if (!booking) {
    console.error("Booking not found:", BOOKING_ID);
    process.exit(1);
  }

  const notifsByBooking = await Notification.find({ bookingId: BOOKING_ID })
    .sort({ createdAt: 1 })
    .lean();

  const tracking = booking.trackingId;
  const notifsByTracking = await Notification.find({
    $or: [
      { "message.en": { $regex: tracking } },
      { "message.nl": { $regex: tracking } },
    ],
  })
    .sort({ createdAt: 1 })
    .lean();

  const vendor = await User.findById(booking.vendorId)
    .select("firstName lastName email appFcm webFcm fcm notifications userType")
    .lean();
  const client = await User.findById(booking.userId)
    .select("firstName lastName email appFcm webFcm fcm notifications userType")
    .lean();

  const statusHistory = (booking.statusHistory || []).map((h) => ({
    status: h.status,
    timestamp: h.timestamp,
  }));

  console.log(
    JSON.stringify(
      {
        booking: {
          _id: booking._id.toString(),
          trackingId: booking.trackingId,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          createdAt: booking.createdAt,
          updatedAt: booking.updatedAt,
          userId: booking.userId.toString(),
          vendorId: booking.vendorId.toString(),
          listingId: booking.listingId.toString(),
          statusHistory,
        },
        notificationsLinkedByBookingId: {
          count: notifsByBooking.length,
          items: notifsByBooking.map((n) => ({
            _id: n._id.toString(),
            notificationFor: n.notificationFor,
            vendorId: n.vendorId?.toString(),
            clientId: n.clientId?.toString(),
            title: n.title,
            message: n.message,
            isRead: n.isRead,
            isClientRead: n.isClientRead,
            createdAt: n.createdAt,
          })),
        },
        notificationsMentioningTrackingId: {
          count: notifsByTracking.length,
          ids: notifsByTracking.map((n) => n._id.toString()),
        },
        expectedEvents: [
          {
            event: "booking_created",
            recipient: "vendor",
            notificationFor: "Vendor",
            expectedAround: booking.createdAt,
          },
          {
            event: "booking_accepted",
            recipient: "client",
            notificationFor: "Client",
            expectedAround:
              statusHistory.find((h) => h.status === "accepted")?.timestamp ||
              null,
          },
        ],
        fcmTokens: {
          vendor: {
            userId: vendor?._id?.toString(),
            hasAppFcm: !!vendor?.appFcm,
            hasWebFcm: !!vendor?.webFcm,
            hasLegacyFcm: !!vendor?.fcm,
            pushEnabled: vendor?.notifications?.push,
            appFcmPrefix: vendor?.appFcm
              ? String(vendor.appFcm).slice(0, 20) + "..."
              : null,
          },
          client: {
            userId: client?._id?.toString(),
            hasAppFcm: !!client?.appFcm,
            hasWebFcm: !!client?.webFcm,
            hasLegacyFcm: !!client?.fcm,
            pushEnabled: client?.notifications?.push,
            appFcmPrefix: client?.appFcm
              ? String(client.appFcm).slice(0, 20) + "..."
              : null,
          },
        },
        analysis: {
          vendorCreateNotifExists: notifsByBooking.some(
            (n) =>
              n.notificationFor === "Vendor" &&
              n.title?.en === "New Booking Request",
          ),
          clientAcceptNotifExists: notifsByBooking.some(
            (n) =>
              n.notificationFor === "Client" &&
              n.title?.en === "Booking Status",
          ),
          clientCouldReceivePush: !!(
            client?.appFcm ||
            client?.webFcm ||
            client?.fcm
          ),
          vendorCouldReceivePush: !!(
            vendor?.appFcm ||
            vendor?.webFcm ||
            vendor?.fcm
          ),
        },
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
