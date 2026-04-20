const moment = require("moment");
const Vendor = require("../../models/Vendor");
const User = require("../../models/User");
const Booking = require("../../models/Booking");
const stripe = require("../../config/stripe");

const getVendorPayoutDashboard = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;

        const pageNumber = parseInt(page);
        const limitNumber = parseInt(limit);
        const skip = (pageNumber - 1) * limitNumber;

        const now = moment();
        const startOfMonth = moment().startOf("month");

        const totalVendors = await Vendor.countDocuments();

        const vendors = await Vendor.find()
            .populate(
                "userId",
                "firstName lastName email contactNumber stripeOnboardingComplete"
            )
            .select("businessLogo userId businessName")
            .skip(skip)
            .limit(limitNumber)
            .lean();

        const vendorUserIds = vendors
            .map((v) => v.userId?._id)
            .filter(Boolean);

        const allBookings = await Booking.find({
            status: { $in: ["completed", "complain", "cancelled"] },
            vendorId: { $in: vendorUserIds },
        })
            .populate({
                path: "listingId",
                select: "subCategory title",
                populate: {
                    path: "subCategory",
                    select: "escrowHours",
                },
            })
            .lean();

        // ================= KPI =================
        let totalOrdersReadyToPay = 0;
        let totalPendingPayments = 0;
        let totalPaidThisMonthAmount = 0;

        // ================= MAIN =================
        const data = vendors.map((vendor) => {
            const vendorBookings = allBookings.filter(
                (booking) =>
                    booking.vendorId?.toString() ===
                    vendor.userId?._id?.toString()
            );

            const totalCompletedOrders = vendorBookings.length;

            // ✅ Amount Logic
            const getVendorAmount = (booking) => {
                if (booking.status === "completed") {
                    return booking.pricingBreakdown?.subtotal || 0;
                }

                if (
                    booking.status === "cancelled" &&
                    booking.paymentStatus === "upfront_paid"
                ) {
                    return (
                        (booking.pricingBreakdown?.upfrontFee || 0) * 0.88
                    );
                }

                if (booking.status === "complain") {
                    return booking.claimDetails?.amount || 0;
                }

                return 0;
            };

            // ================= READY =================
            const readyToPayOrders = vendorBookings.filter((booking) => {
                if (booking.vendorPaid) return false;

                // ✅ complain & cancelled → DIRECT READY
                if (
                    booking.status === "complain" ||
                    booking.status === "cancelled"
                ) {
                    return true;
                }

                if (!booking.completedAt) return false;

                const escrowHours =
                    booking.listingId?.subCategory?.escrowHours || 0;

                const payoutReadyAt = moment(booking.completedAt).add(
                    escrowHours,
                    "hours"
                );

                return now.isSameOrAfter(payoutReadyAt);
            });

            // ================= PENDING =================
            const pendingPayments = vendorBookings.filter((booking) => {
                if (booking.vendorPaid) return false;

                // ❌ remove complain & cancelled
                if (
                    booking.status === "complain" ||
                    booking.status === "cancelled"
                ) {
                    return false;
                }

                if (!booking.completedAt) return false;

                const escrowHours =
                    booking.listingId?.subCategory?.escrowHours || 0;

                const payoutReadyAt = moment(booking.completedAt).add(
                    escrowHours,
                    "hours"
                );

                return now.isBefore(payoutReadyAt);
            });

            // ================= PAID =================
            const paidThisMonthBookings = vendorBookings.filter(
                (booking) =>
                    booking.vendorPaid &&
                    booking.vendorPaidAt &&
                    moment(booking.vendorPaidAt).isSameOrAfter(startOfMonth)
            );

            const paidThisMonthAmount = paidThisMonthBookings.reduce(
                (sum, booking) => sum + getVendorAmount(booking),
                0
            );

            // ================= KPI ACCUMULATION =================
            totalOrdersReadyToPay += readyToPayOrders.length;
            totalPendingPayments += pendingPayments.length;
            totalPaidThisMonthAmount += paidThisMonthAmount;

            return {
                vendorId: vendor._id,
                userId: vendor.userId?._id,

                vendorDetails: {
                    firstName: vendor.userId?.firstName,
                    lastName: vendor.userId?.lastName,
                    email: vendor.userId?.email,
                    businessName: vendor.businessName,
                    businessLogo: vendor.businessLogo,
                    contactNumber: vendor.userId?.contactNumber,
                },

                totalCompletedOrders,
                readyToPayOrdersCount: readyToPayOrders.length,
                pendingPaymentsCount: pendingPayments.length,
                paidThisMonthAmount,

                stripeOnboarded:
                    !!vendor.userId?.stripeOnboardingComplete,
            };
        });

        // ================= RESPONSE =================
        res.status(200).json({
            success: true,
            kpis: {
                totalOrdersReadyToPay,
                totalPendingPayments,
                totalPaidThisMonthAmount: Number(
                    totalPaidThisMonthAmount.toFixed(2)
                ),
            },
            pagination: {
                currentPage: pageNumber,
                totalPages: Math.ceil(totalVendors / limitNumber),
                totalVendors,
                limit: limitNumber,
            },
            count: data.length,
            data,
        });
    } catch (error) {
        console.error("Vendor payout dashboard error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch vendor payout dashboard",
            error: error.message,
        });
    }
};


