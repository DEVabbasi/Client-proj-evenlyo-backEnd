const mongoose = require("mongoose");
const Vendor = require("../models/Vendor");
const Listing = require("../models/Listing");
const connectDB = require("../config/db");
require("dotenv").config();

const migrateApprovalStatus = async () => {
  try {
    await connectDB();

    // -----------------------------------------
    // 1. Existing vendors
    // -----------------------------------------
    const vendorResult = await Vendor.updateMany(
      {
        approvalStatus: { $exists: false },
      },
      {
        $set: {
          approvalStatus: "approved",
        },
      },
    );

    console.log(`Vendors migrated: ${vendorResult.modifiedCount}`);

    // -----------------------------------------
    // 2. Existing active listings
    // -----------------------------------------
    const activeListingResult = await Listing.updateMany(
      {
        approvalStatus: { $exists: false },
        status: "active",
      },
      {
        $set: {
          approvalStatus: "approved",
        },
      },
    );

    console.log(
      `Active listings migrated: ${activeListingResult.modifiedCount}`,
    );

    // -----------------------------------------
    // 3. Existing non-active listings
    // -----------------------------------------
    const otherListingResult = await Listing.updateMany(
      {
        approvalStatus: { $exists: false },
        status: { $ne: "active" },
      },
      {
        $set: {
          approvalStatus: "pending",
        },
      },
    );

    console.log(`Other listings migrated: ${otherListingResult.modifiedCount}`);

    console.log("Approval status migration completed successfully.");
  } catch (error) {
    console.error("Approval status migration failed:", error);
  } finally {
    await mongoose.connection.close();
    process.exit();
  }
};

migrateApprovalStatus();
