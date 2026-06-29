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

const normalizePrivateKey = (raw) =>
  String(raw || "").replace(/\\\\n/g, "\n").replace(/\\n/g, "\n");

function herokuGet(app, key) {
  return execSync(`heroku config:get ${key} -a ${app}`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function buildStagingFirebasePayload() {
  const serviceAccount = {
    type: "service_account",
    project_id: herokuGet(STAGING, "FIREBASE_PROJECT_ID"),
    private_key: normalizePrivateKey(
      herokuGet(STAGING, "FIREBASE_PRIVATE_KEY"),
    ),
    client_email: herokuGet(STAGING, "FIREBASE_CLIENT_EMAIL"),
  };

  return {
    FIREBASE_PROJECT_ID: serviceAccount.project_id,
    FIREBASE_CLIENT_EMAIL: serviceAccount.client_email,
    FIREBASE_PRIVATE_KEY: serviceAccount.private_key,
    FIREBASE_SERVICE_ACCOUNT_BASE64: Buffer.from(
      JSON.stringify(serviceAccount),
    ).toString("base64"),
  };
}

async function herokuPatchConfig(app, vars) {
  const token = execSync("heroku auth:token", {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();

  const response = await fetch(
    `https://api.heroku.com/apps/${app}/config-vars`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.heroku+json; version=3",
      },
      body: JSON.stringify(vars),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Heroku config PATCH failed (${response.status}): ${body}`);
  }

  return response.json();
}

async function main() {
  const staging = buildStagingFirebasePayload();

  const prodBefore = {};
  for (const key of KEYS) {
    prodBefore[key] = herokuGet(PRODUCTION, key);
  }

  console.log("Staging Firebase:");
  console.log("  PROJECT_ID:", staging.FIREBASE_PROJECT_ID);
  console.log("  CLIENT_EMAIL:", staging.FIREBASE_CLIENT_EMAIL);
  console.log("  PRIVATE_KEY length:", staging.FIREBASE_PRIVATE_KEY.length);
  console.log(
    "  SERVICE_ACCOUNT_BASE64 length:",
    staging.FIREBASE_SERVICE_ACCOUNT_BASE64.length,
  );

  console.log("\nProduction Firebase (before):");
  console.log("  PROJECT_ID:", prodBefore.FIREBASE_PROJECT_ID);
  console.log("  CLIENT_EMAIL:", prodBefore.FIREBASE_CLIENT_EMAIL);
  console.log("  PRIVATE_KEY length:", prodBefore.FIREBASE_PRIVATE_KEY?.length || 0);

  if (dryRun) {
    console.log("\nDry run — would PATCH production config via Heroku API.");
    return;
  }

  console.log("\nApplying to production via Heroku API...");
  await herokuPatchConfig(PRODUCTION, staging);

  console.log("Restarting production...");
  execSync(`heroku restart -a ${PRODUCTION}`, { stdio: "inherit" });

  const prodAfter = {};
  for (const key of KEYS) {
    prodAfter[key] = herokuGet(PRODUCTION, key);
  }
  const prodB64Len = herokuGet(
    PRODUCTION,
    "FIREBASE_SERVICE_ACCOUNT_BASE64",
  ).length;

  console.log("\nProduction Firebase (after):");
  console.log("  PROJECT_ID:", prodAfter.FIREBASE_PROJECT_ID);
  console.log("  CLIENT_EMAIL:", prodAfter.FIREBASE_CLIENT_EMAIL);
  console.log("  PRIVATE_KEY length:", prodAfter.FIREBASE_PRIVATE_KEY.length);
  console.log("  SERVICE_ACCOUNT_BASE64 length:", prodB64Len);
  console.log(
    "\nScalars match staging:",
    KEYS.every((k) => prodAfter[k] === staging[k]),
  );
  console.log(
    "BASE64 length match:",
    prodB64Len === staging.FIREBASE_SERVICE_ACCOUNT_BASE64.length,
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main, buildStagingFirebasePayload };
