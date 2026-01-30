// Vendor Profile Controller
const Vendor = require("../../models/Vendor");
const User = require("../../models/User");
const Category = require("../../models/Category");
const SubCategory = require("../../models/SubCategory");
const { toMultilingualText } = require("../../utils/textUtils");
const mongoose = require("mongoose");
const { successHelper } = require("../../utils/jwtUtils");
// Get vendor profile (fields depend on account type)
const getProfile = async (req, res) => {
  try {
    // Find the vendor document for the logged-in user and populate userId
    const vendor = await Vendor.findOne({ userId: req.user.id })
      .populate("userId")
      .populate({ path: "mainCategories", select: "name" })
      .populate({ path: "subCategories", select: "name mainCategory" });
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    console.log(vendor, "vendorvendorvendor");

    // Assume account type is determined by businessName: if present, business; else, personal
    const isBusiness = vendor.accountType === "business";
    let profile = {};
    const mappedMainCategories = (vendor.mainCategories || []).map((c) => ({
      _id: c._id,
      name: c.name,
    }));
    const mappedSubCategories = (vendor.subCategories || []).map((sc) => ({
      _id: sc._id,
      name: sc.name,
      mainCategory: sc.mainCategory,
    }));
    if (isBusiness) {
      // Map categories into a cleaner shape
      const mappedMainCategories = (vendor.mainCategories || []).map((c) => ({
        _id: c._id,
        name: c.name,
      }));
      const mappedSubCategories = (vendor.subCategories || []).map((sc) => ({
        _id: sc._id,
        name: sc.name,
        mainCategory: sc.mainCategory,
      }));
      profile = {
        accountType: "business",
        businessName: vendor.businessName,
        businessEmail: vendor.businessEmail,
        businessPhone: vendor.businessPhone,
        businessAddress: vendor.businessAddress,
        businessWebsite: vendor.businessWebsite,
        businessLocation: vendor.businessLocation,
        businessLogo: vendor.businessLogo,
        businessImage: vendor.businessImage,
        description: vendor.description,
        teamType: vendor.teamType,
        teamSize: vendor.teamSize,
        kvkNumber: vendor.kvkNumber || "",
        mainCategories: mappedMainCategories,
        subCategories: mappedSubCategories,
        tagline: vendor.tagline,
        deliveryCharges: vendor.userId.deliveryCharges,
      };
    } else {
      profile = {
        accountType: "personal",
        firstName: vendor.userId.firstName,
        lastName: vendor.userId.lastName,
        email: vendor.userId.email,
        contactNumber: vendor.userId.contactNumber,
        address: vendor.userId.address,
        businessLogo: vendor.businessLogo,
        businessImage: vendor.businessImage,
        passportNumber: vendor.userId.passportDetails || "",
        postalCode: vendor.userId.postalCode || "",
        city: vendor.userId.city || "",
        mainCategories: mappedMainCategories,
        subCategories: mappedSubCategories,
        tagline: vendor.tagline,
        description: vendor.description,
        deliveryCharges: vendor.userId.deliveryCharges,
      };
    }
    return res.json(profile);
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// Update vendor profile (fields depend on account type)
const updateProfile = async (req, res) => {
  try {
    const updatedData = await User.findOneAndUpdate(
      { _id: req.user.id },
      req.body,
      {
        new: true,
      }
    );

    // Populate userId so user.save works for personal accounts
    // const vendor = await Vendor.findOne({ userId: req.user.id }).populate('userId');
    // if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    // const isBusiness = !!vendor.businessName;
    // const requestedAccountType = req.body.accountType;
    // const desiredAccountType = (requestedAccountType === 'business' || requestedAccountType === 'personal')
    //   ? requestedAccountType
    //   : (vendor?.userId?.accountType || (isBusiness ? 'business' : 'personal'));

    // // Shared helper to update categories / subcategories if supplied
    // const updateCategoriesIfProvided = async () => {
    //   const { mainCategories, subCategories } = req.body;

    //   // Only process if at least one of them is provided
    //   if (mainCategories === undefined && subCategories === undefined) return;

    //   // Validate types
    //   if (mainCategories !== undefined && !Array.isArray(mainCategories)) {
    //     return res.status(400).json({ message: 'mainCategories must be an array of category IDs' });
    //   }
    //   if (subCategories !== undefined && !Array.isArray(subCategories)) {
    //     return res.status(400).json({ message: 'subCategories must be an array of subCategory IDs' });
    //   }

    //   // Fetch & validate main categories
    //   let validMainCategoryIds = vendor.mainCategories.map(id => id.toString());
    //   if (Array.isArray(mainCategories)) {
    //     // Remove duplicates
    //     const uniqueMain = [...new Set(mainCategories.map(String))];
    //     const foundMain = await Category.find({ _id: { $in: uniqueMain }, isActive: true }).select('_id');
    //     if (foundMain.length !== uniqueMain.length) {
    //       const foundIds = new Set(foundMain.map(c => c._id.toString()));
    //       const missing = uniqueMain.filter(id => !foundIds.has(id));
    //       return res.status(400).json({ message: 'Some main categories not found or inactive', missing });
    //     }
    //     validMainCategoryIds = uniqueMain; // Replace vendor main categories fully (idempotent replace strategy)
    //   }

    //   // Fetch & validate sub categories
    //   if (Array.isArray(subCategories)) {
    //     const uniqueSubs = [...new Set(subCategories.map(String))];
    //     const foundSubs = await SubCategory.find({ _id: { $in: uniqueSubs }, isActive: true })
    //       .select('_id mainCategory');
    //     if (foundSubs.length !== uniqueSubs.length) {
    //       const foundIds = new Set(foundSubs.map(s => s._id.toString()));
    //       const missing = uniqueSubs.filter(id => !foundIds.has(id));
    //       return res.status(400).json({ message: 'Some subCategories not found or inactive', missing });
    //     }
    //     // Ensure every subcategory belongs to one of the provided (or existing) main categories
    //     const allowedMainSet = new Set(validMainCategoryIds);
    //     const invalidRelations = foundSubs.filter(s => !allowedMainSet.has(s.mainCategory.toString()));
    //     if (invalidRelations.length) {
    //       return res.status(400).json({
    //         message: 'SubCategory does not belong to one of the specified mainCategories',
    //         invalid: invalidRelations.map(s => ({ subCategoryId: s._id, mainCategory: s.mainCategory }))
    //       });
    //     }
    //     // Passed validation -> assign
    //     vendor.subCategories = uniqueSubs;
    //   } else if (mainCategories !== undefined && subCategories === undefined) {
    //     // If only mainCategories updated, remove subCategories that no longer align
    //     vendor.subCategories = vendor.subCategories.filter(subId => vendor.subCategories.includes(subId));
    //   }

    //   vendor.mainCategories = validMainCategoryIds;
    // };

    // if (isBusiness) {
    //   // Update business fields
    //   const scalarFields = [
    //     'businessEmail', 'businessPhone', 'businessAddress',
    //     'businessWebsite', 'businessLocation', 'businessLogo', 'bannerImage',
    //     'teamSize'
    //   ];
    //   scalarFields.forEach(field => {
    //     if (req.body[field] !== undefined) vendor[field] = req.body[field];
    //   });

    //   // Normalize multilingual fields using utility
    //   const multilingualFields = ['businessName', 'businessDescription', 'teamType', 'whyChooseUs'];
    //   multilingualFields.forEach(field => {
    //     if (req.body[field] !== undefined) {
    //       vendor[field] = toMultilingualText(req.body[field]);
    //     }
    //   });
    //   // Update User model fields without triggering validators (accountType/kvkNumber)
    //   const userUpdates = {};
    //   if (requestedAccountType === 'business' || requestedAccountType === 'personal' || !vendor.userId.accountType) {
    //     userUpdates.accountType = desiredAccountType;
    //   }
    //   if (req.body.kvkNumber !== undefined) {
    //     userUpdates.kvkNumber = req.body.kvkNumber;
    //   }
    //   if (Object.keys(userUpdates).length > 0) {
    //     await User.findByIdAndUpdate(vendor.userId._id, { $set: userUpdates }, { new: true, runValidators: false });
    //   }
    //   // Handle gallery update if provided
    //   if (req.body.gallery !== undefined) {
    //     if (Array.isArray(req.body.gallery)) {
    //       vendor.gallery = {
    //         ...vendor.gallery,
    //         workImages: req.body.gallery
    //       };
    //     } else if (typeof req.body.gallery === 'object' && req.body.gallery !== null && !Array.isArray(req.body.gallery)) {
    //       vendor.gallery = {
    //         ...vendor.gallery,
    //         ...req.body.gallery
    //       };
    //     } else {
    //       console.error('Invalid gallery type:', req.body.gallery);
    //       return res.status(400).json({ message: 'Invalid gallery format. Must be an object or array.' });
    //     }
    //   }
    //   // Category handling
    //   await updateCategoriesIfProvided();
    //   await vendor.save();
    //   return res.json({ message: 'Business profile updated successfully' });
    // } else {
    //   // Update personal fields in User model (without validators) and save vendor
    //   const personalUserUpdates = {};
    //   const fields = ['firstName', 'lastName', 'email', 'contactNumber', 'address', 'profileImage'];
    //   fields.forEach(field => {
    //     if (req.body[field] !== undefined) personalUserUpdates[field] = req.body[field];
    //   });
    //   if (requestedAccountType === 'business' || requestedAccountType === 'personal' || !vendor.userId.accountType) {
    //     personalUserUpdates.accountType = desiredAccountType;
    //   }
    //   if (req.body.passportNumber !== undefined) {
    //     personalUserUpdates.passportNumber = req.body.passportNumber;
    //   }
    //   // Allow personal vendors also to manage categories if needed
    //   await updateCategoriesIfProvided();
    //   if (Object.keys(personalUserUpdates).length > 0) {
    //     await User.findByIdAndUpdate(vendor.userId._id, { $set: personalUserUpdates }, { new: true, runValidators: false });
    //   }
    //   await vendor.save();
    return res.json({
      data: updatedData,
      message: "Personal profile updated successfully",
    });
    // }
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

const updateDeliveryCharges = async (req, res) => {
  try {
    const updatedData = await User.findOneAndUpdate(
      { _id: req.user.id },
      req.body,
      {
        new: true,
      }
    );
    return res.json({
      data: updatedData,
      message: "Personal profile updated successfully",
    });
  } catch (err) {
    errorHelper(res, err);
  }
};

const getMainCategoriesbyVendorId = async (req, res) => {
  try {
    const { vendorId } = req.params;

    const data = await Vendor.find({ userId: vendorId })
      .select("mainCategories subCategories")
      .populate("mainCategories", "name") // only get category name
      .populate("subCategories", "name"); // only get category name

    successHelper(res, data, "categories fetch successfully");
  } catch (error) {
    errorHelper(res, error);
  }
};

const subCategoryFromCategory = async (req, res) => {
  const { categoryIds } = req.body;
  console.log(categoryIds, "categoryIdscategoryIdscategoryIdscategoryIds");

  if (!categoryIds || !Array.isArray(categoryIds) || categoryIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: "categoryIds must be an array of IDs",
    });
  }

  // Convert to ObjectIds
  const objectIds = categoryIds.map((id) => new mongoose.Types.ObjectId(id));
  console.log(objectIds, "objectIdsobjectIdsobjectIds");

  const data = await Category.aggregate([
    { $match: { _id: { $in: objectIds } } },

    {
      $lookup: {
        from: "subcategories", // collection name in DB (plural lowercase!)
        localField: "_id",
        foreignField: "mainCategory",
        as: "subcategories",
      },
    },
    {
      $project: {
        name: "$name", // return English category name
        subcategories: {
          _id: 1,
          name: 1,
          icon: 1,
          isActive: 1,
        },
      },
    },
  ]);

  return res.status(200).json({
    success: true,
    data,
    message: "Categories with subcategories fetched successfully",
  });
};

module.exports = {
  getProfile,
  updateProfile,
  subCategoryFromCategory,
  getMainCategoriesbyVendorId,
  updateDeliveryCharges,
};
