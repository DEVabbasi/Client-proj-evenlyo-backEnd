const express = require('express');
const router = express.Router();
const {
  getOnboardingStatus,
  updateProfileEnhancement
} = require("../../controllers/vendor/vendorOnboardingController");
const {requireAuth}  = require("../../middleware/authMiddleware");

router.get("/onboarding-status", requireAuth, getOnboardingStatus);
router.post("/profile-enhancement", requireAuth, updateProfileEnhancement);

module.exports = router;
