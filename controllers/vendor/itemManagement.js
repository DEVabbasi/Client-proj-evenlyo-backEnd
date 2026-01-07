
const Item = require('../../models/Item');
const Category = require('../../models/Category');
const SubCategory = require('../../models/SubCategory');
const Listing = require('../../models/Listing');
const Purchase = require('../../models/SaleItemPurchase');
const ServiceItemStockLog = require('../../models/ServiceItemStockLog');
const { toMultilingualText } = require('../../utils/textUtils');
const SaleItem = require('../../models/Item');
const SaleItemPurchase = require('../../models/SaleItemPurchase');
const ActivityLog = require("../../models/ActivityLog")
const { createActivityLog } = require("../../utils/activityLogger")
const ServiceItem = require('../../models/Item');
const mongoose = require('mongoose');
// Update complete item


const itemDetailById = async (req, res) => {
	const { itemId } = req.params;

	try {
		const details = await Item.findOne({ _id: itemId })
			.populate("mainCategory", "name")       // Select only "name" field
			.populate("subCategory", "name");       // Select only "name" field

		if (!details) {
			return res.status(404).json({
				success: false,
				message: "Item not found"
			});
		}

		return res.status(200).json({
			success: true,
			message: "Item details fetched successfully",
			data: details
		});

	} catch (error) {
		console.error("Item detail error:", error);
		return res.status(500).json({
			success: false,
			message: "Internal server error"
		});
	}
};

const createItem = async (req, res) => {
	try {
		const {
			title,
			mainCategory,
			subCategory,
			purchasePrice,
			sellingPrice,
			stockQuantity,
			image,
			linkedListing,
			location,
			extraDeliveryCharges
		} = req.body;

		if (!req.user || !req.user.vendorId) {
			return res.status(401).json({
				success: false,
				message: 'Vendor authentication required'
			});
		}

		if (!title || (typeof title === 'string' && !title.trim())) {
			return res.status(400).json({
				success: false,
				message: 'Validation error',
				errors: ['Title is required']
			});
		}

		let listingDetails = null;
		if (linkedListing) {
			try {
				const listing = await Listing.findById(linkedListing);
				if (!listing) {
					return res.status(404).json({
						success: false,
						message: 'Linked listing not found'
					});
				}
				const currentVendorId = req.user.id;
				console.log(currentVendorId, listing.vendor.toString(), "currentVendorIdcurrentVendorIdcurrentVendorId");

				if (listing.vendor.toString() !== currentVendorId) {
					return res.status(403).json({
						success: false,
						message: 'You can only link items to your own listings'
					});
				}
				listingDetails = {
					id: listing._id,
					title: listing.title
				};
			} catch (error) {
				return res.status(400).json({
					success: false,
					message: 'Invalid linked listing ID'
				});
			}
		}

		let mainCategoryName = 'Others';
		let subCategoryName = 'Others';

		if (mainCategory) {
			const category = await Category.findById(mainCategory);
			if (category && category.name && category.name.en) {
				mainCategoryName = category.name.en;
			}
		}

		if (subCategory) {
			const subCat = await SubCategory.findById(subCategory);
			if (subCat && subCat.name && subCat.name.en) {
				subCategoryName = subCat.name.en;
			}
		}

		const multilingualTitle = toMultilingualText(title);

		const item = new Item({
			title: multilingualTitle,
			mainCategory: mainCategory || null,
			subCategory: subCategory || null,
			mainCategoryName,
			subCategoryName,
			purchasePrice,
			sellingPrice,
			stockQuantity,
			image,
			vendor: req.user.id,
			linkedListing: linkedListing || null,
			location,
			extraDeliveryCharges
		});

		await item.save();

		try {
			await ServiceItemStockLog.create({
				item: item._id,
				type: 'checkin',
				quantity: Number(stockQuantity) || 0,
				note: 'Initial stock on item creation',
				createdBy: req.user?._id
			});
		} catch (e) {
			console.warn('Failed to log initial service item stock checkin:', e.message);
		}
		let awaitingActivityLog = null
		try {
			const itemTitle = multilingualTitle?.en || title;
			awaitingActivityLog = await createActivityLog({
				heading: 'New Sale Item Added',
				type: 'sale_item_added',
				description: `Added new sale item: "${itemTitle}" with stock quantity of ${stockQuantity}`,
				vendorId: req.user.id,
				ActivityType: "sale"
			});
		} catch (error) {
			console.warn('Failed to create activity log:', error.message);
		}
		console.log(awaitingActivityLog, "LOGLOGLOGLOGLOGLOGLOG")


		return res.status(201).json({
			success: true,
			item,
			listingDetails: listingDetails,
			awaitingActivityLog

		});
	} catch (error) {
		return res.status(500).json({ success: false, message: error.message });
	}
};

