const User = require('../../models/User');
const Vendor = require('../../models/Vendor');
const Listing = require('../../models/Listing');
const Booking = require('../../models/Booking');
const Purchase = require('../../models/SaleItemPurchase');
const Item = require('../../models/Item');

// --- Admin Dashboard Stats ---
const getDashboardStats = async (req, res) => {
  try {
    // Parallel queries for better performance
    const [
      totalClients,
      totalVendors,
      totalListings,
      totalBookings,
      totalPurchases,
      totalItems,
      monthlyData,
      recentBookings,
      recentPurchases,
      recentClients,
      recentVendors
    ] = await Promise.all([
      // Stats Cards
      User.countDocuments({ userType: 'client', isActive: true }),
      User.countDocuments({ userType: 'vendor', isActive: true }),
      Listing.countDocuments(),
      Booking.countDocuments(),
      Purchase.countDocuments(),
      Item.countDocuments(),

      // Monthly booking and purchase data (last 12 months)
      getMonthlyData(),

      // Recent bookings (last 3)
      Booking.find()
        .populate('userId', 'firstName lastName address')
        .sort({ createdAt: -1 })
        .limit(3)
        .select('trackingId userId details.eventLocation status createdAt'),

      // Recent purchases (last 3)
      Purchase.find()
        .populate('customerId', 'firstName lastName')
        .sort({ createdAt: -1 })
        .limit(3)
        .select('trackingId user itemName location status createdAt totalAmount'),

      // Recent clients (last 3)
      User.find({ userType: 'client', isActive: true })
        .sort({ createdAt: -1 })
        .limit(3)
        .select('firstName lastName email'),

      // Recent vendors (last 3)
      User.find({ userType: 'vendor', isActive: true })
        .sort({ createdAt: -1 })
        .limit(3)
        .select('firstName lastName email')
    ]);
    console.log(totalPurchases, "totalPurchasestotalPurchasestotalPurchases");

    // Format stats cards
    const statsCard = {
      "All Client": totalClients,
      "All Vendor": totalVendors,
      "Total Listings": totalListings,
      "Total Booking": totalBookings,
      "Total Purchases": totalPurchases,
      "Total Items": totalItems
    };

    // Format recent bookings
    const formattedRecentBookings = await Promise.all(
      (recentBookings || []).map(async (booking) => {
        let clientName = 'Unknown Client';
        let location = 'Unknown Location';

        if (booking.userId) {
          clientName = `${booking.userId.firstName || ''} ${booking.userId.lastName || ''}`.trim();
          location = booking.userId.address || booking.details?.eventLocation || 'Not specified';
        }

        return {
          trackingId: booking.trackingId,
          clientName,
          location,
          status: booking.status,
          createdAt: booking.createdAt,
          type: 'booking'
        };
      })
    );

    // Format recent purchases
    const formattedRecentPurchases = (recentPurchases || []).map((purchase) => {
      console.log(purchase, "PUUUUUU");

      let clientName = 'Unknown Client';

      if (purchase.customerId) {
        clientName = `${purchase.customerId.firstName || ''} ${purchase.customerId.lastName || ''}`.trim();
      }

      return {
        trackingId: purchase.trackingId,
        clientName,
        itemName: purchase.itemName,
        location: purchase.location,
        status: purchase.status,
        totalPrice: purchase.totalAmount,
        createdAt: purchase.createdAt,
        type: 'purchase'
      };
    });

    // Format recent clients with their last booking
    const formattedRecentClients = await Promise.all(
      (recentClients || []).map(async (client) => {
        console.log(client,"clientclientclientclientclientclient");
        const lastBooking = await Booking.findOne({ userId: client._id })
          .sort({ createdAt: -1 })
          .select('createdAt');

        return {
          id: client._id,
          name: `${client.firstName || ''} ${client.lastName || ''}`.trim(),
          email: client.email,
          lastBooking: lastBooking ? lastBooking.createdAt : ''
        };
      })
    );

    // Format recent vendors with their last booking
    const formattedRecentVendors = await Promise.all(
      (recentVendors || []).map(async (vendorUser) => {
        // Find vendor profile to get vendorId
        const vendorProfile = await Vendor.findOne({ userId: vendorUser._id });

        let lastBooking = null;

        if (vendorProfile) {
          const booking = await Booking.findOne({ vendorId: vendorUser._id })
            .sort({ createdAt: -1 })
            .select('createdAt');
          lastBooking = booking ? booking.createdAt : '';
        }

        return {
          id: vendorUser._id,
          name: `${vendorUser.firstName || ''} ${vendorUser.lastName || ''}`.trim(),
          email: vendorUser.email,
          lastBooking
        };
      })
    );

    // Return dashboard data
    res.json({
      success: true,
      data: {
        statsCard,
        monthlyBookingData: monthlyData.bookings,
        monthlyPurchaseData: monthlyData.purchases,
        recentBookings: formattedRecentBookings,
        recentPurchases: formattedRecentPurchases,
        recentClients: formattedRecentClients,
        recentVendors: formattedRecentVendors
      }
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Helper function to get monthly booking and purchase data for the last 12 months
const getMonthlyData = async () => {
  try {
    const currentYear = new Date().getFullYear();
    const startDate = new Date(currentYear, 0, 1);
    const endDate = new Date(currentYear, 11, 31, 23, 59, 59);

    // ------- BOOKINGS (COUNT + total booking amount) -------
    const bookingResult = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { month: { $month: "$createdAt" } },
          count: { $sum: 1 },
          totalAmount: { $sum: "$pricingBreakdown.total" }
        }
      }
    ]);

    // ------- PURCHASES (COUNT + TOTAL AMOUNT) -------
    const purchaseResult = await Purchase.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { month: { $month: "$createdAt" } },
          count: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" }
        }
      }
    ]);

    // Create lookup maps
    const bookingMap = {};
    const purchaseMap = {};

    bookingResult.forEach(item => {
      bookingMap[item._id.month] = {
        count: item.count,
        totalAmount: item.totalAmount
      };
    });

    purchaseResult.forEach(item => {
      purchaseMap[item._id.month] = {
        count: item.count,
        totalAmount: item.totalAmount
      };
    });

    // Final monthly arrays
    const monthlyBookingData = [];
    const monthlyPurchaseData = [];

    for (let month = 1; month <= 12; month++) {
      monthlyBookingData.push({
        month,
        count: bookingMap[month]?.count || 0,
        totalAmount: bookingMap[month]?.totalAmount || 0
      });

      monthlyPurchaseData.push({
        month,
        count: purchaseMap[month]?.count || 0,
        totalAmount: purchaseMap[month]?.totalAmount || 0
      });
    }

    return {
      bookings: monthlyBookingData,
      purchases: monthlyPurchaseData
    };

  } catch (error) {
    console.error('Monthly data error:', error);

    const fallbackBookingData = [];
    const fallbackPurchaseData = [];

    for (let month = 1; month <= 12; month++) {
      fallbackBookingData.push({ month, count: 0, totalAmount: 0 });
      fallbackPurchaseData.push({ month, count: 0, totalAmount: 0 });
    }

    return {
      bookings: fallbackBookingData,
      purchases: fallbackPurchaseData
    };
  }
};

module.exports = {
  getDashboardStats
};
