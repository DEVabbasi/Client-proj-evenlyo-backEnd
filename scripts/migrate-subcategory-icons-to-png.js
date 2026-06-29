/**
 * One-time migration: insert Cloudinary f_png into subcategories.icon URLs.
 *
 * Usage:
 *   node scripts/migrate-subcategory-icons-to-png.js --dry-run
 *   node scripts/migrate-subcategory-icons-to-png.js
 *
 * Requires MONGODB_URI in .env
 */
require("dotenv").config();
const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const mongoose = require("mongoose");
const SubCategory = require("../models/SubCategory");
const { forcePng } = require("../utils/cloudinary");

const dryRun = process.argv.includes("--dry-run");
const uriArgIndex = process.argv.indexOf("--uri");
const mongoUri =
  (uriArgIndex !== -1 && process.argv[uriArgIndex + 1]) ||
  process.env.MONGODB_URI;

async function main() {
  if (!mongoUri) {
    console.error(
      "Set MONGODB_URI in .env or pass --uri <connection-string>"
    );
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log(`Connected to MongoDB${dryRun ? " (DRY RUN)" : ""}\n`);

  const subcategories = await SubCategory.find({
    icon: { $type: "string", $ne: "" },
  }).select("_id name icon");

  let wouldUpdate = 0;
  let skipped = 0;
  let updated = 0;

  for (const sub of subcategories) {
    const before = sub.icon;
    const after = forcePng(before);

    if (!after || after === before) {
      skipped++;
      continue;
    }

    wouldUpdate++;
    const label = sub.name?.en || sub.name?.nl || String(sub._id);
    console.log(`[${sub._id}] ${label}`);
    console.log(`  before: ${before}`);
    console.log(`  after:  ${after}`);

    if (!dryRun) {
      sub.icon = after;
      await sub.save();
      updated++;
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Total with icon:     ${subcategories.length}`);
  console.log(`Already OK / skip:   ${skipped}`);
  console.log(`Need update:         ${wouldUpdate}`);
  if (!dryRun) {
    console.log(`Updated in DB:       ${updated}`);
  } else {
    console.log("\nDry run only — no documents written. Re-run without --dry-run to apply.");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