const getVendorPayoutOrders = async (req, res) => {
    try {
        const { vendorId } = req.params;

        const vendor = await User.findById(vendorId).select(
            "firstName lastName email stripeOnboardingComplete"
        );

        if (!vendor) {
            return res.status(404).json({
                success: false,
                message: "Vendor not found",
            });
        }

        const bookings = await Booking.find({
            vendorId: vendorId,
            status: { $in: ["completed", "complain", "cancelled"] },
        })
            .populate("userId", "firstName lastName email")
            .populate({
                path: "listingId",
                select: "subCategory title",
                populate: {
                    path: "subCategory",
                    select: "escrowHours",
                },
            })
            .sort({ completedAt: -1 })
            .lean();

        const now = moment();

        const readyToPayOrders = [];
        const pendingOrders = [];
        const paidOrders = [];

        bookings.forEach((booking) => {

            if (!booking) return;

            const escrowHours =
                booking.listingId?.subCategory?.escrowHours || 0;

            const subtotal = booking.pricingBreakdown?.subtotal || 0;
            const total = booking.pricingBreakdown?.total || 0;
            const upfrontFee = booking.pricingBreakdown?.upfrontFee || 0;

            let payoutAmount = 0;

            // =====================================================
            // PAID ORDERS
            // =====================================================
            if (booking.vendorPaid) {
                paidOrders.push({
                    bookingId: booking._id,
                    trackingId: booking.trackingId,

                    // ✅ STATUS ADDED
                    status: booking.status,

                    vendorName: `${vendor.firstName} ${vendor.lastName}`,
                    userName: `${booking.userId?.firstName || ""} ${booking.userId?.lastName || ""}`.trim(),
                    userEmail: booking.userId?.email || "",
                    amount: booking.AmountPaid || subtotal,
                    bookingDate: booking.completedAt,

                    serviceName: {
                        en: booking.listingId?.title?.en || "",
                        nl: booking.listingId?.title?.nl || "",
                    },

                    claimDetails: booking.claimDetails || null,
                });

                return;
            }

            // =====================================================
            // PAYOUT LOGIC
            // =====================================================
            if (booking.status === "completed") {
                payoutAmount = subtotal;
            }

            if (booking.status === "complain") {

                const refund = booking.claimDetails?.refundAmount || 0;

                const subtotal = booking.pricingBreakdown?.subtotal || 0;
                const total = booking.pricingBreakdown?.total || 0;

                const adminShare = total - subtotal; // 820 in your example
                const vendorShare = subtotal;        // 1000 in your example

                let remainingRefund = refund;

                // ==============================
                // 1. First deduct from admin
                // ==============================
                const adminDeduction = Math.min(remainingRefund, adminShare);
                remainingRefund -= adminDeduction;

                // ==============================
                // 2. Then deduct from vendor
                // ==============================
                const vendorDeduction = Math.min(remainingRefund, vendorShare);
                remainingRefund -= vendorDeduction;

                // ==============================
                // FINAL PAYOUT
                // ==============================
                payoutAmount = vendorShare - vendorDeduction;

                // safety
                payoutAmount = Math.max(payoutAmount, 0);
            }

            if (booking.status === "cancelled") {
                payoutAmount = upfrontFee * 0.88;
            }

            const payoutReadyAt = moment(booking.completedAt).add(
                escrowHours,
                "hours"
            );

            const formattedBooking = {
                bookingId: booking._id,
                trackingId: booking.trackingId,

                // ✅ STATUS ADDED HERE
                status: booking.status,

                vendorName: `${vendor.firstName} ${vendor.lastName}`,
                orderType: booking.orderType,
                userName: `${booking.userId?.firstName || ""} ${booking.userId?.lastName || ""}`.trim(),
                userEmail: booking.userId?.email || "",
                amount: payoutAmount.toFixed(2),
                bookingDate: booking.completedAt,

                serviceName: {
                    en: booking.listingId?.title?.en || "",
                    nl: booking.listingId?.title?.nl || "",
                },

                payoutReadyAt,

                claimDetails: booking.claimDetails || null,
            };

            // =====================================================
            // ESCROW OVERRIDE
            // =====================================================
            const bypassEscrow = ["cancelled", "complain"].includes(booking.status);

            if (bypassEscrow) {
                readyToPayOrders.push(formattedBooking);
                return;
            }

            // =====================================================
            // NORMAL ESCROW
            // =====================================================
            if (now.isSameOrAfter(payoutReadyAt)) {
                readyToPayOrders.push(formattedBooking);
            } else {
                pendingOrders.push(formattedBooking);
            }
        });

        return res.status(200).json({
            success: true,
            data: {
                stripeOnboarded: !!vendor.stripeOnboardingComplete,
                readyToPayOrders,
                pendingOrders,
                paidOrders,
            },
        });

    } catch (error) {
        console.error("Get vendor payout orders error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch payout orders",
            error: error.message,
        });
    }
};


