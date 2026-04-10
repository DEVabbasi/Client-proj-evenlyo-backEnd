const express = require('express');
const router = express.Router();
const { getVendorPayoutDashboard, getVendorPayoutOrders, payoutVendorBookings } = require('../../controllers/admin/PaymentController');


router.get('/', getVendorPayoutDashboard);
router.get('/:vendorId/payout-orders', getVendorPayoutOrders);
router.post('/:vendorId/disburse-payments', payoutVendorBookings);

module.exports = router;