// Get all items for a vendor with their linked listings
const getVendorItems = async (req, res) => {
	try {
		// Validate vendor session
		if (!req.user || !req.user.vendorId) {
			return res.status(401).json({
				success: false,
				message: 'Vendor authentication required'
			});
		}

		const vendorId = req.user.vendorId;

		const items = await Item.find({ vendor: vendorId })
			.populate('mainCategory', 'name')
			.populate('subCategory', 'name')
			.populate('linkedListing', 'title')
			.sort({ createdAt: -1 });

		return res.status(200).json({
			success: true,
			items,
			count: items.length
		});
	} catch (error) {
		return res.status(500).json({ success: false, message: error.message });
	}
};

// Update item's linked listing
const updateItemListing = async (req, res) => {
	try {
		// Validate vendor session
		if (!req.user || !req.user.vendorId) {
			return res.status(401).json({
				success: false,
				message: 'Vendor authentication required'
			});
		}
		const { itemId } = req.params;
		const { linkedListing } = req.body;
		const vendorId = req.user.vendorId;

		// Find the item and verify ownership
		const item = await Item.findById(itemId);
		if (!item) {
			return res.status(404).json({
				success: false,
				message: 'Item not found'
			});
		}

		if (item.vendor.toString() !== vendorId) {
			return res.status(403).json({
				success: false,
				message: 'You can only update your own items'
			});
		}

		// Validate linked listing if provided
		let listingDetails = null;
		if (linkedListing) {
			try {
				const listing = await Listing.findById(linkedListing);
				if (!listing) {
					return res.status(404).json({
						success: false,
						message: 'Linked listing not found'
					});
				}
				// Check if listing belongs to the same vendor
				if (listing.vendor.toString() !== vendorId) {
					return res.status(403).json({
						success: false,
						message: 'You can only link items to your own listings'
					});
				}
				listingDetails = {
					id: listing._id,
					title: listing.title
				};
			} catch (error) {
				return res.status(400).json({
					success: false,
					message: 'Invalid linked listing ID'
				});
			}
		}

		// Update the item
		item.linkedListing = linkedListing || null;
		await item.save();

		return res.status(200).json({
			success: true,
			message: 'Item linked listing updated successfully',
			item,
			listingDetails: listingDetails
		});
	} catch (error) {
		return res.status(500).json({ success: false, message: error.message });
	}
};

// Remove listing link from item
const removeItemListing = async (req, res) => {
	try {
		// Validate vendor session
		if (!req.user || !req.user.vendorId) {
			return res.status(401).json({
				success: false,
				message: 'Vendor authentication required'
			});
		}

		const { itemId } = req.params;
		const vendorId = req.user.vendorId;

		// Find the item and verify ownership
		const item = await Item.findById(itemId);
		if (!item) {
			return res.status(404).json({
				success: false,
				message: 'Item not found'
			});
		}

		if (item.vendor.toString() !== vendorId) {
			return res.status(403).json({
				success: false,
				message: 'You can only update your own items'
			});
		}

		// Remove the linked listing
		item.linkedListing = null;
		await item.save();

		return res.status(200).json({
			success: true,
			message: 'Listing link removed successfully',
			item
		});
	} catch (error) {
		return res.status(500).json({ success: false, message: error.message });
	}
};

