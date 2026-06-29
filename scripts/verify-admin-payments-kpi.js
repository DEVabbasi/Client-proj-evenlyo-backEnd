/**
 * Find paid-this-month bookings and verify admin payments KPI math.
 * Usage: node scripts/verify-admin-payments-kpi.js [heroku-app]
 */
require("dotenv").config();
const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const { execSync } = require("child_process");
const moment = require("moment");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Vendor = require("../models/Vendor");
const { toMoney } = require("../utils/money");

const APP = process.argv[2] || "evenlyo-backend-production";
const API_BASE =
  APP === "evenlyo-backend-production"
    ? "https://evenlyo-backend-production-7482992ce6c7.herokuapp.com/api"
    : "https://evenlyo-backend-20036df510ad.herokuapp.com/api";

function herokuGet(key) {
  return execSync(`heroku config:get ${key} -a ${APP}`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

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

async function main() {
  const mongoUri = herokuGet("MONGODB_URI");
  await mongoose.connect(mongoUri);

  const startOfMonth = moment().startOf("month").toDate();

  const paidThisMonth = await Booking.find({
    vendorPaid: true,
    vendorPaidAt: { $gte: startOfMonth },
    status: { $in: ["completed", "complain", "cancelled"] },
  })
    .select(
      "vendorId trackingId status paymentStatus vendorPaidAt pricingBreakdown claimDetails",
    )
    .lean();

  const stringSubtotal = paidThisMonth.filter(
    (b) => typeof b.pricingBreakdown?.subtotal === "string",
  );

  const expectedTotalKpi = paidThisMonth.reduce(
    (sum, b) => sum + getVendorAmount(b),
    0,
  );

  const byVendor = {};
  for (const b of paidThisMonth) {
    const vid = String(b.vendorId);
    if (!byVendor[vid]) byVendor[vid] = { count: 0, amount: 0, bookings: [] };
    const amt = getVendorAmount(b);
    byVendor[vid].count += 1;
    byVendor[vid].amount += amt;
    byVendor[vid].bookings.push({
      trackingId: b.trackingId,
      status: b.status,
      subtotalType: typeof b.pricingBreakdown?.subtotal,
      subtotal: b.pricingBreakdown?.subtotal,
      amount: amt,
      vendorPaidAt: b.vendorPaidAt,
    });
  }

  const totalVendors = await Vendor.countDocuments();
  const limit = 10;
  const pages = Math.ceil(totalVendors / limit);

  let apiKpiSum = 0;
  let apiPages = [];

  for (let page = 1; page <= pages; page++) {
    const res = await fetch(
      `${API_BASE}/admin/payments?page=${page}&limit=${limit}`,
    );
    const json = await res.json();
    if (!json.success) {
      console.log(JSON.stringify({ phase: "api_error", page, json }, null, 2));
      process.exit(1);
    }
    const pageVendorPaid = (json.data || []).reduce(
      (s, row) => s + toMoney(row.paidThisMonthAmount),
      0,
    );
    apiKpiSum += pageVendorPaid;
    apiPages.push({
      page,
      status: res.status,
      kpis: json.kpis,
      pageVendorPaidSum: pageVendorPaid,
      vendorsWithPaid: (json.data || []).filter((r) => r.paidThisMonthAmount > 0)
        .length,
    });
  }

  const lastPageRes = await fetch(
    `${API_BASE}/admin/payments?page=1&limit=${limit}`,
  );
  const lastPage = await lastPageRes.json();

  const report = {
    app: APP,
    monthStart: startOfMonth.toISOString(),
    paidThisMonthBookings: paidThisMonth.length,
    paidWithStringSubtotal: stringSubtotal.length,
    sampleStringSubtotalBookings: stringSubtotal.slice(0, 5).map((b) => ({
      trackingId: b.trackingId,
      vendorId: String(b.vendorId),
      subtotal: b.pricingBreakdown?.subtotal,
      amount: getVendorAmount(b),
      vendorPaidAt: b.vendorPaidAt,
    })),
    expectedTotalAllVendors: Number(toMoney(expectedTotalKpi).toFixed(2)),
    apiKpiPage1: lastPage.kpis,
    apiSumPaidThisMonthAcrossAllPages: Number(toMoney(apiKpiSum).toFixed(2)),
    kpiMatchesExpected:
      Number(toMoney(expectedTotalKpi).toFixed(2)) ===
      Number(toMoney(apiKpiSum).toFixed(2)),
    vendorsWithPaidThisMonth: Object.keys(byVendor).length,
    topVendorsByPaidAmount: Object.entries(byVendor)
      .map(([vendorId, v]) => ({
        vendorId,
        count: v.count,
        amount: Number(toMoney(v.amount).toFixed(2)),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    apiPagesSample: apiPages.slice(0, 3),
    note:
      "API kpis.totalPaidThisMonthAmount on each page only sums vendors ON THAT PAGE, not global total. apiSumPaidThisMonthAcrossAllPages sums data[].paidThisMonthAmount across all pages.",
  };

  console.log(JSON.stringify(report, null, 2));

  await mongoose.disconnect();
  process.exit(report.kpiMatchesExpected ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
