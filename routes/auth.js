const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth, rateLimit, csrfProtection } = require('../middleware/authMiddleware');

// --- Public Routes ---

// Login route
router.post('/client/login',
  rateLimit(20, 15 * 60 * 1000),
  csrfProtection,
  authController.clientLogin
);

router.post('/vendor/login', authController.vendorLogin
);

router.post('/vendor/reset-password-for-employee', authController.resetPasswordForEmployee
);

router.post('/admin/login',
  rateLimit(20, 15 * 60 * 1000),
  csrfProtection,
  authController.adminLogin
);

// Logout route
router.post('/logout', requireAuth, authController.logout);

// OTP routes
router.post('/send-otp',
  rateLimit(10, 5 * 60 * 1000),
  authController.sendOtpForRegister
);

// Check if email or contact number already registered
router.post('/check-registered',
  rateLimit(10, 5 * 60 * 1000), //
  csrfProtection,
  authController.checkRegisteredUser
);

// Client Registration
router.post('/client/register',
  rateLimit(10, 5 * 60 * 1000),
  csrfProtection,
  authController.registerClient
);

router.post('/verify-register-otp',
  rateLimit(10, 5 * 60 * 1000),
  authController.verifyOtpAndRegister
);

// router.post("/create-admin",authController)

// Password reset routes
router.post('/send-forgot-otp',
  rateLimit(10, 5 * 60 * 1000),
  authController.sendOtpForForgotPassword
);

router.post('/verify-forgot-otp',
  rateLimit(10, 5 * 60 * 1000),
  authController.verifyOtpForForgotPassword
);

router.post('/reset-password',
  rateLimit(10, 5 * 60 * 1000),
  csrfProtection,
  authController.resetPassword
);

// Google Authentication
router.post('/google',
  rateLimit(10, 5 * 60 * 1000),
  authController.googleAuth
);

// --- Protected Routes ---

// Get current user (requires authentication)
router.get('/me', requireAuth, authController.getCurrentUser);



// --- Health Check Route ---
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Auth service is running',
    timestamp: new Date().toISOString()
  });
});

// Firebase health check route
router.get('/firebase-health', (req, res) => {
  try {
    const { admin, projectId, auth } = require('../config/firebase');
    const app = admin.app();

    res.json({
      success: true,
      message: 'Firebase Admin SDK is properly configured',
      projectId: projectId || app.options.projectId || 'evenlyo-marketplace',
      appName: app.name || 'default',
      authReady: !!admin.auth()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Firebase configuration error',
      error: error.message
    });
  }
});

// Vendor Registration
router.post('/vendor/register',
  rateLimit(10, 5 * 60 * 1000),
  csrfProtection,
  authController.registerVendor2
);

router.post('/vendor/stripe/connect', requireAuth, authController.connectVendorStripe);
router.get('/vendor/stripe/onboarding-link', requireAuth, authController.getStripeOnboardingLink);
router.get('/vendor/stripe/onboarding-status', requireAuth, authController.checkStripeOnboardingStatus);

module.exports = router;