const payoutVendorBookings = async (req, res) => {
    try {
        const { trackingIds, amount } = req.body;
        const { vendorId } = req.params;
        if (!vendorId || !trackingIds?.length || !amount) {
            return res.status(400).json({
                success: false,
                message: "vendorId, trackingIds and amount are required",
            });
        }

        const vendor = await User.findOne({ _id: vendorId });
        console.log(vendor, "vendorvendorvendorvendorvendor");

        if (!vendor) {
            return res.status(404).json({
                success: false,
                message: "Vendor not found",
            });
        }

        if (!vendor.stripeAccountId || !vendor.stripeOnboardingComplete) {
            return res.status(400).json({
                success: false,
                message: {
                    en: "Vendor is not connected/onboarded with Stripe",
                    nl: "De verkoper is niet verbonden / onboarded met Stripe",
                },
            });
        }

        const bookings = await Booking.find({
            trackingId: { $in: trackingIds },
            vendorId: vendorId,
            status: "completed",
            vendorPaid: false,
        });

        if (!bookings.length) {
            return res.status(404).json({
                success: false,
                message: "No eligible bookings found for payout",
            });
        }

        const stripeAmount = Math.round(Number(amount) * 100);

        const transfer = await stripe.transfers.create({
            amount: stripeAmount,
            currency: "eur",
            destination: vendor.stripeAccountId,
            metadata: {
                vendorId: vendor._id.toString(),
                trackingIds: trackingIds.join(", "),
            },
        });

        await Booking.updateMany(
            {
                _id: { $in: bookings.map((b) => b._id) },
            },
            {
                $set: {
                    vendorPaid: true,
                    vendorPaidAt: new Date(),
                    stripeTransferId: transfer.id,
                },
            }
        );

        res.status(200).json({
            success: true,
            message: {
                en: "Payout successful",
                nl: "Uitbetaling succesvol",
            },
            data: {
                transferId: transfer.id,
                totalAmountPaid: amount,
                paidBookings: bookings.length,
            },
        });
    } catch (error) {
        console.error("Vendor payout error:", error);

        res.status(500).json({
            success: false,
            message: "Payout failed",
            error: error.message,
        });
    }
};

