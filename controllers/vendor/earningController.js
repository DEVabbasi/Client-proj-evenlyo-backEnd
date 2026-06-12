const mongoose = require('mongoose');
const Booking = require('../../models/Booking');
const Purchase = require('../../models/SaleItemPurchase');
const Listing = require('../../models/Listing');
const Item = require('../../models/Item');
const Category = require('../../models/Category');

// Helper to round numeric values to 3 decimal places (and ensure number type)
const round3 = (n) => Number(Number(n || 0).toFixed(3));

// GET /api/vendor/earnings/analytics
// Returns earning stats and monthly breakdown for a vendor
const getVendorEarningsAnalytics = async (req, res) => {
  try {

    let vendorId = req?.user?.id
    console.log(vendorId, " req.user req.user");

    if (!vendorId) return res.status(400).json({ success: false, message: 'Vendor not found in request.' });
    // Convert to ObjectId if needed
    if (typeof vendorId === 'string' || (vendorId && vendorId.constructor && vendorId.constructor.name !== 'ObjectID' && vendorId.constructor.name !== 'ObjectId')) {
      try {
        vendorId = new mongoose.Types.ObjectId(vendorId);
      } catch (e) {
        return res.status(400).json({ success: false, message: 'Invalid vendorId.' });
      }
    }

    // Date helpers
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const lastWeek = new Date(today); lastWeek.setDate(today.getDate() - 6);

    // Earnings stats
    const [todayEarnings, totalEarnings] = await Promise.all([
      Booking.aggregate([
        { $match: { vendorId: vendorId, status: 'completed', 'details.startDate': { $gte: today, $lt: tomorrow } } },
        { $group: { _id: null, total: { $sum: '$pricing.totalPrice' } } }
      ]),
      // Booking.aggregate([
      //   { $match: { vendorId: vendorId, status: 'completed', 'details.startDate': { $gte: lastWeek, $lt: tomorrow } } },
      //   { $group: { _id: null, total: { $sum: '$pricing.totalPrice' } } }
      // ]),
      Booking.aggregate([
        { $match: { vendorId: vendorId, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$pricing.totalPrice' } } }
      ])
    ]);

    // Monthly earnings breakdown
    const monthlyEarningsAgg = await Booking.aggregate([
      { $match: { vendorId: vendorId, status: 'completed' } },
      {
        $group: {
          _id: { month: { $month: '$details.startDate' } },
          totalEarnings: { $sum: '$pricing.totalPrice' }
        }
      },
      { $sort: { '_id.month': 1 } }
    ]);

    // Create a map of month earnings for quick lookup
    const earningsMap = {};
    monthlyEarningsAgg.forEach(m => {
      earningsMap[m._id.month] = m.totalEarnings;
    });

    // Format to desired payload with all 12 months: [{ month: 1, totalEarnings: 23 }, ...]
    const monthlyEarnings = [];
    for (let month = 1; month <= 12; month++) {
      monthlyEarnings.push({
        month: month,
        totalEarnings: earningsMap[month] || 0
      });
    }

    // Earnings by Category - aggregate through listing relationships
    const earningsByCategoryAgg = await Booking.aggregate([
      {
        $match: {
          vendorId: vendorId,
          status: { $in: ["completed", "cancelled"] }
        }
      },

      // Join listing
      {
        $lookup: {
          from: "listings",
          localField: "listingId",
          foreignField: "_id",
          as: "listing"
        }
      },
      { $unwind: "$listing" },

      // Join category
      {
        $lookup: {
          from: "categories",
          localField: "listing.category",
          foreignField: "_id",
          as: "category"
        }
      },
      {
        $unwind: {
          path: "$category",
          preserveNullAndEmptyArrays: true
        }
      },

      // Calculate earnings per booking
      {
        $project: {
          categoryId: "$listing.category",
          categoryName: { $ifNull: ["$category.name.en", "Others"] },

          bookingEarning: {
            $add: [

              // ✅ Completed → subtotal only
              {
                $cond: [
                  { $eq: ["$status", "completed"] },
                  { $toDouble: { $ifNull: ["$pricingBreakdown.subtotal", 0] } },
                  0
                ]
              },

              // ✅ Cancelled + upfront paid
              {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$status", "cancelled"] },
                      { $eq: ["$paymentStatus", "upfront_paid"] }
                    ]
                  },
                  {
                    $multiply: [
                      { $ifNull: ["$pricingBreakdown.upfrontFee", 0] },
                      0.88
                    ]
                  },
                  0
                ]
              }

            ]
          }
        }
      },

      // Group by category
      {
        $group: {
          _id: "$categoryId",
          categoryName: { $first: "$categoryName" },
          totalEarnings: { $sum: "$bookingEarning" },
          totalBookings: { $sum: 1 }
        }
      },

      { $sort: { totalEarnings: -1 } }
    ]);

    // Format earnings by category
    const earningsByCategory = earningsByCategoryAgg.map(cat => ({
      categoryId: cat._id || 'unknown',
      categoryName: cat.categoryName || 'Others',
      totalEarnings: cat?.totalEarnings?.toFixed(2),
      totalBookings: cat.totalBookings
    }));

    // Table: Tracking Id, Listing Name, Total Cost
    const bookings = await Booking.find({ vendorId, status: 'completed' })
      .populate('listingId', 'title')
      .select('trackingId listingId pricing.totalPrice');
    const bookingTable = bookings.map(b => ({
      trackingId: b.trackingId,
      listingName: b.listingId?.title?.en || b.listingId?.title || '',
      totalCost: b.pricing?.totalPrice || 0
    }));
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const monthlyRevenueAggAll = await Booking.aggregate([
      {
        $match: {
          vendorId: vendorId,
          createdAt: { $gte: startOfYear },
          status: { $in: ["completed", "cancelled"] }
        }
      },
      {
        $project: {
          month: { $month: "$createdAt" },
          completedRevenue: {
            $cond: [
              { $eq: ["$status", "completed"] },
              { $toDouble: { $ifNull: ["$pricingBreakdown.subtotal", 0] } },
              0
            ]
          },
          refundRevenue: {
            $cond: [
              {
                $and: [
                  { $eq: ["$status", "cancelled"] },
                  { $eq: ["$paymentStatus", "upfront_paid"] }
                ]
              },
              {
                $multiply: [
                  { $ifNull: ["$pricingBreakdown.upfrontFee", 0] },
                  0.88
                ]
              },
              0
            ]
          }
        }
      },
      {
        $group: {
          _id: "$month",
          revenue: { $sum: "$completedRevenue" },
          refundRevenue: { $sum: "$refundRevenue" }
        }
      },
      {
        $project: {
          _id: 1,
          revenue: {
            $add: ["$revenue", "$refundRevenue"]
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Array of 12 months, fill missing with 0
    console.log(monthlyRevenueAggAll, "monthlyRevenueAggAllmonthlyRevenueAggAll");

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todaysEarningsAgg = await Booking.aggregate([
      {
        $match: {
          vendorId: vendorId,
          createdAt: { $gte: startOfToday },
          status: { $in: ["completed", "cancelled"] }
        }
      },
      {
        $project: {
          completedRevenue: {
            $cond: [
              { $eq: ["$status", "completed"] },
              { $toDouble: { $ifNull: ["$pricingBreakdown.subtotal", 0] } },
              0
            ]
          },
          refundRevenue: {
            $cond: [
              {
                $and: [
                  { $eq: ["$status", "cancelled"] },
                  { $eq: ["$paymentStatus", "upfront_paid"] }
                ]
              },
              {
                $multiply: [
                  { $ifNull: ["$pricingBreakdown.upfrontFee", 0] },
                  0.88
                ]
              },
              0
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$completedRevenue" },
          refundRevenue: { $sum: "$refundRevenue" }
        }
      },
      {
        $project: {
          _id: 0,
          revenue: {
            $add: ["$revenue", "$refundRevenue"]
          }
        }
      }
    ]);


    console.log(todaysEarningsAgg, "todaysEarningsAggtodaysEarningsAggtodaysEarningsAgg");


    const todaysEarnings = todaysEarningsAgg[0]?.revenue || 0;

    const startOfLastWeek = new Date();
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
    const lastWeekEarningsAgg = await Booking.aggregate([
      {
        $match: {
          vendorId: vendorId,
          createdAt: { $gte: startOfLastWeek },
          status: { $in: ["completed", "cancelled"] }
        }
      },
      {
        $project: {
          completedRevenue: {
            $cond: [
              { $eq: ["$status", "completed"] },
              { $toDouble: { $ifNull: ["$pricingBreakdown.subtotal", 0] } },
              0
            ]
          },
          refundRevenue: {
            $cond: [
              {
                $and: [
                  { $eq: ["$status", "cancelled"] },
                  { $eq: ["$paymentStatus", "upfront_paid"] }
                ]
              },
              {
                $multiply: [
                  { $ifNull: ["$pricingBreakdown.upfrontFee", 0] },
                  0.88
                ]
              },
              0
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$completedRevenue" },
          refundRevenue: { $sum: "$refundRevenue" }
        }
      },
      {
        $project: {
          _id: 0,
          revenue: {
            $add: ["$revenue", "$refundRevenue"]
          }
        }
      }
    ]);

    const lastWeekEarnings = lastWeekEarningsAgg[0]?.revenue || 0;

    const monthlyEarningsAggs = await Booking.aggregate([
      {
        $match: {
          vendorId: vendorId,
          createdAt: { $gte: startOfYear },
          status: { $in: ["completed", "cancelled"] }
        }
      },
      {
        $project: {
          month: { $month: "$createdAt" },
          completedRevenue: {
            $cond: [
              { $eq: ["$status", "completed"] },
              { $toDouble: { $ifNull: ["$pricingBreakdown.subtotal", 0] } },
              0
            ]
          },
          refundRevenue: {
            $cond: [
              {
                $and: [
                  { $eq: ["$status", "cancelled"] },
                  { $eq: ["$paymentStatus", "upfront_paid"] }
                ]
              },
              {
                $multiply: [
                  { $ifNull: ["$pricingBreakdown.upfrontFee", 0] },
                  0.88
                ]
              },
              0
            ]
          }
        }
      },
      {
        $group: {
          _id: "$month",
          revenue: { $sum: "$completedRevenue" },
          refundRevenue: { $sum: "$refundRevenue" }
        }
      },
      {
        $project: {
          _id: 0,
          month: "$_id",
          totalEarnings: {
            $add: ["$revenue", "$refundRevenue"]
          }
        }
      },
      {
        $project: {
          _id: 0,
          month: "$_id",
          totalEarnings: 1
        }
      },
      { $sort: { month: 1 } }
    ]);




    // ✅ ADD THIS PART RIGHT HERE (AFTER AGGREGATE)

    const monthlyEarningsss = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;

      const foundMonth = monthlyEarningsAggs.find(
        (item) => item.month === month
      );

      return {
        month,
        totalEarnings: foundMonth
          ? Number(foundMonth.totalEarnings.toFixed(2))
          : 0
      };
    });

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const monthlyEarningsDailyAgg = await Booking.aggregate([
      {
        $match: {
          vendorId: vendorId,
          createdAt: { $gte: startOfMonth, $lt: endOfMonth },
          status: { $in: ["completed", "cancelled"] },
        },
      },
      {
        $project: {
          day: { $dayOfMonth: "$createdAt" },
          completedRevenue: {
            $cond: [
              { $eq: ["$status", "completed"] },
              { $toDouble: { $ifNull: ["$pricingBreakdown.subtotal", 0] } },
              0,
            ],
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
          _id: "$day",
          totalEarnings: {
            $sum: { $add: ["$completedRevenue", "$refundRevenue"] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const daysInCurrentMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    ).getDate();
    const currentMonthNumber = now.getMonth() + 1;
    const monthlyEarningsDaily = Array.from(
      { length: daysInCurrentMonth },
      (_, index) => {
        const day = index + 1;
        const found = monthlyEarningsDailyAgg.find((item) => item._id === day);
        const date = `${now.getFullYear()}-${String(currentMonthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        return {
          date,
          day,
          totalEarnings: found
            ? Number(found.totalEarnings.toFixed(2))
            : 0,
        };
      },
    );

    const earningsByCategoryMonthlyAgg = await Booking.aggregate([
      {
        $match: {
          vendorId: vendorId,
          status: { $in: ["completed", "cancelled"] },
          createdAt: { $gte: startOfMonth, $lt: endOfMonth },
        },
      },
      {
        $lookup: {
          from: "listings",
          localField: "listingId",
          foreignField: "_id",
          as: "listing",
        },
      },
      { $unwind: "$listing" },
      {
        $lookup: {
          from: "categories",
          localField: "listing.category",
          foreignField: "_id",
          as: "category",
        },
      },
      {
        $unwind: {
          path: "$category",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          categoryId: "$listing.category",
          categoryName: { $ifNull: ["$category.name.en", "Others"] },
          bookingEarning: {
            $add: [
              {
                $cond: [
                  { $eq: ["$status", "completed"] },
                  { $toDouble: { $ifNull: ["$pricingBreakdown.subtotal", 0] } },
                  0,
                ],
              },
              {
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
            ],
          },
        },
      },
      {
        $group: {
          _id: "$categoryId",
          categoryName: { $first: "$categoryName" },
          totalEarnings: { $sum: "$bookingEarning" },
          totalBookings: { $sum: 1 },
        },
      },
      { $sort: { totalEarnings: -1 } },
    ]);

    const earningsByCategoryMonthly = earningsByCategoryMonthlyAgg.map((cat) => ({
      categoryId: cat._id || "unknown",
      categoryName: cat.categoryName || "Others",
      totalEarnings: cat?.totalEarnings?.toFixed(2),
      totalBookings: cat.totalBookings,
    }));

    console.log(vendorId, "vendorIdvendorIdvendorId");

    const allBookings = await Booking.find({ vendorId })
    // const allSale = await Purchase.aggregate([
    //   {
    //     $match: {
    //       vendorId: new mongoose.Types.ObjectId(vendorId)
    //     }
    //   },
    //   { $unwind: "$items" },

    //   // Convert itemId to ObjectId
    //   {
    //     $addFields: {
    //       itemIdObj: { $toObjectId: "$items.itemId" }
    //     }
    //   },

    //   // Lookup item data
    //   {
    //     $lookup: {
    //       from: "serviceitems",
    //       localField: "itemIdObj",
    //       foreignField: "_id",
    //       as: "itemData"
    //     }
    //   },
    //   { $unwind: "$itemData" },

    //   {
    //     $addFields: {
    //       itemProfit: {
    //         $multiply: [
    //           { $subtract: ["$itemData.sellingPrice", "$itemData.purchasePrice"] },
    //           "$items.quantity"
    //         ]
    //       }
    //     }
    //   },

    //   {
    //     $group: {
    //       _id: "$_id",
    //       trackingId: { $first: "$trackingId" },
    //       vendorId: { $first: "$vendorId" },
    //       customerId: { $first: "$customerId" },
    //       status: { $first: "$status" },
    //       totalAmount: { $first: "$totalAmount" },
    //       deliveryAmount: { $first: "$deliveryAmount" },
    //       platformFee: { $first: "$platformFee" },
    //       items: {
    //         $push: {
    //           itemId: "$items.itemId",
    //           itemName: "$itemData.title",
    //           quantity: "$items.quantity",
    //           purchasePrice: "$itemData.purchasePrice",
    //           sellingPrice: "$itemData.sellingPrice",
    //           profit: "$itemProfit"
    //         }
    //       },
    //       totalProfit: { $sum: "$itemProfit" },
    //       totalKms: { $first: "$totalKms" },
    //       createdAt: { $first: "$createdAt" },
    //       deliveryAmount: { $first: "$deliveryAmount" },
    //       platformFee: { $first: "$platformFee" },
    //       deliveryLocation: { $first: "$deliveryLocation" },
    //       itemLocation: { $first: "$itemLocation" },
    //     }
    //   }
    // ]);

    const totalEarningsAgg = await Booking.aggregate([
      {
        $match: {
          vendorId: vendorId,
          status: { $in: ["completed", "cancelled"] }
        }
      },
      {
        $project: {
          completedRevenue: {
            $cond: [
              { $eq: ["$status", "completed"] },
              { $toDouble: { $ifNull: ["$pricingBreakdown.subtotal", 0] } },
              0
            ]
          },
          refundRevenue: {
            $cond: [
              {
                $and: [
                  { $eq: ["$status", "cancelled"] },
                  { $eq: ["$paymentStatus", "upfront_paid"] }
                ]
              },
              {
                $multiply: [
                  { $ifNull: ["$pricingBreakdown.upfrontFee", 0] },
                  0.88
                ]
              },
              0
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$completedRevenue" },
          refundRevenue: { $sum: "$refundRevenue" }
        }
      },
      {
        $project: {
          _id: 0,
          totalEarnings: {
            $add: ["$revenue", "$refundRevenue"]
          }
        }
      }
    ]);

    const totalEarningsValue = totalEarningsAgg[0]?.totalEarnings || 0;

    res.json({
      success: true,
      stats: {
        todayEarnings: todaysEarnings,
        lastWeekEarnings: lastWeekEarnings,
        totalEarnings: totalEarningsValue
      },
      monthlyEarnings: monthlyEarningsss,
      monthlyEarningsDaily,
      earningsByCategory,
      earningsByCategoryMonthly,
      bookingTable: allBookings,
    });
  } catch (err) {
    console.error('Vendor earnings analytics error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// GET /api/vendor/service-items/earnings/analytics
// Returns earning stats and detailed breakdown for service items
const getServiceItemEarningsAnalytics = async (req, res) => {
  try {
    let vendorId = req.user.id
    console.log(vendorId, "vendorIdvendorIdvendorId");

    if (!vendorId) return res.status(400).json({ success: false, message: 'Vendor not found in request.' });

    // Convert to ObjectId if needed
    if (typeof vendorId === 'string' || (vendorId && vendorId.constructor && vendorId.constructor.name !== 'ObjectID' && vendorId.constructor.name !== 'ObjectId')) {
      try {
        vendorId = new mongoose.Types.ObjectId(vendorId);
      } catch (e) {
        return res.status(400).json({ success: false, message: 'Invalid vendorId.' });
      }
    }

    // Date helpers
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const lastWeek = new Date(today); lastWeek.setDate(today.getDate() - 6);
    console.log(lastWeek, "lastWeeklastWeeklastWeek");
    // Earnings stats for completed purchases
    // const [todayEarnings, lastWeekEarnings, totalEarnings] = await Promise.all([
    //   Purchase.aggregate([
    //     { $match: { vendor: vendorId, createdAt: { $gte: today, $lt: tomorrow } } },
    //     { $group: { _id: null, total: { $sum: '$totalPrice' } } }
    //   ]),
    //   Purchase.aggregate([
    //     { $match: { vendor: vendorId, createdAt: { $gte: lastWeek, $lt: tomorrow } } },
    //     { $group: { _id: null, total: { $sum: '$totalPrice' } } }
    //   ]),
    //   Purchase.aggregate([
    //     { $match: { vendor: vendorId } },
    //     { $group: { _id: null, total: { $sum: '$totalPrice' } } }
    //   ])
    // ]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(todayStart.getDate() + 1);

    const lastWeekStart = new Date(todayStart);
    lastWeekStart.setDate(todayStart.getDate() - 7);
    console.log(lastWeekStart, "lastWeekStartlastWeekStart");

    const [todayAgg, lastWeekAgg, totalAgg] = await Promise.all([
      // ✅ Today Earnings
      Purchase.aggregate([
        {
          $match: {
            vendorId: vendorId,
            status: "Delivered",
            createdAt: { $gte: todayStart, $lt: tomorrowStart }
          }
        },
        {
          $group: {
            _id: null,
            earnings: {
              $sum: {
                $subtract: [
                  { $ifNull: ["$totalAmount", 0] },
                  { $ifNull: ["$platformFee", 0] }
                ]
              }
            }
          }
        }
      ]),

      // ✅ Last 7 Days Earnings
      Purchase.aggregate([
        {
          $match: {
            vendorId: vendorId,
            status: "Delivered",
            createdAt: { $gte: lastWeekStart, $lt: tomorrowStart }
          }
        },
        {
          $group: {
            _id: null,
            earnings: {
              $sum: {
                $subtract: [
                  { $ifNull: ["$totalAmount", 0] },
                  { $ifNull: ["$platformFee", 0] }
                ]
              }
            }
          }
        }
      ]),

      // ✅ Total Earnings (All Time)
      Purchase.aggregate([
        {
          $match: {
            vendorId: vendorId,
            status: "Delivered"
          }
        },
        {
          $group: {
            _id: null,
            earnings: {
              $sum: {
                $subtract: [
                  { $ifNull: ["$totalAmount", 0] },
                  { $ifNull: ["$platformFee", 0] }
                ]
              }
            }
          }
        }
      ])
    ]);

    console.log(todayAgg, lastWeekAgg, totalAgg, "VALUE");

    const todayEarnings = todayAgg[0]?.earnings || 0;
    const lastWeekEarnings = lastWeekAgg[0]?.earnings || 0;
    const totalEarnings = totalAgg[0]?.earnings || 0;

    // Monthly earnings breakdown
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const endOfYear = new Date(now.getFullYear() + 1, 0, 1);

    console.log(vendorId, "vendorIdvendorIdvendorIdvendorId");

    const monthlyEarningsAgg = await Purchase.aggregate([
      {
        $match: {
          vendorId: vendorId,
          status: "Delivered",
          createdAt: { $gte: startOfYear, $lt: endOfYear }
        }
      },
      {
        $project: {
          month: { $month: "$createdAt" },
          earning: {
            $subtract: [
              { $ifNull: ["$totalAmount", 0] },
              { $ifNull: ["$platformFee", 0] }
            ]
          }
        }
      },
      {
        $group: {
          _id: "$month",
          totalEarnings: { $sum: "$earning" }
        }
      },
      {
        $project: {
          _id: 0,
          month: "$_id",
          totalEarnings: { $round: ["$totalEarnings", 2] }
        }
      },
      { $sort: { month: 1 } }
    ]);
    console.log(monthlyEarningsAgg, "monthlyEarningsAggmonthlyEarningsAggmonthlyEarningsAgg");
    const monthlyEarnings = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const found = monthlyEarningsAgg.find(m => m.month === month);

      return {
        month,
        totalEarnings: found ? found.totalEarnings : 0
      };
    });
    // Earnings by Category - aggregate through item relationships
    const earningsByCategoryAgg = await Purchase.aggregate([
      {
        $match: {
          vendorId: vendorId,
          status: "Delivered"
        }
      },

      // 1️⃣ Break items
      { $unwind: "$items" },

      {
        $addFields: {
          itemObjectId: {
            $toObjectId: "$items.itemId"
          }
        }
      },
      {
        $lookup: {
          from: "serviceitems",
          localField: "itemObjectId",
          foreignField: "_id",
          as: "itemDetails"
        }
      },
      // // 2️⃣ Lookup sale item
      { $unwind: "$itemDetails" },

      // // 3️⃣ Ignore items NOT linked to listing
      {
        $match: {
          "itemDetails.linkedListing": { $ne: null }
        }
      },

      // // 4️⃣ Lookup listing
      {
        $lookup: {
          from: "listings",
          localField: "itemDetails.linkedListing",
          foreignField: "_id",
          as: "listingDetails"
        }
      },
      // { $unwind: "$listingDetails" },

      // // 5️⃣ Lookup category
      {
        $lookup: {
          from: "categories",
          localField: "listingDetails.category",
          foreignField: "_id",
          as: "categoryDetails"
        }
      },
      { $unwind: "$categoryDetails" },

      // // 6️⃣ Calculate vendor earning for order
      {
        $addFields: {
          vendorOrderEarning: {
            $subtract: [
              { $ifNull: ["$totalAmount", 0] },
              { $ifNull: ["$platformFee", 0] }
            ]
          },
          itemValue: {
            $multiply: [
              { $ifNull: ["$items.price", 0] },
              { $ifNull: ["$items.quantity", 1] }
            ]
          }
        }
      },

      // // 7️⃣ Group per order to get total item value
      {
        $group: {
          _id: "$_id",
          vendorOrderEarning: { $first: "$vendorOrderEarning" },
          totalItemValue: { $sum: "$itemValue" },
          items: {
            $push: {
              itemValue: "$itemValue",
              categoryId: "$categoryDetails._id",
              categoryName: "$categoryDetails.name.en"
            }
          }
        }
      },

      // 8️⃣ Re-unwind items
      { $unwind: "$items" },

      // 9️⃣ Allocate earning per item
      {
        $project: {
          categoryId: "$items.categoryId",
          categoryName: "$items.categoryName",
          itemEarning: {
            $cond: [
              { $gt: ["$totalItemValue", 0] },
              {
                $multiply: [
                  "$vendorOrderEarning",
                  { $divide: ["$items.itemValue", "$totalItemValue"] }
                ]
              },
              0
            ]
          }
        }
      },

      // 🔟 Group by category
      {
        $group: {
          _id: "$categoryId",
          categoryName: { $first: "$categoryName" },
          totalEarnings: { $sum: "$itemEarning" },
          totalPurchases: { $sum: 1 }
        }
      },

      // 1️⃣1️⃣ Final shape
      {
        $project: {
          _id: 0,
          categoryId: "$_id",
          categoryName: 1,
          totalEarnings: { $round: ["$totalEarnings", 2] },
          totalPurchases: 1
        }
      },

      { $sort: { totalEarnings: -1 } }
    ]);

    console.log(earningsByCategoryAgg, "earningsByCategoryAggearningsByCategoryAggearningsByCategoryAgg");

    // Format earnings by category
    const earningsByCategory = earningsByCategoryAgg.map(cat => ({
      categoryId: cat._id,
      categoryName: cat.categoryName || 'Others',
      totalEarnings: cat.totalEarnings,
      totalPurchases: cat.totalPurchases
    }));

    // Tracking Table: Tracking Id, Item Name, Customer Name, Total Cost, Status
    const purchases = await Purchase.find({ vendor: vendorId })
      .populate('item', 'title')
      .populate('user', 'firstName lastName')
      .select('trackingId item user totalPrice purchasedAt itemName userName')
      .sort({ purchasedAt: -1 });

    const trackingTable = purchases.map(p => ({
      trackingId: p.trackingId,
      itemName: p.item?.title?.en || p.itemName || '',
      customerName: p.user ? `${p.user.firstName} ${p.user.lastName}` : p.userName || '',
      totalCost: p.totalPrice || 0,
      purchaseDate: p.purchasedAt
    }));

    const allSale = await Purchase.aggregate([
      {
        $match: {
          vendorId: new mongoose.Types.ObjectId(vendorId)
        }
      },
      { $unwind: "$items" },

      // Convert itemId to ObjectId
      {
        $addFields: {
          itemIdObj: { $toObjectId: "$items.itemId" }
        }
      },

      // Lookup item data
      {
        $lookup: {
          from: "serviceitems",
          localField: "itemIdObj",
          foreignField: "_id",
          as: "itemData"
        }
      },
      { $unwind: "$itemData" },

      {
        $addFields: {
          itemProfit: {
            $multiply: [
              { $subtract: ["$itemData.sellingPrice", "$itemData.purchasePrice"] },
              "$items.quantity"
            ]
          }
        }
      },

      {
        $group: {
          _id: "$_id",
          trackingId: { $first: "$trackingId" },
          vendorId: { $first: "$vendorId" },
          customerId: { $first: "$customerId" },
          status: { $first: "$status" },
          totalAmount: { $first: "$totalAmount" },
          deliveryAmount: { $first: "$deliveryAmount" },
          platformFee: { $first: "$platformFee" },
          items: {
            $push: {
              itemId: "$items.itemId",
              itemName: "$itemData.title",
              quantity: "$items.quantity",
              purchasePrice: "$itemData.purchasePrice",
              sellingPrice: "$itemData.sellingPrice",
              profit: "$itemProfit"
            }
          },
          totalProfit: { $sum: "$itemProfit" },
          totalKms: { $first: "$totalKms" },
          createdAt: { $first: "$createdAt" },
          deliveryAmount: { $first: "$deliveryAmount" },
          platformFee: { $first: "$platformFee" },
          deliveryLocation: { $first: "$deliveryLocation" },
          itemLocation: { $first: "$itemLocation" },
        }
      }
    ]);

    // const todayEarnings = todayAgg[0]?.earnings || 0;
    // const lastWeekEarnings = lastWeekAgg[0]?.earnings || 0;
    // const totalEarnings = totalAgg[0]?.earnings || 0;
    res.json({
      success: true,
      stats: {
        todayEarnings: todayEarnings,
        lastWeekEarnings: lastWeekEarnings,
        totalEarnings: totalEarnings
      },
      monthlyEarnings,
      earningsByCategory,
      allSale
    });
  } catch (err) {
    console.error('Service item earnings analytics error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

module.exports = {
  getVendorEarningsAnalytics,
  getServiceItemEarningsAnalytics
};
