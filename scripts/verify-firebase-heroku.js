/**
 * Verify Firebase Admin initializes using Heroku app config (no secrets printed).
 * Usage: node scripts/verify-firebase-heroku.js [app-name]
 */
const { execSync, spawnSync } = require("child_process");

const apps = process.argv[2]
  ? [process.argv[2]]
  : ["evenlyo-backend", "evenlyo-backend-production"];

const KEYS = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_SERVICE_ACCOUNT_BASE64",
];

function herokuGet(app, key) {
  try {
    return execSync(`heroku config:get ${key} -a ${app}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

function verifyApp(app) {
  const env = { ...process.env };
  for (const key of KEYS) {
    const value = herokuGet(app, key);
    if (value) env[key] = value;
  }

  const child = spawnSync(process.execPath, [require("path").join(__dirname, "verify-firebase-init-child.js")], {
    env,
    encoding: "utf8",
  });

  let parsed = { ok: false, error: child.stderr?.trim() || "unknown" };
  const stdout = (child.stdout || "").trim();
  const jsonLine = stdout.split("\n").pop();
  try {
    parsed = JSON.parse(jsonLine);
  } catch (_) {}

  console.log(
    JSON.stringify({
      app,
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKeyLength: env.FIREBASE_PRIVATE_KEY?.length || 0,
      base64Length: env.FIREBASE_SERVICE_ACCOUNT_BASE64?.length || 0,
      firebaseInit: parsed,
    }),
  );

  return parsed.ok;
}

let allOk = true;
for (const app of apps) {
  if (!verifyApp(app)) allOk = false;
}
process.exit(allOk ? 0 : 1);
