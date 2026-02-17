const express = require('express');
const router = express.Router();
const { requireAuth, requireVendor } = require('../../middleware/authMiddleware');
const { getVendorListingsOverview, filterByCategory, getVendorListings,
    toggleListingStatus, createListing,
    updateListing,
    deleteListing } = require('../../controllers/vendor/listingManagement');

router.get('/all', requireAuth, getVendorListings);
router.get('/overview', requireAuth, getVendorListingsOverview);
router.patch('/:id/toggle-status', requireAuth, toggleListingStatus);
router.post('/create', requireAuth, createListing);
router.delete('/delete/:id', requireAuth, deleteListing);
router.put('/update/:id', requireAuth, updateListing);
router.get("/listings/filter", requireAuth, filterByCategory);

module.exports = router;

