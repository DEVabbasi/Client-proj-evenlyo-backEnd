const admin = require("firebase-admin");

if (!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 env variable not set");
}

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8")
);
console.log(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, serviceAccount, "serviceAccountserviceAccountserviceAccount");

console.log("Firebase Project ID:", serviceAccount?.project_id);
console.log("Firebase Client Email:", serviceAccount?.client_email);
console.log("Private Key Exists:", !!serviceAccount?.private_key);
console.log("Firebase Apps Count:", admin.apps.length);

try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });

    console.log("✅ Firebase initialized successfully");
  }
} catch (err) {
  console.error("❌ Firebase init failed:", err);
}

console.log("Using Firebase service account from environment variables");

module.exports = admin;