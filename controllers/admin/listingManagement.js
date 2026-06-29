const Category = require('../../models/Category');
const SubCategory = require('../../models/SubCategory');
const Listing = require('../../models/Listing');
const Booking = require('../../models/Booking');
const Item = require('../../models/Item');
const Purchase = require('../../models/SaleItemPurchase');
const ActivityLog = require('../../models/ActivityLog');
const { forcePng, withPngSubCategoryIcon } = require('../../utils/cloudinary');

const getAllListingManagementData = async (req, res) => {
  try {
    // Stats Card
    const totalCategories = await Category.countDocuments();
    const totalSubCategories = await SubCategory.countDocuments();
    const totalListings = await Listing.countDocuments();
    const totalServiceItems = await Item.countDocuments();

    // Get all categories
    const categories = await Category.find();

    // Aggregate bookings by category via listing
    const bookings = await Booking.aggregate([
      {
        $lookup: {
          from: 'listings',
          localField: 'listingId',
          foreignField: '_id',
          as: 'listingInfo',
        },
      },
      { $unwind: '$listingInfo' },
      {
        $group: {
          _id: '$listingInfo.category', // group by category
          count: { $sum: 1 },
          totalPrice: { $sum: '$pricing.totalPrice' }, // 👈 add total price
        },
      },
    ]);

    console.log(bookings, "bookingsbookingsbookings");

    // Map category _id to count
    const bookingCountMap = {};
    bookings.forEach(b => {
      bookingCountMap[b._id?.toString()] = {
        count: b.count,
        total: b.totalPrice || 0,
      };
    });
    // Aggregate purchases by category via service items
    const purchases = await Purchase.aggregate([
      // Step 1: unwind items array
      { $unwind: "$items" },

      // Step 2: convert string itemId → ObjectId
      {
        $addFields: {
          itemObjectId: {
            $cond: [
              {
                $and: [
                  { $ne: ["$items.itemId", null] },
                  { $eq: [{ $strLenCP: "$items.itemId" }, 24] }
                ]
              },
              { $toObjectId: "$items.itemId" },
              null
            ]
          }
        }
      },

      // Step 3: lookup item details
      {
        $lookup: {
          from: "serviceitems",
          localField: "itemObjectId",
          foreignField: "_id",
          as: "itemInfo"
        }
      },

      // Step 4: unwind itemInfo
      { $unwind: "$itemInfo" },

      // Step 5: group by category
      {
        $group: {
          _id: "$itemInfo.mainCategory",
          count: { $sum: 1 }
        }
      }
    ]);


    // Map purchase category _id to count
    const purchaseCountMap = {};
    purchases.forEach(p => {
      purchaseCountMap[p._id?.toString()] = p.count;
    });

    console.log(purchases, "purchasespurchasespurchasespurchasespurchases");


    // Prepare result for all categories (include id)
    const categoryBookings = categories.map(cat => ({
      id: cat._id,
      category: cat.name,
      count: bookingCountMap[cat._id.toString()]?.count || 0,  // 👈 fixed
      total: bookingCountMap[cat._id.toString()]?.count || 0,
    }));
    // Prepare purchase results for all categories
    const categoryPurchases = categories.map(cat => ({
      id: cat._id,
      category: cat.name,
      count: purchaseCountMap[cat._id.toString()] || 0
    }));

    // Table Data (using mainCategory, include id)
    const tableData = await Promise.all(
      categories.map(async cat => {
        const subCatCount = await SubCategory.countDocuments({ mainCategory: cat._id });
        return {
          id: cat._id,
          icon: cat.icon || '',
          name: cat.name,
          description: cat.description,
          totalSubCategories: subCatCount,
        };
      })
    );
    const activitySaleLog = await ActivityLog.find({ ActivityType: "sale" })
      .populate("vendorId", "firstName lastName email phone image")   // select only the needed fields
      .sort({ createdAt: -1 });

    const activityBookingLog = await ActivityLog.find({ ActivityType: "booking" })
      .populate("vendorId", "firstName lastName email phone image")
      .sort({ createdAt: -1 })

    res.json({
      statsCard: {
        totalCategories,
        totalSubCategories,
        totalListings,
        totalServiceItems,
      },
      categoryBookings,
      categoryPurchases,
      tableData,
      activitySaleLog,
      activityBookingLog
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get subcategories by main category id
const getSubCategoriesByMainCategory = async (req, res) => {
  try {
    const { mainCategoryId } = req.params;
    if (!mainCategoryId) {
      return res.status(400).json({ error: 'mainCategoryId is required' });
    }
    const subcategories = await SubCategory.find({ mainCategory: mainCategoryId });
    console.log(subcategories, "subcategoriessubcategories");

    const result = subcategories.map(sub => ({
      id: sub._id,
      icon: forcePng(sub.icon || ''),
      name: sub.name,
      description: sub.description,
      isActive: sub.isActive,
      isUpfrontEnabled: sub.isUpfrontEnabled,
      upfrontFeePercent: sub.upfrontFeePercent,
      escrowHours: sub.escrowHours,
      isEvenlyoProtectEnabled: sub.isEvenlyoProtectEnabled,
      evenlyoProtectFeePercent: sub.evenlyoProtectFeePercent
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Toggle subcategory active status by subcategory id
const toggleSubCategoryStatus = async (req, res) => {
  try {
    const { subCategoryId } = req.params;
    if (!subCategoryId) {
      return res.status(400).json({ error: 'subCategoryId is required' });
    }
    const subcategory = await SubCategory.findById(subCategoryId);
    if (!subcategory) {
      return res.status(404).json({ error: 'SubCategory not found' });
    }
    subcategory.isActive = !subcategory.isActive;
    await subcategory.save();
    res.json({
      id: subcategory._id,
      status: subcategory.isActive ? 'active' : 'deactive',
      message: `SubCategory status toggled to ${subcategory.isActive ? 'active' : 'deactive'}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Create new subcategory
const createSubCategory = async (req, res) => {
  try {
    const {
      name,
      icon,
      mainCategoryId,
      description,
      isUpfrontEnabled,
      upfrontFeePercent,
      escrowHours,
      isEvenlyoProtectEnabled,
      evenlyoProtectFeePercent,
      status
    } = req.body;

    // Validation for escrowHours
    if (escrowHours === undefined || escrowHours === null) {
      return res.status(400).json({ message: "escrowHours is required." });
    }

    if (typeof escrowHours !== "number" || escrowHours < 0) {
      return res.status(400).json({
        message: "escrow Hours must be greater than 0."
      });
    }

    const newSubCategory = new SubCategory({
      name,
      icon,
      mainCategory: mainCategoryId,
      description,
      isUpfrontEnabled,
      upfrontFeePercent,
      escrowHours,
      isEvenlyoProtectEnabled,
      evenlyoProtectFeePercent,
      status
    });

    await newSubCategory.save();

    return res.status(201).json({
      success: true,
      message: "Subcategory created successfully",
      data: withPngSubCategoryIcon(newSubCategory)
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

const editSubCategory = async (req, res) => {
  try {
    const { subCategoryId } = req.params;

    const body = req.body;

    if (body.escrowHours !== undefined) {
      const h = Number(body.escrowHours);
      if (Number.isNaN(h) || h <= 0) {
        return res.status(400).json({
          error: "escrowHours must be greater than 0",
        });
      }
    }

    const updated = await SubCategory.findByIdAndUpdate(
      subCategoryId,
      body,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "SubCategory not found" });
    }
    return res.json({
      success: true,
      message: "SubCategory updated successfully",
      data: withPngSubCategoryIcon(updated),
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getAllListingManagementData,
  getSubCategoriesByMainCategory,
  toggleSubCategoryStatus,
  createSubCategory,
  editSubCategory
};