const getVendorItemsOverview = async (req, res) => {
	try {
		const vendorId = req.user.id
		if (!vendorId) {
			return res.status(400).json({
				success: false,
				message: 'Vendor not found in request.'
			});
		}

		// Get all items for this vendor
		const items = await Item.find({ vendor: vendorId })
			.populate('mainCategory', 'name')
			.populate('subCategory', 'name')
			.sort({ createdAt: -1 });

		// Stats: unique main categories and subcategories
		const mainCategorySet = new Set();
		const subCategorySet = new Set();
		items.forEach(item => {
			if (item.category) mainCategorySet.add(item.category._id.toString());
			if (item.subCategory) subCategorySet.add(item.subCategory._id.toString());
		});

		// Total number of items
		const totalItems = items.length;

		// Most purchased items (for bar chart)
		const Purchases = await Purchase.aggregate([
			{ $match: { vendorId: vendorId } },
			{ $group: { _id: '$itemId', count: { $sum: 1 } } },
			{ $sort: { count: -1 } }
		]);

		// Map purchase counts to itemId
		const purchaseCountMap = {};
		Purchases.forEach(b => { purchaseCountMap[b._id?.toString()] = b.count; });

		// listingOverview: all items with their purchase count
		const itemOverview = items.map(item => ({
			itemId: item._id,
			title: item.title?.en || item.title,
			purchasedCount: purchaseCountMap[item._id.toString()] || 0
		}));
		console.log(items, "itemsitemsitemsitemsitems");

		// itemsTable: all items with required details
		const itemsTable = items.map(item => ({
			...item.toObject(),
			itemId: item._id,
			image: item.image || '',
			title: item.title || item.title,
			description: item.description || item.description,
			mainCategory: item.mainCategory || 'Others',
			subCategory: item.subCategory || 'Others',
			SellingPrice: item.sellingPrice || 0,
			PurchasePrice: item.purchasePrice || 0,
			Stock: item.stockQuantity || 0,
			date: item.createdAt,
			status: item.status,
			linkedListing: item.linkedListing
		}));

		const activityLog = await ActivityLog.find({ vendorId })

		const totalMain = await SaleItem.find({
			vendor: vendorId,
			mainCategory: { $ne: null }
		});

		const now = new Date();
		const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

		// Fetch delivered orders of current month
		const bestSellingAgg = await SaleItemPurchase.aggregate([
			{
				$match: {
					vendorId: new mongoose.Types.ObjectId(vendorId),
					status: "Delivered",
					createdAt: { $gte: startOfMonth, $lt: endOfMonth },
				},
			},

			{ $unwind: "$items" },

			{
				$group: {
					_id: "$items.itemId", // ✅ CORRECT GROUP KEY
					title: { $first: "$items.title" },
					image: { $first: "$items.image" },
					totalSold: { $sum: "$items.quantity" },
				},
			},

			{ $sort: { totalSold: -1 } },
			{ $limit: 5 },
		]);

		console.log(totalMain, "totalMaintotalMaintotalMain");
		res.json({
			success: true,
			stats: {
				totalMainCategories: totalMain.length,
				totalSubCategories: subCategorySet.size,
				totalItems: totalItems
			},
			bestSellingProducts: bestSellingAgg,
			activityLog,
			itemOverview,
			itemsTable
		});
	} catch (err) {
		console.error('Vendor listing overview error:', err);
		res.status(500).json({ success: false, message: 'Server error', error: err.message });
	}
};

// ✅ Update Complete Service Item
const updateItem = async (req, res) => {
	console.log("CALLEDdddd", req.params.itemId, req.body);

	try {
		const existing = await Item.findById(req.params.itemId);
		console.log("EXISTING ITEM:", existing);

		if (!existing) {
			return res.status(404).json({
				success: false,
				message: "Item not found in DB",
			});
		}
		const updateData = {
			...req.body,
			mainCategory: req.body.mainCategory || null,
			subCategory: req.body.subCategory || null,
		};
		const item = await Item.findOneAndUpdate(
			{ _id: req.params.itemId },
			{ $set: updateData },
			{ new: true }
		);
		return res.status(200).json({
			success: true,
			message: "Item updated successfully",
			item: item,
		});
	} catch (error) {
		console.error("Error updating item:", error);
		return res.status(500).json({
			success: false,
			message: error.message,
		});
	}
};
// // 🔒 Vendor authentication check
// if (!req.user || !req.user.id) {
// 	return res.status(401).json({
// 		success: false,
// 		message: "Vendor authentication required",
// 	});
// }

// const { itemId } = req.params;
// const {
// 	title,
// 	mainCategory,
// 	subCategory,
// 	purchasePrice,
// 	sellingPrice,
// 	stockQuantity,
// 	image,
// 	linkedListing,
// } = req.body;

// const vendorId = req.user.id;

// // 🔎 Find item
// const item = await ServiceItem.findById(itemId);
// if (!item) {
// 	return res.status(404).json({
// 		success: false,
// 		message: "Item not found",
// 	});
// }

