const express = require("express");
const router = express.Router();
const listingController = require("../../controllers/client/listingController");

// Public routes (no authentication required)
router.get("/", listingController.getListings);
router.get("/filter", listingController.filterListings);
router.get("/search", listingController.searchListings);
router.get("/featured", listingController.getFeaturedListings);
router.get("/popular", listingController.getPopularListings);
router.post("/homeData", listingController.getHomeData);
router.get("/vendor/:vendorId", listingController.getListingsByVendor);
router.get("/:id", listingController.getListingById);

// @route   GET /api/listing/:id/availability
// @desc    Check listing availability for date range
// @access  Public
router.get("/:id/availability", listingController.checkListingAvailability);

// @route   GET /api/cakenade/:id
// @desc    Get calendar data (booked and available days) for a listing
// @access  Public
router.get("/calendar/:id", listingController.getListingCalendar);

module.exports = router;
