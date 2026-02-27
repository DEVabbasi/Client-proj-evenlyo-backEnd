const express = require('express');
const router = express.Router();
const {resetPassword, getPlatformFees, setPlatformFees, getNotificationSettings, toggleEmailNotifications, togglePushNotifications} = require('../../controllers/admin/settingsController');
const { requireAuth, requireAdmin } = require('../../middleware/authMiddleware');

// Admin password reset route
router.post('/reset-password', requireAdmin, resetPassword);
// Admin get platform fees
router.get('/platform-fees', requireAdmin, getPlatformFees);
// Admin set platform fees
router.post('/platform-fees', requireAdmin, setPlatformFees);
// Admin get notification settings
router.get('/notification', requireAdmin, getNotificationSettings);
// Admin toggle email notifications
router.patch('/notification/update', requireAdmin, togglePushNotifications);

module.exports = router;

