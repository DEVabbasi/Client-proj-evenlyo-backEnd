const express = require("express");
const router = express.Router();
const {
  getVendorBookingAnalytics,
  getAmountToPay,
  createPaymentIntent,
  paymentConfirmation,
  getVendorBookingById,
} = require("../../controllers/vendor/bookingAnalytics");
const {
  requireAuth,
  requireVendor,
} = require("../../middleware/authMiddleware");
const {
  acceptBooking,
  rejectBooking,
} = require("../../controllers/vendor/bookingAnalytics");

// GET /api/vendor/bookings/analytics
router.get("/details/:bookingId", requireAuth, getVendorBookingById);
router.get("/analytics", requireAuth, getVendorBookingAnalytics);

router.post("/:id/accept", requireAuth, requireVendor, acceptBooking);

router.post("/:id/reject", requireAuth, rejectBooking);
router.post("/create-payment-intent", createPaymentIntent);
router.post("/on-payment-success", paymentConfirmation);
router.get("/amount-to-pay/:id", getAmountToPay);

module.exports = router;
