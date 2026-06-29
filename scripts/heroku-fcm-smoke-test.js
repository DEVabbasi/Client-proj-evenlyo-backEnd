/**
 * Send one FCM smoke test using a Heroku app's Firebase + MongoDB config.
 * Usage: node scripts/heroku-fcm-smoke-test.js <heroku-app-name>
 */
const { execSync, spawnSync } = require("child_process");
const path = require("path");

const app = process.argv[2];
if (!app) {
  console.error("Usage: node scripts/heroku-fcm-smoke-test.js <heroku-app-name>");
  process.exit(1);
}

const KEYS = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_SERVICE_ACCOUNT_BASE64",
  "MONGODB_URI",
];

function herokuGet(key) {
  return execSync(`heroku config:get ${key} -a ${app}`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

const env = { ...process.env, HEROKU_SMOKE_APP: app };
for (const key of KEYS) {
  const value = herokuGet(key);
  if (value) env[key] = value;
}

const child = spawnSync(
  process.execPath,
  [path.join(__dirname, "heroku-fcm-smoke-child.js")],
  { env, encoding: "utf8" },
);

const stdout = (child.stdout || "").trim();
const jsonLine = stdout.split("\n").pop();
let result = { ok: false, error: child.stderr?.trim() || "unknown" };
try {
  result = JSON.parse(jsonLine);
} catch (_) {}

console.log(JSON.stringify({ app, ...result }, null, 2));
process.exit(result.ok ? 0 : 1);
