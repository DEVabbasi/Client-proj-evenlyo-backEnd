/**
 * Replay the "vendor submits his FIRST listing" scenario repeatedly,
 * without re-registering a vendor or re-creating the listing by hand.
 *
 * The script:
 *   1. Reuses ONE dedicated replay vendor (created on first run, reused later).
 *   2. Resets that vendor to a fresh post-onboarding state:
 *        - deletes all of the vendor's listings
 *        - deletes notifications created for/by the vendor
 *        - resets User.approvalStatus back to the pre-submission state
 *      so `isFirstListing` is true again on every run.
 *   3. Ensures approval toggles are ON
 *      (approvalSettings.vendorActivationRequired + itemApprovalRequired).
 *   4. Calls the REAL controller (controllers/vendor/listingManagement.js
 *      createListing), which also fires the real SMTP review email to the
 *      active Admin employees.
 *   5. Prints the controller response, the saved admin notifications, and
 *      the email recipients.
 *
 * Usage:
 *   node scripts/replay-first-listing.js
 *   TEST_VENDOR_EMAIL=some@vendor.com node scripts/replay-first-listing.js
 *
 * NOTE: when TEST_VENDOR_EMAIL is set, ALL of that vendor's listings are
 * deleted on every run so the first-listing path is re-triggered.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");

const User = require("../models/User");
const Vendor = require("../models/Vendor");
const Listing = require("../models/Listing");
const Category = require("../models/Category");
const SubCategory = require("../models/SubCategory");
const Settings = require("../models/Settings");
const Notification = require("../models/Notification");
const AdminEmployee = require("../models/AdminEmployee");

const { createListing } = require("../controllers/vendor/listingManagement");
const { getApprovalSettings } = require("../utils/getApprovalSettings");

const DEFAULT_REPLAY_EMAIL = "replay.vendor@evenlyo.test";

function log(...args) {
  console.log(...args);
}

function makeResCapture() {
  const out = { statusCode: null, body: null };
  const res = {
    status(code) {
      out.statusCode = code;
      return res;
    },
    json(body) {
      out.body = body;
      return res;
    },
  };
  return { out, res };
}

async function ensureSettings() {
  let settings = await Settings.findOne().lean();
  if (!settings) {
    settings = await Settings.create({
      bookingItemPlatformFee: 0,
      salesItemPlatformFee: 0,
      vat: 0,
      approvalSettings: { vendorActivationRequired: true, itemApprovalRequired: true },
    });
  } else {
    await Settings.updateOne(
      { _id: settings._id },
      {
        $set: {
          approvalSettings: {
            vendorActivationRequired: true,
            itemApprovalRequired: true,
          },
        },
      },
    );
  }
  const current = await getApprovalSettings();
  log("⚙️  Approval settings now:", JSON.stringify(current));
  return current;
}

async function findOrCreateReplayVendor(email) {
  let user = await User.findOne({ email }).select("_id email userType");
  if (!user) {
    user = await User.create({
      email,
      userType: "vendor",
      firstName: "Replay",
      lastName: "Vendor",
      accountType: "business",
      kvkNumber: "12345678",
      isActive: true,
      approvalStatus: "pending",
      password: "Replay1234!",
    });
    log(`🆕 Created replay vendor: ${email} (${user._id})`);
  }

  let vendor = await Vendor.findOne({ userId: user._id })
    .select("userId businessName businessEmail mainCategories subCategories")
    .lean();

  if (!vendor) {
    const cat = await findOrCreateCategory();
    const sub = await findOrCreateSubCategory(cat._id);
    vendor = {
      userId: user._id,
      businessName: "Replay Events B.V.",
      businessEmail: email,
    };
    await Vendor.create({
      ...vendor,
      mainCategories: [cat._id],
      subCategories: [sub._id],
    });
    log(`🆕 Created vendor profile for ${email}`);
  }

  return { user, vendor };
}

async function findOrCreateCategory() {
  let category = await Category.findOne({ "name.en": "Replay Category" }).lean();
  if (!category) {
    category = await Category.create({
      name: { en: "Replay Category", nl: "Replay Categorie" },
      description: { en: "Replay category", nl: "Replay categorie" },
      icon: "https://res.cloudinary.com/evenlyo/image/upload/v1/icons/category.png",
    });
  }
  return category;
}

async function findOrCreateSubCategory(mainCategoryId) {
  let sub =
    (await SubCategory.findOne({ mainCategory: mainCategoryId }).lean()) ||
    (await SubCategory.findOne({ "name.en": "Replay SubCategory" }).lean());
  if (!sub) {
    sub = await SubCategory.create({
      name: { en: "Replay SubCategory", nl: "Replay SubCategorie" },
      mainCategory: mainCategoryId,
      icon: "icon",
    });
  }
  return sub;
}

async function resetVendor(userId) {
  const listingsDeleted = await Listing.deleteMany({ vendor: userId });
  await Notification.deleteMany({
    $or: [{ vendorId: userId }, { notificationFor: "Admin", vendorId: userId }],
  });

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        approvalStatus: "pending",
        submittedForReviewAt: null,
        reviewedAt: null,
        reviewedBy: null,
        approvalRejectionReason: { en: "", nl: "" },
      },
    },
  );

  log(
    `🧹 Reset vendor: deleted ${listingsDeleted.deletedCount} listing(s), cleared notifications & reverted approvalStatus → pending`,
  );
}

async function buildListingPayload(userId, vendor) {
  let categoryId =
    (Array.isArray(vendor.mainCategories) && vendor.mainCategories[0]) || null;
  let subCategoryId =
    (Array.isArray(vendor.subCategories) && vendor.subCategories[0]) || null;

  if (!categoryId || !subCategoryId) {
    const cat = await findOrCreateCategory();
    const sub = await findOrCreateSubCategory(cat._id);
    categoryId = categoryId || cat._id;
    subCategoryId = subCategoryId || sub._id;
    await Vendor.updateOne(
      { userId },
      { $set: { mainCategories: [categoryId], subCategories: [subCategoryId] } },
    );
  }

  return {
    title: {
      en: `Replay Photobooth ${Date.now()}`,
      nl: `Replay Fotocabine ${Date.now()}`,
    },
    subtitle: { en: "Replay subtitle", nl: "Replay ondertitel" },
    description: {
      en: "Automated replay listing to test the first-listing vendor review flow.",
      nl: "Geautomatiseerde replay-advertentie om de eerste-advertentie leveranciersreview te testen.",
    },
    category: categoryId,
    subCategory: subCategoryId,
    status: "active",
    serviceDetails: { serviceType: "human" },
    pricing: { type: "fixed", amount: 100, totalPrice: 100 },
    images: [],
  };
}

async function showEmailRecipients() {
  const admins = await AdminEmployee.find({ role: "Admin", status: "active" })
    .select("name email")
    .lean();
  if (admins.length === 0) {
    log(
      "📭 No active Admin employees found — review email will fall back to CONTACT_EMAIL/EMAIL_USER.",
    );
  } else {
    log(
      `📬 Review email recipients (active Admin employees): ${admins
        .map((a) => `${a.name} <${a.email}>`)
        .join(", ")}`,
    );
  }
}

async function showNotificationsAfter(userId) {
  const before = await Notification.countDocuments({ notificationFor: "Admin" });

  return () => {
    return (async () => {
      const after = await Notification.countDocuments({ notificationFor: "Admin" });
      const created = after - before;
      const adminAlerts = await Notification.find({ notificationFor: "Admin" })
        .sort({ createdAt: -1 })
        .limit(created > 0 ? created : 5)
        .lean();
      log(
        `🔔 Admin notifications created this run: ${created > 0 ? created : before}${created > 0 ? "" : " (none new — check reset)"}`,
      );
      adminAlerts.forEach((n) => {
        log(`   - [${new Date(n.createdAt).toISOString()}] ${n.title?.nl || ""}`);
      });
    })();
  };
}

(async () => {
  log("🎬 Replaying FIRST-listing submission flow on the REAL environment\n");
  await connectDB();

  const requestedEmail = (process.env.TEST_VENDOR_EMAIL || "").trim();
  const email = requestedEmail || DEFAULT_REPLAY_EMAIL;

  if (requestedEmail) {
    log(
      `⚠️  WARNING: using TEST_VENDOR_EMAIL=${email}. ALL of this vendor's listings will be deleted on every run!`,
    );
  }

  const settings = await ensureSettings();
  const { user, vendor } = await findOrCreateReplayVendor(email);

  if (!settings.vendorActivationRequired || !settings.itemApprovalRequired) {
    log(
      "❌ Both toggles must be true to reproduce the vendor-review email scenario.",
    );
    process.exitCode = 1;
    await mongoose.connection.close();
    return;
  }

  await resetVendor(user._id);

  const payload = await buildListingPayload(user._id, vendor);
  log("\n📦 Listing payload ready, calling REAL createListing controller…\n");

  await showEmailRecipients();

  const notificationCheck = await showNotificationsAfter(user._id);

  const req = { body: payload, user: { id: user._id } };
  const { out, res } = makeResCapture();
  await createListing(req, res);

  await notificationCheck();

  log("\n📋 createListing response:");
  log(`   HTTP: ${out.statusCode}`);
  log(`   success: ${out.body?.success}`);
  log(`   message: ${JSON.stringify(out.body?.message) || ""}`);
  log(`   approval: ${JSON.stringify(out.body?.data?.approval) || ""}`);
  log(`   listing.approvalStatus: ${out.body?.data?.listing?.approvalStatus || "n/a"}`);

  const usr = await User.findById(user._id).select("approvalStatus submittedForReviewAt");
  log(
    `\n👤 Vendor User state after run: approvalStatus=${usr?.approvalStatus}, submittedForReviewAt=${usr?.submittedForReviewAt ? "set" : "null"}`,
  );

  log(
    "\n📧 Check the mailer log above for 'Vendor review email sent to <emails>' and verify the email in the admin's inbox.",
  );
  log("\n✅ Replay complete. Run `node scripts/replay-first-listing.js` again to repeat.");

  await mongoose.connection.close();
  process.exit(process.exitCode || 0);
})().catch(async (err) => {
  console.error("Script error:", err);
  try {
    await mongoose.connection.close();
  } catch (_) {}
  process.exit(1);
});