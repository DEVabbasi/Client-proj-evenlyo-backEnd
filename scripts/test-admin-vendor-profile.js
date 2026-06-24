/**
 * Test admin vendor profile ID resolution (read-only).
 * Run: node scripts/test-admin-vendor-profile.js
 */
require("dotenv").config();
const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const mongoose = require("mongoose");
const User = require("../models/User");
const Vendor = require("../models/Vendor");

async function adminGetVendorDetailsLogic(paramId) {
  const vendorUser = await User.findOne({ _id: paramId, userType: "vendor" }).select(
    "_id firstName lastName"
  );
  if (!vendorUser) {
    return { ok: false, status: 404, message: "Vendor not found (User lookup)" };
  }
  const vendorProfile = await Vendor.findOne({ userId: paramId });
  return {
    ok: true,
    status: 200,
    vendorUserId: String(vendorUser._id),
    vendorProfileId: vendorProfile ? String(vendorProfile._id) : null,
    name: `${vendorUser.firstName} ${vendorUser.lastName}`,
  };
}

async function adminGetVendorDetailsLogicFixed(paramId) {
  let vendorUser = await User.findOne({ _id: paramId, userType: "vendor" }).select(
    "_id firstName lastName"
  );
  let vendorProfile = await Vendor.findOne({ userId: paramId });

  if (!vendorUser && mongoose.Types.ObjectId.isValid(paramId)) {
    vendorProfile = await Vendor.findById(paramId);
    if (vendorProfile) {
      vendorUser = await User.findOne({ _id: vendorProfile.userId, userType: "vendor" }).select(
        "_id firstName lastName"
      );
    }
  }

  if (!vendorUser) {
    return { ok: false, status: 404, message: "Vendor not found" };
  }
  if (!vendorProfile) {
    vendorProfile = await Vendor.findOne({ userId: vendorUser._id });
  }

  return {
    ok: true,
    status: 200,
    vendorUserId: String(vendorUser._id),
    vendorProfileId: vendorProfile ? String(vendorProfile._id) : null,
    name: `${vendorUser.firstName} ${vendorUser.lastName}`,
  };
}

async function publicVendorProfileLogic(paramId) {
  const vendor = await Vendor.findById(paramId).select("_id businessName userId");
  if (!vendor) {
    return { ok: false, status: 404, message: "Vendor profile not found (Vendor.findById)" };
  }
  return {
    ok: true,
    status: 200,
    vendorProfileId: String(vendor._id),
    businessName: vendor.businessName,
    userId: String(vendor.userId),
  };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB\n");

  const vendorUser = await User.findOne({ userType: "vendor" }).select("_id firstName lastName");
  if (!vendorUser) {
    console.log("No vendor users in database.");
    await mongoose.disconnect();
    return;
  }

  const vendorProfile = await Vendor.findOne({ userId: vendorUser._id });
  if (!vendorProfile) {
    console.log("No Vendor profile for user", vendorUser._id);
    await mongoose.disconnect();
    return;
  }

  const userId = String(vendorUser._id);
  const profileId = String(vendorProfile._id);

  console.log("Sample vendor:");
  console.log("  User._id (id in list):     ", userId);
  console.log("  Vendor._id (vendorId col):", profileId);
  console.log("  businessName:             ", vendorProfile.businessName);

  const cases = [
    {
      label: "A — admin details with User._id (expected SUCCESS)",
      fn: () => adminGetVendorDetailsLogic(userId),
    },
    {
      label: "B — admin details with Vendor._id OLD logic (expected FAIL)",
      fn: () => adminGetVendorDetailsLogic(profileId),
    },
    {
      label: "B2 — admin details with Vendor._id FIXED logic (expected SUCCESS)",
      fn: () => adminGetVendorDetailsLogicFixed(profileId),
    },
    {
      label: "C — public profile with Vendor._id (expected SUCCESS)",
      fn: () => publicVendorProfileLogic(profileId),
    },
    {
      label: "D — public profile with User._id (expected FAIL)",
      fn: () => publicVendorProfileLogic(userId),
    },
  ];

  for (const c of cases) {
    console.log(`\n=== ${c.label} ===`);
    const result = await c.fn();
    console.log(result.ok ? "SUCCESS" : "FAILED", result);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