const getRefundCases = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            type,
            status,
            search,
        } = req.query;
        const skip = (page - 1) * limit;
        const bookings = await Booking.find({
            $or: [
                { "claimDetails.claimedBy": { $in: ["client", "vendor"] } },
                { status: "completed", "pricingBreakdown.securityFee": { $gt: 0 } }
            ]
        })
            .populate("userId", "firstName lastName email")
            .populate("vendorId", "firstName lastName email")
            .select(
                "trackingId securityRefundDetails status claimDetails pricingBreakdown completedAt userId vendorId"
            )
            .lean()
            .sort({ createdAt: -1 });

        let allCases = [];

        bookings.forEach((booking) => {
            const baseData = {
                bookingId: booking._id,
                trackingId: booking.trackingId,
                clientName: `${booking.userId?.firstName || ""} ${booking.userId?.lastName || ""}`.trim(),
                clientEmail: booking.userId?.email || "",
                vendorName: `${booking.vendorId?.firstName || ""} ${booking.vendorId?.lastName || ""}`.trim(),
                vendorEmail: booking.vendorId?.email || "",
                bookingDate: booking.completedAt,
                bookingPricingBreakdown: booking.pricingBreakdown,
            };

            // ✅ CLIENT CLAIM
            if (booking.claimDetails?.claimedBy === "client") {
                allCases.push({
                    ...baseData,
                    type: "client_complain",
                    amount: booking.claimDetails.amount || 0,
                    status: booking.claimDetails.status,
                });
            }

            // ✅ VENDOR CLAIM
            if (booking.claimDetails?.claimedBy === "vendor") {
                allCases.push({
                    ...baseData,
                    type: "vendor_claim",
                    amount: booking.claimDetails.amount || 0,
                    status: booking.claimDetails.status,
                });
            }

            // ✅ SECURITY REFUND
            if (
                booking.status === "completed" &&
                (booking.pricingBreakdown?.securityFee || 0) > 0
            ) {
                allCases.push({
                    ...baseData,
                    type: "security_refund",
                    amount: booking.pricingBreakdown.securityFee,
                    status: booking?.securityRefundDetails?.isSecurityReturned ? "paid" : "pending",
                });
            }
        });

        // 🔍 FILTERS

        if (type) {
            allCases = allCases.filter((item) => item.type === type);
        }

        if (status) {
            allCases = allCases.filter((item) => item.type === status);
        }

        if (search) {
            const s = search.toLowerCase();
            allCases = allCases.filter((item) =>
                item.trackingId?.toLowerCase().includes(s) ||
                item.clientName?.toLowerCase().includes(s) ||
                item.vendorName?.toLowerCase().includes(s) ||
                item.clientEmail?.toLowerCase().includes(s) ||
                item.vendorEmail?.toLowerCase().includes(s)
            );
        }

        const total = allCases.length;
        const paginatedData = allCases.slice(skip, skip + Number(limit));
        return res.status(200).json({
            success: true,
            count: paginatedData.length,
            pagination: {
                total,
                page: Number(page),
                pages: Math.ceil(total / limit),
                limit: Number(limit),
            },
            data: paginatedData,
        });

    } catch (error) {
        console.error("Refund cases error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch refund cases",
            error: error.message,
        });
    }
};

const payVendorClaim = async (req, res) => {
    try {
        const { bookingId, amount } = req.body;

        const booking = await Booking.findById(bookingId)
            .populate("vendorId");

        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        if (booking.claimDetails?.claimedBy !== "vendor") {
            return res.status(400).json({ success: false, message: "Not a vendor claim" });
        }

        if (booking.claimDetails?.status === "paid") {
            return res.status(400).json({ success: false, message: "Already paid" });
        }

        const vendor = booking.vendorId;

        if (!vendor?.stripeAccountId || !vendor?.stripeOnboardingComplete) {
            return res.status(400).json({
                success: false,
                message: {
                    en: "Vendor not onboarded with Stripe",
                    nl: "Verkoper niet onboarded met Stripe",

                },
            });
        }

        const transfer = await stripe.transfers.create({
            amount: Math.round(amount * 100),
            currency: "eur",
            destination: vendor.stripeAccountId,
            metadata: {
                bookingId: booking._id.toString(),
                type: "vendor_claim",
            },
        });

        booking.claimDetails.status = "paid";
        booking.claimDetails.paidAt = new Date();
        booking.claimDetails.stripeTransferId = transfer.id;
        booking.claimDetails.AmountPaidByAdmin = amount;
        await booking.save();
        return res.status(200).json({
            success: true,
            message: "Vendor claim paid successfully",
            data: transfer,
        });

    } catch (error) {
        console.error("Vendor claim payout error:", error);
        return res.status(500).json({
            success: false,
            message: "Payout failed",
            error: error.message,
        });
    }
};