// // 🔒 Ownership validation
// if (item.vendor.toString() !== vendorId.toString()) {
// 	return res.status(403).json({
// 		success: false,
// 		message: "You can only update your own items",
// 	});
// }

// // ==============================
// // ✅ Validate Linked Listing
// // ==============================
// let listingDetails = null;
// if (linkedListing) {
// 	const listing = await Listing.findById(linkedListing);
// 	if (!listing) {
// 		return res.status(404).json({
// 			success: false,
// 			message: "Linked listing not found",
// 		});
// 	}
// 	if (listing.vendor.toString() !== vendorId.toString()) {
// 		return res.status(403).json({
// 			success: false,
// 			message: "You can only link items to your own listings",
// 		});
// 	}

// 	listingDetails = {
// 		id: listing._id,
// 		title: listing.title,
// 	};
// }

// // ==============================
// // ✅ Validate Categories
// // ==============================
// console.log(item, "itemitem");

// let mainCategoryName = item.mainCategoryName;
// let subCategoryName = item.subCategoryName;

// if (mainCategory && mainCategory !== item.mainCategory?.toString()) {
// 	const category = await Category.findById(mainCategory);
// 	if (!category) {
// 		return res.status(404).json({
// 			success: false,
// 			message: "Main category not found",
// 		});
// 	}
// 	if (category?.name?.en) mainCategoryName = category.name.en;
// }

// if (subCategory && subCategory !== item.subCategory?.toString()) {
// 	const subCat = await SubCategory.findById(subCategory);
// 	if (!subCat) {
// 		return res.status(404).json({
// 			success: false,
// 			message: "Sub category not found",
// 		});
// 	}
// 	if (subCat?.name?.en) subCategoryName = subCat.name.en;
// }

// // ==============================
// // ✅ Update all editable fields
// // ==============================
// if (title) item.title = toMultilingualText(title);
// if (mainCategory !== undefined) {
// 	item.mainCategory = mainCategory || null;
// 	item.mainCategoryName = mainCategoryName || "";
// }
// if (subCategory !== undefined) {
// 	item.subCategory = subCategory || null;
// 	item.subCategoryName = subCategoryName || "";
// }
// if (purchasePrice !== undefined)
// 	item.purchasePrice = Number(purchasePrice) || 0;
// if (sellingPrice !== undefined)
// 	item.sellingPrice = Number(sellingPrice) || 0;
// if (stockQuantity !== undefined)
// 	item.stockQuantity = Number(stockQuantity) || 0;
// if (image !== undefined) item.image = image;
// if (linkedListing !== undefined) item.linkedListing = linkedListing || null;

// // ✅ Save updates
// await item.save();

// // ✅ Optionally populate related fields
// const updatedItem = await ServiceItem.findById(item._id)
// 	.populate("mainCategory")
// 	.populate("subCategory")
// 	.populate("linkedListing");



// Delete item completely from database
const deleteItem = async (req, res) => {
	try {
		// Validate vendor session
		if (!req.user || !req.user.vendorId) {
			return res.status(401).json({
				success: false,
				message: 'Vendor authentication required'
			});
		}

		const { itemId } = req.params;
		const vendorId = req.user.id;

		// Find the item and verify ownership
		const item = await Item.findById(itemId);
		if (!item) {
			return res.status(404).json({
				success: false,
				message: 'Item not found'
			});
		}

		if (item.vendor.toString() !== vendorId) {
			return res.status(403).json({
				success: false,
				message: 'You can only delete your own items'
			});
		}

		// Check if item is linked to any active purchases
		const activePurchases = await Purchase.find({
			itemId: itemId,
			status: { $in: ['pending', 'confirmed', 'in_progress'] }
		});

		if (activePurchases.length > 0) {
			return res.status(400).json({
				success: false,
				message: 'Cannot delete item with active purchases',
				activePurchases: activePurchases.length
			});
		}

		// Delete the item from database
		await Item.findByIdAndDelete(itemId);

		return res.status(200).json({
			success: true,
			message: 'Item deleted successfully',
			deletedItemId: itemId
		});
	} catch (error) {
		return res.status(500).json({
			success: false,
			message: error.message
		});
	}
};

module.exports = {
	createItem,
	getVendorItems,
	updateItem,
	updateItemListing,
	removeItemListing,
	deleteItem,
	getVendorItemsOverview,
	itemDetailById
};