/**
 * Verify getVendorPayoutOrders logic against live DB.
 * Run: node scripts/test-payout-orders.js [vendorUserId]
 */
require("dotenv").config();
const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const mongoose = require("mongoose");
const moment = require("moment");
const User = require("../models/User");
const Booking = require("../models/Booking");
require("../models/Listing");
require("../models/SubCategory");

const toMoney = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatAmount = (payoutAmount, useFixed) => {
  if (useFixed) {
    return toMoney(payoutAmount).toFixed(2);
  }
  return payoutAmount.toFixed(2);
};

async function processPayoutOrders(vendorId, useFixed) {
  const vendor = await User.findById(vendorId).select(
    "firstName lastName email stripeOnboardingComplete"
  );

  if (!vendor) {
    throw new Error("Vendor not found");
  }

  const bookings = await Booking.find({
    vendorId,
    status: { $in: ["completed", "complain", "cancelled"] },
  })
    .populate("userId", "firstName lastName email")
    .populate({
      path: "listingId",
      select: "subCategory title",
      populate: { path: "subCategory", select: "escrowHours" },
    })
    .sort({ completedAt: -1 })
    .lean();

  const now = moment();
  const readyToPayOrders = [];
  const pendingOrders = [];
  const paidOrders = [];

  for (const booking of bookings) {
    if (!booking) continue;

    const escrowHours = booking.listingId?.subCategory?.escrowHours || 0;

    const subtotal = useFixed
      ? toMoney(booking.pricingBreakdown?.subtotal)
      : booking.pricingBreakdown?.subtotal || 0;
    const total = useFixed
      ? toMoney(booking.pricingBreakdown?.total)
      : booking.pricingBreakdown?.total || 0;
    const upfrontFee = useFixed
      ? toMoney(booking.pricingBreakdown?.upfrontFee)
      : booking.pricingBreakdown?.upfrontFee || 0;

    let payoutAmount = 0;

    if (booking.vendorPaid) {
      paidOrders.push({ trackingId: booking.trackingId, status: booking.status });
      continue;
    }

    if (booking.status === "completed") {
      payoutAmount = subtotal;
    }

    if (booking.status === "complain") {
      const refund = useFixed
        ? toMoney(booking.claimDetails?.refundAmount)
        : booking.claimDetails?.refundAmount || 0;

      const complainSubtotal = useFixed ? subtotal : booking.pricingBreakdown?.subtotal || 0;
      const complainTotal = useFixed ? total : booking.pricingBreakdown?.total || 0;

      const adminShare = complainTotal - complainSubtotal;
      const vendorShare = complainSubtotal;
      let remainingRefund = refund;

      const adminDeduction = Math.min(remainingRefund, adminShare);
      remainingRefund -= adminDeduction;
      const vendorDeduction = Math.min(remainingRefund, vendorShare);
      payoutAmount = Math.max(vendorShare - vendorDeduction, 0);
    }

    if (booking.status === "cancelled") {
      payoutAmount = upfrontFee * 0.88;
    }

    const payoutReadyAt = moment(booking.completedAt).add(escrowHours, "hours");

    const formattedBooking = {
      trackingId: booking.trackingId,
      status: booking.status,
      amount: formatAmount(payoutAmount, useFixed),
      subtotalRaw: booking.pricingBreakdown?.subtotal,
      subtotalType: typeof booking.pricingBreakdown?.subtotal,
    };

    const bypassEscrow = ["cancelled", "complain"].includes(booking.status);

    if (bypassEscrow) {
      readyToPayOrders.push(formattedBooking);
      continue;
    }

    if (now.isSameOrAfter(payoutReadyAt)) {
      readyToPayOrders.push(formattedBooking);
    } else {
      pendingOrders.push(formattedBooking);
    }
  }

  return {
    stripeOnboarded: !!vendor.stripeOnboardingComplete,
    totalBookings: bookings.length,
    readyToPayOrders,
    pendingOrders,
    paidOrders,
  };
}

async function runPhase(label, vendorId, useFixed) {
  console.log(`\n=== ${label} ===`);
  try {
    const result = await processPayoutOrders(vendorId, useFixed);
    console.log("SUCCESS");
    console.log(
      `Bookings: ${result.totalBookings} | ready: ${result.readyToPayOrders.length} | pending: ${result.pendingOrders.length} | paid: ${result.paidOrders.length}`
    );
    console.log(`stripeOnboarded: ${result.stripeOnboarded}`);

    const sample = [
      ...result.readyToPayOrders,
      ...result.pendingOrders,
    ].slice(0, 3);
    if (sample.length) {
      console.log("Sample amounts:");
      sample.forEach((o) => {
        console.log(
          `  ${o.trackingId} | ${o.status} | amount=${o.amount} | subtotal(${o.subtotalType})=${JSON.stringify(o.subtotalRaw)}`
        );
      });
    }
    return true;
  } catch (err) {
    console.log("FAILED:", err.message);
    if (err.message.includes("toFixed")) {
      console.log("(Reproduced the production payout-orders crash)");
    }
    return false;
  }
}

async function main() {
  const vendorId = process.argv[2] || "69de1bd4bc634ac8dabebe0b";

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");
  console.log("Vendor userId:", vendorId);

  await runPhase("FIXED (production logic after patch)", vendorId, true);
  await runPhase("BROKEN (old logic, no toMoney)", vendorId, false);

  // Vendor with completed booking + string subtotal (reproduces production crash)
  const crashVendorId = "69e5d2141b9e4dfd83bd0560";
  if (vendorId !== crashVendorId) {
    console.log("\n--- Vendor with string subtotal on completed booking ---");
    console.log("Vendor userId:", crashVendorId, "(TRK1781265933734L5MHPBN5J)");
    await runPhase("FIXED", crashVendorId, true);
    await runPhase("BROKEN", crashVendorId, false);
  }

  console.log("\n=== SYNTHETIC (completed + string subtotal) ===");
  try {
    const payoutAmount = "154299.00";
    payoutAmount.toFixed(2);
    console.log("BROKEN: unexpected success");
  } catch (err) {
    console.log("BROKEN FAILED:", err.message);
  }
  console.log("FIXED amount:", toMoney("154299.00").toFixed(2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
