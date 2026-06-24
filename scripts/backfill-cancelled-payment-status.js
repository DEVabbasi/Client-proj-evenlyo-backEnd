/**
 * One-time backfill: cancelled_due_to_non_payment → upfront_paid
 * Run: node scripts/backfill-cancelled-payment-status.js
 */
require("dotenv").config();
const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const mongoose = require("mongoose");
const Booking = require("../models/Booking");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const result = await Booking.updateMany(
    { status: "cancelled", paymentStatus: "cancelled_due_to_non_payment" },
    { $set: { paymentStatus: "upfront_paid" } }
  );
  console.log(`Updated ${result.modifiedCount} booking(s).`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
