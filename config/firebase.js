const admin = require("firebase-admin");

let serviceAccount;

const normalizePrivateKey = (raw) => {
  if (!raw) return raw;
  return String(raw).replace(/\\\\n/g, "\n").replace(/\\n/g, "\n");
};

const assertFirebaseEnvConsistency = (account) => {
  const projectId = account?.project_id;
  const email = account?.client_email || "";
  if (!projectId || !email) return;

  const emailProject = email.match(/@([^.]+)\.iam\.gserviceaccount\.com$/)?.[1];
  if (emailProject && emailProject !== projectId) {
    console.warn(
      `⚠️ Firebase config mismatch: FIREBASE_PROJECT_ID="${projectId}" but client_email uses project "${emailProject}". FCM may fail.`,
    );
  }
};

const loadServiceAccountFromEnv = () => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const parsed = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString(
        "utf8",
      ),
    );
    if (parsed.private_key) {
      parsed.private_key = normalizePrivateKey(parsed.private_key);
    }
    console.log("Using Firebase service account from FIREBASE_SERVICE_ACCOUNT_BASE64");
    return parsed;
  }

  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_PRIVATE_KEY &&
    process.env.FIREBASE_CLIENT_EMAIL
  ) {
    console.log("Using Firebase service account from environment variables");
    return {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
    };
  }

  return null;
};

try {
  serviceAccount = require("../serviceAccountKey.json");
  console.log("Using Firebase service account from serviceAccountKey.json");
} catch (error) {
  serviceAccount = loadServiceAccountFromEnv();
  if (!serviceAccount) {
    console.error("Firebase service account key not found. Please either:");
    console.error("1. Add serviceAccountKey.json to the project root, or");
    console.error(
      "2. Set FIREBASE_SERVICE_ACCOUNT_BASE64, or FIREBASE_PROJECT_ID + FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL",
    );
    throw new Error("Firebase configuration not found");
  }
}

if (serviceAccount.private_key) {
  serviceAccount.private_key = normalizePrivateKey(serviceAccount.private_key);
}

assertFirebaseEnvConsistency(serviceAccount);
console.log("Firebase Project ID:", serviceAccount?.project_id);
console.log("Firebase Client Email:", serviceAccount?.client_email);
console.log("Private Key Exists:", !!serviceAccount?.private_key);

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

const auth = admin.auth();

module.exports = {
  admin,
  auth,
  projectId: serviceAccount.project_id,
};
