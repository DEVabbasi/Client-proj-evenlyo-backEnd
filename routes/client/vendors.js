const express = require('express');
const router = express.Router();
const vendorController = require('../../controllers/client/vendorController');
const {
  requireAuth,
  requireVendor,
} = require('../../middleware/authMiddleware');

// --- Public Routes ---

// @desc    Get all vendors (public listing)
// @route   GET /api/vendor/all
// @access  Public
router.get('/all', vendorController.getAllVendors);

// @desc    Get vendors by category and subcategory
// @route   GET /api/vendor/bycategory (query params)
// @route   GET /api/vendor/bycategory/:categoryId (path param)
// @access  Public
router.get('/bycategory', vendorController.getVendorsByCategory);
router.post('/bycategory/:categoryId', vendorController.getVendorsByCategory);

// @desc    Get featured vendors for homepage display
// @route   GET /api/vendor/featured
// @access  Public
router.get('/featured', vendorController.getFeaturedVendors);

// @desc    Get vendor profile by ID (public access)
// @route   GET /api/vendor/profile/:vendorId
// @access  Public
router.get('/profile/:vendorId', vendorController.getVendorProfile);

// --- Protected Routes (Vendor Only) ---

// @desc    Get current vendor's profile
// @route   GET /api/vendor/my-profile
// @access  Private (Vendor)
router.get('/vendorprofile', requireAuth, requireVendor, vendorController.getVendorProfile);

// @desc    Update vendor profile
// @route   PUT /api/vendor/my-profile
// @access  Private (Vendor)
router.put('/vendorprofile', requireAuth, requireVendor, vendorController.updateVendorProfile);

// @desc    Get vendor business details and analytics
// @route   GET /api/vendor/business-details
// @access  Private (Vendor)
router.get('/business-details', requireAuth, requireVendor, vendorController.getVendorBusinessDetails);

// @desc    Get vendor dashboard stats
// @route   GET /api/vendor/dashboard
// @access  Private (Approved Vendor)
router.get('/dashboard', requireAuth, requireVendor, vendorController.getVendorDashboard);

// getVendorFullDetails is now in vendorController
// @desc    Get all details related to a vendor (business, user, listings, popular)
// @route   GET /api/vendor/:vendorId/details
// @access  Public
router.get('/details/:vendorId', vendorController.getVendorFullDetails);
router.post('/details/:vendorId', vendorController.getVendorFullDetails);

module.exports = router;
