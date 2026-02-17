const express = require('express');
const router = express.Router();
const { getProfile, updateProfileByAdmin, sendKVKRequest, updateDeliveryCharges, updateProfile, subCategoryFromCategory, getMainCategoriesbyVendorId } = require('../../controllers/vendor/profileController');
const { requireAuth } = require('../../middleware/authMiddleware');

// Get vendor profile
router.get('/', requireAuth, getProfile);
router.get('/get-main-category/:vendorId', getMainCategoriesbyVendorId);

// Update vendor profile
router.put('/update', requireAuth, updateProfile);
router.put('/admin/update/:id', updateProfileByAdmin);
router.put('/update-delivery-charges', requireAuth, updateDeliveryCharges);

router.post('/get-sub-category-by-categoryIds', subCategoryFromCategory);

router.post('/request-kvk-change', sendKVKRequest);


module.exports = router;
