const Booking = require('../../models/Booking');
const Listing = require('../../models/Listing');
const SaleItemPurchase = require('../../models/SaleItemPurchase');
const Item = require('../../models/Item');
const Plan = require('../../models/Plan');


const getMonthlyBookingEarnings = async () => {
    return await Booking.aggregate([
        {
            $facet: {
                completed: [
                    { $match: { status: "completed" } },
                    {
                        $group: {
                            _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                            total: {
                                $sum: {
                                    $add: [
                                        { $toDouble: { $ifNull: ["$pricingBreakdown.platformFee", 0] } },
                                        { $toDouble: { $ifNull: ["$pricingBreakdown.evenyloProtectFee", 0] } }
                                    ]
                                }
                            }
                        }
                    }
                ],
                cancelledUpfront: [
                    {
                        $match: {
                            status: "cancelled",
                            paymentStatus: "upfront_paid"
                        }
                    },
                    {
                        $group: {
                            _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                            total: {
                                $sum: {
                                    $multiply: [
                                        { $toDouble: { $ifNull: ["$pricingBreakdown.upfrontFee", 0] } },
                                        0.12
                                    ]
                                }
                            }
                        }
                    }
                ]
            }
        },
        {
            $project: {
                combined: {
                    $concatArrays: ["$completed", "$cancelledUpfront"]
                }
            }
        },
        { $unwind: "$combined" },
        {
            $group: {
                _id: "$combined._id",
                bookingEarning: { $sum: "$combined.total" }
            }
        },
        { $sort: { "_id": 1 } }
    ]);
};

// ---------------------------
// SALE MONTHLY EARNINGS
// ---------------------------
const getMonthlySaleEarnings = async () => {
    return await SaleItemPurchase.aggregate([
        { $match: { status: "Delivered" } },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                saleEarning: { $sum: "$platformFee" }
            }
        },
        { $sort: { "_id": 1 } }
    ]);
};

// ---------------------------
// FINAL CHART DATA (JAN-DEC)
// ---------------------------
const getMonthlyPlatformEarnings = async () => {
    const booking = await getMonthlyBookingEarnings();
    const sale = await getMonthlySaleEarnings();

    const currentYear = new Date().getFullYear();

    // generate months "2025-01", "2025-02" ... "2025-12"
    const months = Array.from({ length: 12 }, (_, i) => {
        const monthNum = (i + 1).toString().padStart(2, "0");
        return `${currentYear}-${monthNum}`;
    });

    const result = months.map(month => {
        const b = booking.find(x => x._id === month);
        const s = sale.find(x => x._id === month);

        return {
            month,
            value: (b?.bookingEarning || 0) + (s?.saleEarning || 0)
        };
    });
    return result;
};

const getPlatformEarningFromBooking = async () => {
    const result = await Booking.aggregate([
        {
            $facet: {
                completedEarnings: [
                    { $match: { status: "completed" } },
                    {
                        $group: {
                            _id: null,
                            total: {
                                $sum: {
                                    $add: [
                                        { $toDouble: { $ifNull: ["$pricingBreakdown.evenyloProtectFee", 0] } },
                                        { $toDouble: { $ifNull: ["$pricingBreakdown.platformFee", 0] } }
                                    ]
                                }
                            }
                        }
                    }
                ],

                cancelledUpfrontEarnings: [
                    {
                        $match: {
                            status: "cancelled",
                            paymentStatus: "upfront_paid"
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            total: {
                                $sum: {
                                    $multiply: [
                                        { $toDouble: { $ifNull: ["$pricingBreakdown.upfrontFee", 0] } },
                                        0.12
                                    ]
                                }
                            }
                        }
                    }
                ]
            }
        },
        {
            $project: {
                platformEarning: {
                    $add: [
                        { $ifNull: [{ $arrayElemAt: ["$completedEarnings.total", 0] }, 0] },
                        { $ifNull: [{ $arrayElemAt: ["$cancelledUpfrontEarnings.total", 0] }, 0] }
                    ]
                }
            }
        }
    ]);

    return result[0].platformEarning || 0;
};

