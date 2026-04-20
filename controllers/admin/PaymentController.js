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
            .populate("userId", "firstName lastName email contactNumber stripeOnboardingComplete")
            .skip(skip)
            .limit(limitNumber)
            .lean();

        const vendorUserIds = vendors.map((v) => v.userId?._id).filter(Boolean);

        const allBookings = await Booking.find({
            status: "completed",
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

        // KPI accumulation
        let totalOrdersReadyToPay = 0;
        let totalPendingPayments = 0;
        let totalPaidThisMonthAmount = 0;

        const data = vendors.map((vendor) => {
            const vendorBookings = allBookings.filter(
                (booking) =>
                    booking.vendorId?.toString() === vendor.userId?._id?.toString()
            );

            const totalCompletedOrders = vendorBookings.length;

            // Ready to pay: completed, escrow time passed, not paid
            const readyToPayOrders = vendorBookings.filter((booking) => {
                if (booking.vendorPaid) return false;
                if (!booking.completedAt) return false;
                const escrowHours = booking.listingId?.subCategory?.escrowHours || 0;
                const payoutReadyAt = moment(booking.completedAt).add(escrowHours, "hours");
                return now.isSameOrAfter(payoutReadyAt);
            });

            // Pending payments: completed, escrow time NOT passed, not paid
            const pendingPayments = vendorBookings.filter((booking) => {
                if (booking.vendorPaid) return false;
                if (!booking.completedAt) return false;
                const escrowHours = booking.listingId?.subCategory?.escrowHours || 0;
                const payoutReadyAt = moment(booking.completedAt).add(escrowHours, "hours");
                return now.isBefore(payoutReadyAt);
            });

            // Paid this month
            const paidThisMonthBookings = vendorBookings.filter(
                (booking) =>
                    booking.vendorPaid &&
                    booking.vendorPaidAt &&
                    moment(booking.vendorPaidAt).isSameOrAfter(startOfMonth)
            );

            const paidThisMonthAmount = paidThisMonthBookings.reduce(
                (sum, booking) =>
                    sum +
                    Number(booking.vendorPayoutAmount || booking.pricingBreakdown?.subtotal || 0),
                0
            );

            // KPI accumulation
            totalOrdersReadyToPay += readyToPayOrders.length;
            totalPendingPayments += pendingPayments.length;
            totalPaidThisMonthAmount += paidThisMonthAmount;

            console.log(vendor, "vendorvendorvendorvendorvendorvendor");

            return {
                vendorId: vendor._id,
                userId: vendor.userId?._id,
                vendorDetails: {
                    firstName: vendor.userId?.firstName,
                    lastName: vendor.userId?.lastName,
                    email: vendor.userId?.email,
                    businessName: vendor.businessName,
                    contactNumber: vendor.userId?.contactNumber
                },
                totalCompletedOrders,
                readyToPayOrdersCount: readyToPayOrders.length,
                pendingPaymentsCount: pendingPayments.length,
                paidThisMonthAmount,
                stripeOnboarded: !!vendor.userId?.stripeOnboardingComplete,
            };
        });

        res.status(200).json({
            success: true,
            kpis: {
                totalOrdersReadyToPay,
                totalPendingPayments,
                totalPaidThisMonthAmount: Number(totalPaidThisMonthAmount.toFixed(2)),
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
        console.log(vendor, "vendorvendorvendorvendorvendor");


        const bookings = await Booking.find({
            vendorId: vendorId,
            status: "completed",
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
            const escrowHours =
                booking.listingId?.subCategory?.escrowHours || 0;

            const payoutReadyAt = moment(booking.completedAt).add(
                escrowHours,
                "hours"
            );
            const formattedBooking = {
                bookingId: booking._id,
                trackingId: booking.trackingId,
                vendorName: `${vendor.firstName} ${vendor.lastName}`,
                orderType: booking.orderType,
                userName: `${booking.userId?.firstName || ""} ${booking.userId?.lastName || ""
                    }`.trim(),
                userEmail: booking.userId?.email || "",
                amount: booking.pricingBreakdown?.subtotal || 0,
                bookingDate: booking.completedAt,
                serviceName: {
                    en: booking.listingId?.title?.en || booking.listingId?.name?.en || "",
                    nl: booking.listingId?.title?.nl || booking.listingId?.name?.nl || "",
                },
            };
            if (booking.vendorPaid) {
                paidOrders.push(formattedBooking);
                return;
            }
            if (now.isSameOrAfter(payoutReadyAt)) {
                readyToPayOrders.push({
                    ...formattedBooking,
                    payoutReadyAt,
                });
            } else {
                pendingOrders.push({
                    ...formattedBooking,
                    payoutReadyAt,
                });
            }
        });

        res.status(200).json({
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

        res.status(500).json({
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
                message: "Vendor is not connected/onboarded with Stripe",
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

        console.log(stripeAmount, vendor, "stripeAmountstripeAmountstripeAmount");


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
            message: "Payout successful",
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

module.exports = {
    getVendorPayoutDashboard,
    getVendorPayoutOrders,
    payoutVendorBookings
};