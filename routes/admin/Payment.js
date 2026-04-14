const express = require('express');
const router = express.Router();
const { refundClient, payVendorClaim, getVendorPayoutDashboard, getVendorPayoutOrders, payoutVendorBookings, getRefundCases } = require('../../controllers/admin/PaymentController');


router.get('/', getVendorPayoutDashboard);
router.get('/refund-cases', getRefundCases);
router.get('/:vendorId/payout-orders', getVendorPayoutOrders);
router.post('/:vendorId/disburse-payments', payoutVendorBookings);
router.post('/vendor-claims', payVendorClaim);
router.post('/refund', refundClient);

module.exports = router;