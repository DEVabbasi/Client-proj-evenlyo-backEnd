/**
 * Copy FIREBASE_* config from staging Heroku app to production.
 * Usage: node scripts/sync-firebase-staging-to-production.js [--dry-run]
 */
const { execSync } = require("child_process");

const STAGING = "evenlyo-backend";
const PRODUCTION = "evenlyo-backend-production";
const KEYS = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
];
const dryRun = process.argv.includes("--dry-run");

function herokuGet(app, key) {
  return execSync(`heroku config:get ${key} -a ${app}`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function herokuSet(app, pairs) {
  const args = pairs
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");
  const cmd = `heroku config:set ${args} -a ${app}`;
  if (dryRun) {
    console.log("[dry-run]", cmd.replace(/FIREBASE_PRIVATE_KEY=.*?(?= FIREBASE_|$)/, "FIREBASE_PRIVATE_KEY=<redacted>"));
    return;
  }
  execSync(cmd, { stdio: "inherit", shell: true });
}

function main() {
  const staging = {};
  for (const key of KEYS) {
    staging[key] = herokuGet(STAGING, key);
    if (!staging[key]) {
      console.error(`Missing ${key} on ${STAGING}`);
      process.exit(1);
    }
  }

  const prodBefore = {};
  for (const key of KEYS) {
    prodBefore[key] = herokuGet(PRODUCTION, key);
  }

  console.log("Staging Firebase:");
  console.log("  PROJECT_ID:", staging.FIREBASE_PROJECT_ID);
  console.log("  CLIENT_EMAIL:", staging.FIREBASE_CLIENT_EMAIL);
  console.log("  PRIVATE_KEY length:", staging.FIREBASE_PRIVATE_KEY.length);

  console.log("\nProduction Firebase (before):");
  console.log("  PROJECT_ID:", prodBefore.FIREBASE_PROJECT_ID);
  console.log("  CLIENT_EMAIL:", prodBefore.FIREBASE_CLIENT_EMAIL);
  console.log("  PRIVATE_KEY length:", prodBefore.FIREBASE_PRIVATE_KEY?.length || 0);

  const pairs = KEYS.map((k) => [k, staging[k]]);
  console.log(dryRun ? "\nDry run — not applying." : "\nApplying to production...");
  herokuSet(PRODUCTION, pairs);

  if (!dryRun) {
    console.log("\nRestarting production...");
    execSync(`heroku restart -a ${PRODUCTION}`, { stdio: "inherit" });

    const prodAfter = {};
    for (const key of KEYS) {
      prodAfter[key] = herokuGet(PRODUCTION, key);
    }
    console.log("\nProduction Firebase (after):");
    console.log("  PROJECT_ID:", prodAfter.FIREBASE_PROJECT_ID);
    console.log("  CLIENT_EMAIL:", prodAfter.FIREBASE_CLIENT_EMAIL);
    console.log("  PRIVATE_KEY length:", prodAfter.FIREBASE_PRIVATE_KEY.length);
    console.log(
      "\nMatch staging:",
      KEYS.every((k) => prodAfter[k] === staging[k]),
    );
  }
}

main();
