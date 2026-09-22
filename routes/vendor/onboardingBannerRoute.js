const express = require('express');
const router = express.Router();
const {
  getOnboardingStatus
} = require("../../controllers/vendor/vendorOnboardingController");
const {requireAuth}  = require("../../middleware/authMiddleware");

router.get("/onboarding-status", requireAuth, getOnboardingStatus);

module.exports = router;