const getPlatformEarningFromSale = async () => {
    const result = await SaleItemPurchase.aggregate([
        {
            $match: { status: "Delivered" }
        },
        {
            $group: {
                _id: null,
                totalPlatformFeeFromSale: { $sum: "$platformFee" }
            }
        }
    ]);

    return result.length > 0 ? result[0].totalPlatformFeeFromSale : 0;
};


const getCategoryWiseEarnings = async () => {
    const data = await Booking.aggregate([
        // 1) Join listing
        {
            $lookup: {
                from: "listings",
                localField: "listingId",
                foreignField: "_id",
                as: "listing"
            }
        },
        { $unwind: "$listing" },

        // 2) Calculate booking/platform earnings per booking according to your rules
        // (use the same logic you used previously; here I sum platform + protect for delivered/completed bookings
        //  and 12% of upfrontFee for cancelled+upfront_paid bookings)
        {
            $group: {
                _id: "$listing.category",
                bookingEarning: {
                    $sum: {
                        $cond: [
                            { $eq: ["$status", "completed"] },
                            {
                                $add: [
                                    { $toDouble: { $ifNull: ["$pricingBreakdown.platformFee", 0] } },
                                    { $toDouble: { $ifNull: ["$pricingBreakdown.evenyloProtectFee", 0] } }
                                ]
                            },
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
                                            { $toDouble: { $ifNull: ["$pricingBreakdown.upfrontFee", 0] } },
                                            0.12
                                        ]
                                    },
                                    0
                                ]
                            }
                        ]
                    }
                },

                // also keep raw totals if you want to show them
                totalEarnings: {
                    $sum: { $toDouble: { $ifNull: ["$pricingBreakdown.total", 0] } }
                }
            }
        },

        // 3) lookup category name object
        {
            $lookup: {
                from: "categories",         // change this if your categories collection name is different
                localField: "_id",
                foreignField: "_id",
                as: "categoryData"
            }
        },
        { $unwind: { path: "$categoryData", preserveNullAndEmptyArrays: true } },

        // 4) project final fields (english name)
        {
            $project: {
                _id: 0,
                categoryId: "$_id",
                categoryName: { $ifNull: ["$categoryData.name.en", ""] },
                bookingEarning: 1,
                totalEarnings: 1
            }
        }
    ]);

    return data; // array of objects with categoryId, categoryName, bookingEarning, totalEarnings
};

// ---- Build final chart (always returns your 5 main categories)
const getCategoryChartData = async () => {
    const earnings = await getCategoryWiseEarnings();

    const MAIN_CATEGORIES = [
        "68943d2ba1a765a1f78a6338",
        "68943d2ca1a765a1f78a6349",
        "68943d2ca1a765a1f78a6353",
        "68943d2ca1a765a1f78a635b",
        "68943d2da1a765a1f78a6363"
    ];

    const finalChart = MAIN_CATEGORIES.map(catId => {
        const match = earnings.find(x => String(x.categoryId) === String(catId)); // string-safe compare

        return {
            categoryId: catId,
            name: match?.categoryName || "",        // English name if exists
            value: match?.bookingEarning || 0,     // platform earnings from bookings
        };
    });

    return finalChart;
};

exports.getStatsCard = async (req, res) => {
    try {
        const bookingEarnings = await getPlatformEarningFromBooking();
        const saleEarnings = await getPlatformEarningFromSale();
        const chartData = await getMonthlyPlatformEarnings();
        const pieChartData = await getCategoryChartData();

        const allBookings = await Booking.find().sort({ createdAt: -1 })
        const allSale = await SaleItemPurchase.aggregate([
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
        console.log(allSale, "allSaleallSaleallSaleallSale");

        res.json({
            success: true,
            totalEarnings: bookingEarnings + saleEarnings,
            bookingEarnings,
            saleEarnings,
            chartData,
            pieChartData,
            allBookings,
            allSale
        });

    } catch (error) {
        console.error("Dashboard Error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }

};
