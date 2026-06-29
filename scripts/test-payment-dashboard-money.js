/**
 * Verify payment dashboard money aggregation handles string subtotals.
 */
const { toMoney } = require("../utils/money");

const getVendorAmount = (booking) => {
  if (booking.status === "completed") {
    return toMoney(booking.pricingBreakdown?.subtotal);
  }
  if (
    booking.status === "cancelled" &&
    booking.paymentStatus === "upfront_paid"
  ) {
    return toMoney(booking.pricingBreakdown?.upfrontFee) * 0.88;
  }
  if (booking.status === "complain") {
    return toMoney(booking.claimDetails?.amount);
  }
  return 0;
};

const bookings = [
  { status: "completed", pricingBreakdown: { subtotal: "462.00" } },
  { status: "completed", pricingBreakdown: { subtotal: "200.00" } },
  {
    status: "cancelled",
    paymentStatus: "upfront_paid",
    pricingBreakdown: { upfrontFee: "100.00" },
  },
];

const paidThisMonthAmount = bookings.reduce(
  (sum, booking) => sum + getVendorAmount(booking),
  0,
);

const kpi = Number(toMoney(paidThisMonthAmount).toFixed(2));

if (kpi !== 750) {
  console.error("FAIL: expected kpi 750, got", kpi);
  process.exit(1);
}

// Old behavior would produce string and throw on toFixed
let broken = 0;
for (const b of bookings) {
  const raw =
    b.status === "completed" ? b.pricingBreakdown?.subtotal || 0 : 0;
  broken += raw;
}
try {
  broken.toFixed(2);
  if (typeof broken === "string") {
    console.log("OK: confirmed string concat breaks toFixed in old path");
  }
} catch (e) {
  console.log("OK: old path throws:", e.message);
}

console.log("PASS: kpi", kpi, "typeof", typeof kpi);
