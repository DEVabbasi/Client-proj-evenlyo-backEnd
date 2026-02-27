const mongoose = require("mongoose");
const Booking = require("../../models/Booking");
const Listing = require("../../models/Listing");
const SaleItems = require("../../models/Item.js");
const User = require("../../models/User");
const Vendor = require("../../models/Vendor");
const Purchase = require("../../models/SaleItemPurchase.js");
const ActivityLog = require("../../models/ActivityLog.js");
const SaleItemPurchase = require("../../models/SaleItemPurchase.js");

// Vendor Dashboard Analytics Controller
const getDashboardAnalytics = async (req, res) => {
  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Get vendor ID from session or find vendor by user ID
    console.log(req.user, "req.userreq.user");

    let vendorId = req.user.id;

    if (!vendorId) {
      // Fallback: find vendor by user ID
      const vendor = await Vendor.findOne({ userId: req.user.id });
      // console.log(vendor, "vendorvendorvendorvendorvendor");

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message: "Vendor profile not found",
        });
      }
      vendorId = vendor.id;
    }
    console.log(vendorId, "vendorIdvendorIdvendorId");

    // Ensure vendorId is an ObjectId for aggregation match stages
    const vendorObjectId =
      typeof vendorId === "string" && mongoose.Types.ObjectId.isValid(vendorId)
        ? new mongoose.Types.ObjectId(vendorId)
        : vendorId;

    // 6. Recent Clients (last 5 unique clients who booked with vendor)
    const recentClientBookings = await Booking.find({ vendorId })
      .sort({ createdAt: -1 })
      .populate("userId", "firstName lastName email profileImage")
      .select("userId createdAt");
    const seenClientIds = new Set();
    const recentClients = [];
    for (const booking of recentClientBookings) {
      if (booking.userId && !seenClientIds.has(booking.userId._id.toString())) {
        seenClientIds.add(booking.userId._id.toString());
        recentClients.push({
          id: booking.userId._id,
          name: `${booking.userId.firstName} ${booking.userId.lastName}`,
          email: booking.userId.email,
          profileImage: booking.userId.profileImage,
          lastBooking: booking.createdAt,
        });
      }
    }
    console.log(vendorObjectId, "vendorObjectIdvendorObjectIdvendorObjectId");

    // 7. Total unique clients who gave booking to this vendor
    const totalClientsAgg = await Booking.aggregate([
      { $match: { vendorId: vendorObjectId } },
      { $group: { _id: "$userId" } },
      { $count: "total" },
    ]);
    const totalClients =
      totalClientsAgg.length > 0 ? totalClientsAgg[0].total : 0;

    // Use Vendor model stats if available
    const vendorDoc = await Vendor.findById(vendorId);
    const completedBookingsCount = vendorDoc?.completedBookings ?? 0;
    const totalBookings = vendorDoc?.totalBookings ?? 0;

    // 2. Monthly Revenue (current month and all months for average)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    // All months in current year
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const monthlyRevenueAggAll = await Booking.aggregate([
      {
        $match: {
          vendorId: vendorObjectId,
          createdAt: { $gte: startOfYear },
          status: { $in: ["completed", "cancelled"] },
        },
      },
      {
        $project: {
          month: { $month: "$createdAt" },

          // ✅ Only vendor service amount
          completedRevenue: {
            $cond: [
              { $eq: ["$status", "completed"] },
              { $ifNull: ["$pricingBreakdown.subtotal", 0] },
              0
            ]
          },
          refundRevenue: {
            $cond: [
              {
                $and: [
                  { $eq: ["$status", "cancelled"] },
                  { $eq: ["$paymentStatus", "upfront_paid"] },
                ],
              },
              {
                $multiply: [
                  { $ifNull: ["$pricingBreakdown.upfrontFee", 0] },
                  0.88,
                ],
              },
              0,
            ],
          },
        },
      },
      {
        $group: {
          _id: "$month",
          revenue: {
            $sum: {
              $add: ["$completedRevenue", "$refundRevenue"]
            }
          }
        }
      },
      { $sort: { _id: 1 } },
    ]);
    // Array of 12 months, fill missing with 0
    console.log(
      monthlyRevenueAggAll,
      "monthlyRevenueAggAllmonthlyRevenueAggAll"
    );

    // const monthlyRevenueByMonth = Array.from({ length: 12 }, (_, i) => {
    //   const found = monthlyRevenueAggAll.find(m => m._id === i + 1);
    //   return found ? found.revenue : 0;
    // });
    // Average monthly revenue (across all months)
    // const monthlyRevenue =
    //   Number((monthlyRevenueByMonth.reduce((sum, val) => sum + val, 0) / 12).toFixed(3));

    // 3. Total Number of Items Listed (only 'active' listings, using Listing model)
    const totalItemsListed = await Listing.countDocuments({
      vendor: vendorId,
      status: "active",
      isActive: true,
    });

    // New: Total Service Items (listings that are services)
    // We consider a listing a service when `serviceDetails.serviceType` exists (human/non_human)
    const totalServiceItems = await SaleItems.countDocuments({
      vendor: vendorId,
    });

    // 4. Recent Bookings (last 5)
    const recentBookings = await Booking.find({ vendorId })
      .sort({ createdAt: -1 })
      .limit(3)
      .populate("userId", "firstName lastName address")
      .select("trackingId details eventLocation status createdAt userId");

    console.log(recentBookings, "recentBookingsrecentBookings@#@$#$@");

    // 5. Order Overview by Month (just number of bookings per month)
    const orderOverviewAgg = await Booking.aggregate([
      {
        $match: { vendorId: vendorObjectId, createdAt: { $gte: startOfYear } },
      },
      {
        $group: {
          _id: { month: { $month: "$createdAt" } },
          totalOrders: { $sum: 1 },
        },
      },
      { $sort: { "_id.month": 1 } },
    ]);
    // Fill missing months with 0 orders
    const orderOverview = Array.from({ length: 12 }, (_, i) => {
      const found = orderOverviewAgg.find((m) => m._id.month === i + 1);
      return { month: i + 1, totalOrders: found ? found.totalOrders : 0 };
    });

    // 6. Purchase Overview by Month (sale item purchases for this vendor)
    const purchaseAgg = await Purchase.aggregate([
      {
        $match: { vendor: vendorObjectId, purchasedAt: { $gte: startOfYear } },
      },
      {
        $group: {
          _id: { month: { $month: "$purchasedAt" } },
          totalPurchases: { $sum: "$quantity" },
        },
      },
      { $sort: { "_id.month": 1 } },
    ]);

    const endOfYear = new Date(new Date().getFullYear() + 1, 0, 1);
    const monthlyOrders = await SaleItemPurchase.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startOfYear,
            $lt: endOfYear,
          },
        },
      },
      {
        $group: {
          _id: { month: { $month: "$createdAt" } },
          totalOrders: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          month: "$_id.month",
          totalOrders: 1,
        },
      },
      { $sort: { month: 1 } },
    ]);

    function getOrdersPerMonthCurrentYear(monthlyOrders) {
      return Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        const found = monthlyOrders.find((m) => m.month === month);
        return {
          month,
          totalOrders: found?.totalOrders || 0,
        };
      });
    }
    const purchaseOverview = Array.from({ length: 12 }, (_, i) => {
      const found = purchaseAgg.find((m) => m._id.month === i + 1);
      return { month: i + 1, totalPurchases: found ? found.totalPurchases : 0 };
    });
    console.log(req.user, "req.user.idreq.user.idreq.user.id");

    const activityLog = await ActivityLog.find({ vendorId: req.user.id }).sort({
      createdAt: -1,
    });
    console.log(activityLog, "activityLogactivityLogactivityLogactivityLog");
    console.log(vendorId, "vendorIdvendorIdvendorIdvendorId");

    // Recent Purchases (last 3)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const recentPurchases = await Purchase.find({
      vendorId: vendorId,
      createdAt: { $gte: oneWeekAgo },
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .populate("customerId", "firstName lastName email")
      .select(
        "trackingId itemName user userName quantity totalPrice status purchasedAt"
      );

    const totalBookingsCount = await Booking.countDocuments({ vendorId });
    console.log(totalBookingsCount, "totalBookingstotalBookingstotalBookings");

    // const monthlyBookingAgg = await Booking.aggregate([
    //   {
    //     $match: {
    //       createdAt: { $gte: startDate, $lte: endDate },
    //     }
    //   },
    //   {
    //     $group: {
    //       _id: { month: { $month: "$createdAt" } },
    //       count: { $sum: 1 },
    //       totalAmount: { $sum: "$pricingBreakDown.total" }   // ← ADD THIS
    //     }
    //   },
    //   { $sort: { "_id.month": 1 } }
    // ]);

    // ---------------------------
    // 📌 PURCHASE MONTHLY DATA
    // ---------------------------
    // const monthlyPurchaseAgg = await Purchase.aggregate([
    //   {
    //     $match: {
    //       createdAt: { $gte: startDate, $lte: endDate },
    //     }
    //   },
    //   {
    //     $group: {
    //       _id: { month: { $month: "$createdAt" } },
    //       count: { $sum: 1 },
    //       totalAmount: { $sum: "$totalAmount" }  // ← PURCHASE TOTAL
    //     }
    //   },
    //   { $sort: { "_id.month": 1 } }
    // ]);
    // const finalBookings = [];
    // const finalPurchases = [];

    // for (let month = 1; month <= 12; month++) {
    //   finalBookings.push({
    //     month,
    //     count: bookingMap[month]?.count || 0,
    //     totalAmount: bookingMap[month]?.totalAmount || 0
    //   });

    //   finalPurchases.push({
    //     month,
    //     count: purchaseMap[month]?.count || 0,
    //     totalAmount: purchaseMap[month]?.totalAmount || 0
    //   });
    // }
    const result = getOrdersPerMonthCurrentYear(monthlyOrders);
    console.log(result, "resultresultresult");

    res.json({
      success: true,
      stats: {
        totalBookingsCount,
        completedBookingsCount,
        totalBookings,
        monthlyRevenue:
          monthlyRevenueAggAll.length > 0
            ? monthlyRevenueAggAll[0]?.revenue
            : 0, // now average of all months
        totalItemsListed,
        totalServiceItems,
        totalClients,
      },
      recentBookings: recentBookings.map((b) => ({
        trackingId: b.trackingId,
        clientName: b.userId
          ? `${b.userId.firstName} ${b.userId.lastName}`
          : "",
        location: b.details?.eventLocation || "",
        status: b.status,
        createdAt: b.createdAt,
        _id: b._id,
      })),
      orderOverview,
      purchaseOverview: result,
      recentPurchases: recentPurchases.map((p) => ({
        // ...p.toObject(),
        trackingId: p.trackingId,
        itemName: p.itemName,
        buyerDetails: p.customerId,
        quantity: p.quantity,
        totalPrice: p.totalPrice,
        status: p.status,
        purchasedAt: p.purchasedAt,
      })),
      recentClients,
      activityLog,
    });
  } catch (err) {
    console.error("Dashboard analytics error:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

module.exports = {
  getDashboardAnalytics,
};
