const admin = require("firebase-admin");

if (!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 env variable not set");
}

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8")
);
console.log(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, serviceAccount, "serviceAccountserviceAccountserviceAccount");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

console.log("Using Firebase service account from environment variables");

module.exports = admin;