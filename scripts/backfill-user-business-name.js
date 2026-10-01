// One-off backfill: copy Vendor.businessName onto the owner's User document.
//
// User.fullName is the display name every endpoint returns, and it resolves from
// User.businessName for business vendors (who have no firstName/lastName).
// Vendor documents created before that field existed never populated it, so run
// this once after deploying the change.
//
// Safe to re-run: it only writes when the value actually differs.
const mongoose = require("mongoose");
const User = require("../models/User");
const Vendor = require("../models/Vendor");
const connectDB = require("../config/db");
require("dotenv").config();

const backfill = async () => {
  try {
    await connectDB();

    const vendors = await Vendor.find({ businessName: { $exists: true, $ne: "" } })
      .select("userId businessName")
      .lean();

    console.log(`Vendors with a business name: ${vendors.length}`);

    let updated = 0;
    let skipped = 0;
    let orphaned = 0;

    for (const vendor of vendors) {
      if (!vendor.userId) {
        orphaned += 1;
        continue;
      }

      const result = await User.updateOne(
        { _id: vendor.userId },
        { $set: { businessName: vendor.businessName } },
      );

      if (result.matchedCount === 0) {
        orphaned += 1;
      } else if (result.modifiedCount > 0) {
        updated += 1;
      } else {
        skipped += 1;
      }
    }

    console.log(`Users updated: ${updated}`);
    console.log(`Users already in sync: ${skipped}`);
    console.log(`Vendors without a matching user: ${orphaned}`);
    console.log("businessName backfill completed successfully.");
  } catch (error) {
    console.error("businessName backfill failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    process.exit();
  }
};

backfill();
