const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
let serviceAccount;

// Try to use JSON file first, then fall back to environment variables
try {
  serviceAccount = require('../serviceAccountKey.json');
  console.log('Using Firebase service account from serviceAccountKey.json', process.env);
  console.log("Firebase Project ID:", serviceAccount?.project_id);
  console.log("Firebase Client Email:", serviceAccount?.client_email);
  console.log("Private Key Exists:", !!serviceAccount?.private_key);
  console.log("Firebase Apps Count:", admin.apps.length);
} catch (error) {
  // Fall back to environment variables
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
    };
    console.log('Using Firebase service account from environment variables', process.env);
  } else {
    console.error('Firebase service account key not found. Please either:');
    console.error('1. Add serviceAccountKey.json to the project root, or');
    console.error('2. Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL environment variables');
    throw new Error('Firebase configuration not found');
  }
}

// Initialize Firebase App if not already initialized
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
// Get Firebase Auth instance
const auth = admin.auth();

module.exports = {
  admin,
  auth,
  projectId: serviceAccount.project_id // Export project ID for easy access
};
