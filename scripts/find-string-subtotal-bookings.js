require("dotenv").config();
const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const mongoose = require("mongoose");
const Booking = require("../models/Booking");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const vendorId = process.argv[2] || "69de1bd4bc634ac8dabebe0b";

  const bookings = await Booking.find({
    vendorId,
    status: { $in: ["completed", "complain", "cancelled"] },
    vendorPaid: { $ne: true },
  }).lean();

  console.log("Vendor bookings (unpaid):", bookings.length);
  for (const b of bookings) {
    const s = b.pricingBreakdown?.subtotal;
    console.log(
      b.trackingId,
      "| status:",
      b.status,
      "| subtotal type:",
      typeof s,
      "| value:",
      JSON.stringify(s)
    );
  }

  const global = await Booking.find({
    status: "completed",
    vendorPaid: { $ne: true },
  })
    .select("trackingId vendorId pricingBreakdown.subtotal status")
    .lean();

  const stringCompleted = global.filter(
    (b) => typeof b.pricingBreakdown?.subtotal === "string"
  );
  console.log("\nGlobal completed+unpaid with STRING subtotal:", stringCompleted.length);
  stringCompleted.slice(0, 5).forEach((b) => {
    console.log(" ", b.trackingId, b.pricingBreakdown?.subtotal);
  });

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
