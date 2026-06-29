const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const { execSync } = require("child_process");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const APP = "evenlyo-backend-production";
const API =
  "https://evenlyo-backend-production-7482992ce6c7.herokuapp.com/api";

function herokuGet(key) {
  return execSync(`heroku config:get ${key} -a ${APP}`, { encoding: "utf8" }).trim();
}

async function main() {
  await mongoose.connect(herokuGet("MONGODB_URI"));
  const User = require("../models/User");
  const Vendor = require("../models/Vendor");
  const jwtSecret = herokuGet("JWT_SECRET");

  const vendors = await Vendor.find({}).select("userId accountType businessName").lean();
  const orphans = [];
  for (const v of vendors) {
    const u = await User.findById(v.userId);
    if (!u) orphans.push(String(v._id));
  }

  const personal = vendors.filter((v) => v.accountType && v.accountType !== "business");
  const personalTests = [];
  for (const p of personal.slice(0, 3)) {
    const token = jwt.sign({ id: String(p.userId) }, jwtSecret, { expiresIn: "1h" });
    const res = await fetch(`${API}/vendor/profile`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(35000),
    });
    personalTests.push({
      userId: String(p.userId),
      status: res.status,
      body: (await res.text()).slice(0, 200),
    });
  }

  console.log(
    JSON.stringify(
      {
        totalVendors: vendors.length,
        orphanVendorProfiles: orphans,
        personalVendorCount: personal.length,
        personalTests,
      },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