const refundClient = async (req, res) => {
    try {
        const { bookingId, amount, type } = req.body;
        // type = "security_fee" | "client_claim"

        const booking = await Booking.findById(bookingId);

        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }
        console.log(booking, "bookingbookingbooking");

        if (booking.payments.length == 0) {
            return res.status(400).json({
                success: false,
                message: {
                    en: "No payment found for refund"
                },
            });
        }

        let refundAmount = 0;

        // ✅ SECURITY FEE (FULL REFUND)
        if (type === "security_fee") {
            if (booking.isSecurityReturned) {
                return res.status(400).json({
                    success: false,
                    message: "Security fee already refunded",
                });
            }

            refundAmount = booking.pricingBreakdown?.securityFee || 0;

            if (refundAmount <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "No security fee to refund",
                });
            }
        }

        // ✅ CLIENT CLAIM (ADMIN DECIDES AMOUNT)
        if (type === "client_claim") {
            if (booking.claimDetails?.claimedBy !== "client") {
                return res.status(400).json({
                    success: false,
                    message: { en: "Not a client claim", nl: "Geen klantclaim" },
                });
            }

            if (booking.claimDetails?.status === "paid") {
                return res.status(400).json({
                    success: false,
                    message: {
                        en: "Already refunded",
                        nl: "Al terugbetaald",
                    },
                });
            }
            if (!amount || amount <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Valid refund amount required",
                });
            }
            refundAmount = amount;
        }

        // 💸 STRIPE REFUND
        let remainingRefund = refundAmount;
        const refundResults = [];
        const payments = booking.payments || [];

        for (let payment of payments) {
            if (remainingRefund <= 0) break;
            if (!payment.paymentIntentId) continue;
            const availableAmount = payment.amount;
            const refundForThisPayment = Math.min(availableAmount, remainingRefund);
            const refund = await stripe.refunds.create({
                payment_intent: payment.paymentIntentId,
                amount: Math.round(refundForThisPayment * 100),
            });
            refundResults.push({
                paymentIntentId: payment.paymentIntentId,
                refunded: refundForThisPayment,
                stripeRefundId: refund.id,
            });

            remainingRefund -= refundForThisPayment;
        }

        if (remainingRefund > 0) {
            return res.status(400).json({
                success: false,
                message: "Not enough paid amount to refund fully",
                remainingUnrefunded: remainingRefund,
            });
        }

        // const refund = await stripe.refunds.create({
        //     payment_intent: booking.paymentIntentId,
        //     amount: Math.round(refundAmount * 100),
        // });

        // ✅ UPDATE BOOKING

        if (type === "security_fee") {
            booking.securityRefundDetails.isSecurityReturned = true;
            booking.securityRefundDetails.securityReturnedAt = new Date();
            // booking.securityRefundDetails.stripeRefundId = refund.id;
            booking.securityRefundDetails.securityRefundAmount = refundAmount;
        }

        if (type === "client_claim") {
            booking.claimDetails.status = "paid";
            booking.claimDetails.paidAt = new Date();
            booking.claimDetails.refundAmount = refundAmount;
            booking.claimDetails.AmountPaidByAdmin = amount;
            // booking.claimDetails.stripeTransferIdToUser = refund.id;
        }
        await booking.save();
        return res.status(200).json({
            success: true,
            message: "Refund Successful"
        });

    } catch (error) {
        console.error("Refund error:", error);
        return res.status(500).json({
            success: false,
            message: "Refund failed",
            error: error.message,
        });
    }
};

module.exports = {
    getVendorPayoutDashboard,
    getVendorPayoutOrders,
    payoutVendorBookings,
    getRefundCases,
    payVendorClaim,
    refundClient
};