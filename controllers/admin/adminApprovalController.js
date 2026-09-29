const mongoose = require("mongoose");
const User = require("../../models/User");
const Vendor = require("../../models/Vendor");
const Listing = require("../../models/Listing");

const {
  getApprovalSettings,
  getLiveVendorUserIds,
  VENDOR_VISIBLE_LISTING_STATES,
} = require("../../utils/getApprovalSettings");
const { toMultilingualText } = require("../../utils/textUtils");
const approvalNotifications = require("../../utils/approvalNotifications");
const Settings = require("../../models/Settings");

const getAdminApprovalVendors = async (req, res) => {
  try {
    const { page = 1, limit = 10, status = "all", search = "" } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);

    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);

    const skip = (pageNum - 1) * limitNum;

    // -----------------------------------------
    // 1. Validate status filter
    //
    // There is no vendor approval state any more. A vendor is publicly
    // visible as soon as it owns at least one approved listing, so the filter
    // below is derived from the vendor's listings:
    //   approved -> live on the public site
    //   pending  -> has listings, but none approved yet
    //   rejected -> nothing approved and at least one rejection
    // -----------------------------------------
    const allowedStatuses = ["all", "pending", "approved", "rejected"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: {
          en: "Invalid vendor approval status.",
          nl: "Ongeldige goedkeuringsstatus van leverancier.",
        },
      });
    }

    // -----------------------------------------
    // 2. Build User query
    // -----------------------------------------
    const userQuery = {
      userType: "vendor",
    };

    if (search.trim()) {
      userQuery.$or = [
        {
          email: {
            $regex: search.trim(),
            $options: "i",
          },
        },
        {
          firstName: {
            $regex: search.trim(),
            $options: "i",
          },
        },
        {
          lastName: {
            $regex: search.trim(),
            $options: "i",
          },
        },
      ];
    }

    // -----------------------------------------
    // 3. Search matching User records
    // -----------------------------------------
    let matchingUserIds = null;

    if (search.trim()) {
      const matchingUsers = await User.find(userQuery).select("_id").lean();

      matchingUserIds = matchingUsers.map((user) => user._id);
    }

    // -----------------------------------------
    // 4. Build Vendor query
    // Business name lives in Vendor
    // -----------------------------------------
    const vendorQuery = {};

    if (matchingUserIds !== null) {
      vendorQuery.$or = [
        {
          userId: {
            $in: matchingUserIds,
          },
        },
        {
          businessName: {
            $regex: search.trim(),
            $options: "i",
          },
        },
        {
          businessEmail: {
            $regex: search.trim(),
            $options: "i",
          },
        },
      ];
    }

    // -----------------------------------------
    // 5. Get vendors
    // -----------------------------------------
    let vendors = await Vendor.find(vendorQuery)
      .populate({
        path: "userId",
        match: userQuery,
        select:
          "_id email contactNumber accountType userType isActive createdAt",
      })
      .populate("mainCategories", "name")
      .populate("subCategories", "name")
      .sort({ createdAt: -1 })
      .lean();

    // populate(match) does not remove parent Vendor.
    // Remove vendors whose User didn't match.
    vendors = vendors.filter((vendor) => vendor.userId);

    // -----------------------------------------
    // 5b. Derive visibility from listings
    //
    // The Admin queue keeps showing every vendor, including the ones that are
    // not public yet, otherwise a pending vendor could never be approved.
    // The status filter and the "isLive" flag are computed from the vendor's
    // own listings.
    // -----------------------------------------
    const [liveVendorUserIds, vendorsWithListings, vendorsWithRejections] =
      await Promise.all([
        getLiveVendorUserIds(),
        Listing.distinct("vendor", {}),
        Listing.distinct("vendor", { approvalStatus: "rejected" }),
      ]);

    const liveUserIdSet = new Set(liveVendorUserIds.map(String));
    const listedUserIdSet = new Set(vendorsWithListings.map(String));
    const rejectedUserIdSet = new Set(vendorsWithRejections.map(String));

    const isVendorLive = (vendor) =>
      liveUserIdSet.has(String(vendor.userId?._id));

    const visibilityState = (vendor) => {
      const userId = String(vendor.userId?._id);

      if (liveUserIdSet.has(userId)) return "approved";
      if (rejectedUserIdSet.has(userId)) return "rejected";
      if (listedUserIdSet.has(userId)) return "pending";
      return "pending";
    };

    if (status !== "all") {
      vendors = vendors.filter((vendor) => visibilityState(vendor) === status);
    }

    // -----------------------------------------
    // 6. Pagination
    // -----------------------------------------
    const total = vendors.length;

    const paginatedVendors = vendors.slice(skip, skip + limitNum);

    // -----------------------------------------
    // 7. Get listings for page vendors
    // -----------------------------------------
    const vendorUserIds = paginatedVendors
      .map((vendor) => vendor.userId?._id)
      .filter(Boolean);

    const listings = await Listing.find({
      vendor: {
        $in: vendorUserIds,
      },
    })
      .select(
        `
        vendor
        title
        images
        category
        subCategory
        status
        approvalStatus
        rejectionReason
        submittedForReviewAt
        reviewedAt
        createdAt
        updatedAt
      `,
      )
      .populate("category", "name")
      .populate("subCategory", "name")
      .sort({ updatedAt: -1 })
      .lean();

    // -----------------------------------------
    // 8. Group listings by vendor User ID
    // -----------------------------------------
    const listingMap = {};

    for (const listing of listings) {
      const key = listing.vendor.toString();

      if (!listingMap[key]) {
        listingMap[key] = [];
      }

      listingMap[key].push(listing);
    }

    // -----------------------------------------
    // 9. Format response
    // -----------------------------------------
    const data = paginatedVendors.map((vendor) => {
      const user = vendor.userId;

      const vendorListings = listingMap[user._id.toString()] || [];

      const listingStats = {
        total: vendorListings.length,
        pending: 0,
        approved: 0,
        rejected: 0,
        edited: 0,
      };

      for (const listing of vendorListings) {
        if (
          Object.prototype.hasOwnProperty.call(
            listingStats,
            listing.approvalStatus,
          )
        ) {
          listingStats[listing.approvalStatus]++;
        }
      }

      return {
        vendorId: vendor._id,
        userId: user._id,

        businessName: vendor.businessName,
        businessEmail: vendor.businessEmail,
        businessPhone: vendor.businessPhone,
        businessLogo: vendor.businessLogo,
        businessLocation: vendor.businessLocation,

        accountType: user.accountType,
        email: user.email,
        isActive: user.isActive,

        // Derived from the vendor's own listings: a vendor is publicly
        // visible as soon as it has at least one approved listing.
        isLive: isVendorLive(vendor),
        approvalStatus: visibilityState(vendor),

        mainCategories: vendor.mainCategories || [],

        subCategories: vendor.subCategories || [],

        listingStats,

        // Small listing data for expandable Admin row
        listings: vendorListings,
      };
    });

    return res.status(200).json({
      success: true,
      data,

      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        total,
        limit: limitNum,
      },
    });
  } catch (error) {
    console.error("Error fetching admin approval vendors:", error);

    return res.status(500).json({
      success: false,
      message: {
        en: "Unable to load vendor approvals.",
        nl: "Kan leveranciersgoedkeuringen niet laden.",
      },
      error: error.message,
    });
  }
};

const getAdminApprovalVendorById = async (req, res) => {
  try {
    const { vendorId } = req.params;

    // -----------------------------------------
    // 1. Validate ID
    // -----------------------------------------
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({
        success: false,
        message: {
          en: "Invalid vendor ID.",
          nl: "Ongeldige leveranciers-ID.",
        },
      });
    }

    // -----------------------------------------
    // 2. Get vendor + User
    // -----------------------------------------
    const vendor = await Vendor.findById(vendorId)
      .populate({
        path: "userId",
        select: `
          _id
          email
          contactNumber
          accountType
          userType
          isActive
          stripeOnboardingComplete
          createdAt
        `,
      })
      .populate("mainCategories", "name icon description")
      .populate("subCategories", "name icon description mainCategory")
      .lean();

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: {
          en: "Vendor not found.",
          nl: "Leverancier niet gevonden.",
        },
      });
    }

    // Extra protection
    if (!vendor.userId || vendor.userId.userType !== "vendor") {
      return res.status(404).json({
        success: false,
        message: {
          en: "Vendor account not found.",
          nl: "Leveranciersaccount niet gevonden.",
        },
      });
    }

    // -----------------------------------------
    // 3. Get all listings belonging to vendor
    // Listing.vendor references User
    // -----------------------------------------
    const listings = await Listing.find({
      vendor: vendor.userId._id,
    })
      .populate("category", "name icon description")
      .populate("subCategory", "name icon description")
      .populate("reviewedBy", "firstName lastName email")
      .populate(
        "approvalHistory.changedBy",
        "firstName lastName email userType",
      )
      .sort({ updatedAt: -1 })
      .lean();

    // -----------------------------------------
    // 4. Listing statistics
    // -----------------------------------------
    const listingStats = {
      total: listings.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      edited: 0,
    };

    for (const listing of listings) {
      if (
        Object.prototype.hasOwnProperty.call(
          listingStats,
          listing.approvalStatus,
        )
      ) {
        listingStats[listing.approvalStatus]++;
      }
    }

    // -----------------------------------------
    // Visibility is derived from the vendor's own listings: it is publicly
    // visible as soon as it owns at least one approved listing.
    // -----------------------------------------
    const vendorIsLive = listings.some((listing) =>
      VENDOR_VISIBLE_LISTING_STATES.includes(listing.approvalStatus),
    );

    // -----------------------------------------
    // 5. Onboarding progress
    //
    // Current 4 steps:
    // registration
    // categories
    // first listing
    // Stripe
    // -----------------------------------------
    const registrationCompleted = true;

    const categoriesCompleted =
      Array.isArray(vendor.mainCategories) &&
      vendor.mainCategories.length > 0 &&
      Array.isArray(vendor.subCategories) &&
      vendor.subCategories.length > 0;

    const firstItemCompleted = listings.length > 0;

    const stripeCompleted = vendor.userId.stripeOnboardingComplete === true;

    const onboardingSteps = [
      {
        key: "registration",
        completed: registrationCompleted,
        weight: 25,
      },
      {
        key: "categories",
        completed: categoriesCompleted,
        weight: 25,
      },
      {
        key: "firstItem",
        completed: firstItemCompleted,
        weight: 25,
      },
      {
        key: "stripe",
        completed: stripeCompleted,
        weight: 25,
      },
    ];

    const onboardingProgress = onboardingSteps.reduce(
      (total, step) => (step.completed ? total + step.weight : total),
      0,
    );

    // -----------------------------------------
    // 6. Response
    // -----------------------------------------
    return res.status(200).json({
      success: true,

      data: {
        vendor: {
          vendorId: vendor._id,
          userId: vendor.userId._id,

          businessName: vendor.businessName,

          businessEmail: vendor.businessEmail,

          businessPhone: vendor.businessPhone,

          businessWebsite: vendor.businessWebsite,

          businessLocation: vendor.businessLocation,

          businessLogo: vendor.businessLogo,

          businessImage: vendor.businessImage,

          tagline: vendor.tagline,
          description: vendor.description,

          accountType: vendor.userId.accountType,

          email: vendor.userId.email,

          contactNumber: vendor.userId.contactNumber,

          isActive: vendor.userId.isActive,

          stripeOnboardingComplete: vendor.userId.stripeOnboardingComplete,

          // Derived from the vendor's own listings, not from a stored
          // approval flag: a vendor is publicly visible as soon as it owns at
          // least one approved listing.
          isLive: vendorIsLive,
          approvalStatus: vendorIsLive ? "approved" : "pending",

          createdAt: vendor.createdAt,

          mainCategories: vendor.mainCategories || [],

          subCategories: vendor.subCategories || [],
        },

        onboarding: {
          overallProgress: onboardingProgress,

          isComplete: onboardingProgress === 100,

          steps: onboardingSteps,
        },

        listingStats,

        listings,
      },
    });
  } catch (error) {
    console.error("Error fetching admin vendor detail:", error);

    return res.status(500).json({
      success: false,
      message: {
        en: "Unable to load vendor details.",
        nl: "Kan leveranciersgegevens niet laden.",
      },
      error: error.message,
    });
  }
};

// @desc    Get all listings for Admin approval module
// @route   GET /api/admin/approvals/listings
// @access  Admin

const getAdminApprovalListings = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status = "all",
      search = "",
      vendorId,
      vendorName = "",
      categoryId,
      subCategoryId,
      sortBy = "submittedForReviewAt",
      sortOrder = "desc",
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(
      Math.max(parseInt(limit, 10) || 10, 1),
      100,
    );

    const skip = (pageNum - 1) * limitNum;

    // -----------------------------------------
    // 1. Validate approval status
    // -----------------------------------------

    const allowedStatuses = [
      "all",
      "pending",
      "approved",
      "rejected",
      "edited",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_APPROVAL_STATUS",
        message: {
          en: "Invalid listing approval status.",
          nl: "Ongeldige goedkeuringsstatus van advertentie.",
        },
      });
    }

    // -----------------------------------------
    // 2. Build listing query
    // -----------------------------------------

    const query = {};

    if (status !== "all") {
      query.approvalStatus = status;
    }

    /*
     * Vendor filtering. Supports:
     *   vendorId   -> Vendor._id (resolved to the Vendor's User id)
     *   vendorName -> free-text match on Vendor.businessName
     *
     * Both are combined with AND. Listing.vendor references User._id,
     * so every filter is resolved to a set of User ids first.
     */
    let vendorUserIds = null;

    if (vendorId) {
      if (!mongoose.Types.ObjectId.isValid(vendorId)) {
        return res.status(400).json({
          success: false,
          code: "INVALID_VENDOR_ID",
          message: {
            en: "Invalid vendor ID.",
            nl: "Ongeldige leveranciers-ID.",
          },
        });
      }

      const vendor = await Vendor.findById(vendorId)
        .select("userId")
        .lean();

      if (!vendor) {
        return res.status(404).json({
          success: false,
          code: "VENDOR_NOT_FOUND",
          message: {
            en: "Vendor not found.",
            nl: "Leverancier niet gevonden.",
          },
        });
      }

      vendorUserIds = [vendor.userId];
    }

    if (vendorName.trim()) {
      const matchingVendors = await Vendor.find({
        businessName: {
          $regex: vendorName.trim(),
          $options: "i",
        },
      })
        .select("userId")
        .lean();

      const nameMatchUserIds = matchingVendors
        .map((vendor) => vendor.userId)
        .filter(Boolean);

      if (vendorUserIds === null) {
        vendorUserIds = nameMatchUserIds;
      } else {
        const existing = new Set(
          vendorUserIds.map((id) => id.toString()),
        );

        vendorUserIds = nameMatchUserIds.filter((id) =>
          existing.has(id.toString()),
        );
      }
    }

    if (vendorUserIds !== null) {
      query.vendor = {
        $in: vendorUserIds,
      };
    }

    if (categoryId) {
      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return res.status(400).json({
          success: false,
          code: "INVALID_CATEGORY_ID",
          message: {
            en: "Invalid category ID.",
            nl: "Ongeldige categorie-ID.",
          },
        });
      }

      query.category = categoryId;
    }

    if (subCategoryId) {
      if (!mongoose.Types.ObjectId.isValid(subCategoryId)) {
        return res.status(400).json({
          success: false,
          code: "INVALID_SUBCATEGORY_ID",
          message: {
            en: "Invalid subcategory ID.",
            nl: "Ongeldige subcategorie-ID.",
          },
        });
      }

      query.subCategory = subCategoryId;
    }

    // -----------------------------------------
    // 3. Search
    //
    // Search listing title + vendor information.
    // -----------------------------------------

    const searchValue = search.trim();

    if (searchValue) {
      /*
       * Find matching vendor users from Vendor business information.
       */

      const matchingVendorProfiles = await Vendor.find({
        $or: [
          {
            businessName: {
              $regex: searchValue,
              $options: "i",
            },
          },
          {
            businessEmail: {
              $regex: searchValue,
              $options: "i",
            },
          },
        ],
      })
        .select("userId")
        .lean();

      const matchingVendorUserIds = matchingVendorProfiles
        .map((vendor) => vendor.userId)
        .filter(Boolean);

      /*
       * Also support searching User email/name.
       */

      const matchingUsers = await User.find({
        userType: "vendor",
        $or: [
          {
            email: {
              $regex: searchValue,
              $options: "i",
            },
          },
          {
            firstName: {
              $regex: searchValue,
              $options: "i",
            },
          },
          {
            lastName: {
              $regex: searchValue,
              $options: "i",
            },
          },
        ],
      })
        .select("_id")
        .lean();

      matchingUsers.forEach((user) => {
        matchingVendorUserIds.push(user._id);
      });

      /*
       * title is multilingual:
       * title.en
       * title.nl
       */

      query.$or = [
        {
          "title.en": {
            $regex: searchValue,
            $options: "i",
          },
        },
        {
          "title.nl": {
            $regex: searchValue,
            $options: "i",
          },
        },
        {
          vendor: {
            $in: matchingVendorUserIds,
          },
        },
      ];
    }

    // -----------------------------------------
    // 4. Sorting
    // -----------------------------------------

    const allowedSortFields = [
      "submittedForReviewAt",
      "createdAt",
      "updatedAt",
      "approvalStatus",
      "title.en",
    ];

    const finalSortBy = allowedSortFields.includes(sortBy)
      ? sortBy
      : "submittedForReviewAt";

    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const sortOptions = {
      [finalSortBy]: sortDirection,

      // Stable pagination
      _id: 1,
    };

    // -----------------------------------------
    // 5. Fetch listings
    // -----------------------------------------

    const [listings, total] = await Promise.all([
      Listing.find(query)
        .select(`
          title
          subtitle
          images
          vendor
          category
          subCategory
          pricing
          status
          isActive
          approvalStatus
          rejectionReason
          submittedForReviewAt
          reviewedAt
          reviewedBy
          approvalHistory
          createdAt
          updatedAt
        `)
        .populate(
          "vendor",
          "_id firstName lastName email contactNumber accountType userType isActive approvalStatus",
        )
        .populate("category", "name icon description")
        .populate("subCategory", "name icon description")
        .populate("reviewedBy", "firstName lastName email")
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .lean(),

      Listing.countDocuments(query),
    ]);

    // -----------------------------------------
    // 6. Resolve Vendor profiles
    // -----------------------------------------

    const listingVendorUserIds = listings
      .map((listing) => listing.vendor?._id)
      .filter(Boolean);

    const vendorProfiles = await Vendor.find({
      userId: {
        $in: listingVendorUserIds,
      },
    })
      .select(`
        _id
        userId
        businessName
        businessEmail
        businessPhone
        businessLogo
        businessLocation
      `)
      .lean();

    const vendorMap = {};

    vendorProfiles.forEach((vendor) => {
      vendorMap[vendor.userId.toString()] = vendor;
    });

    // -----------------------------------------
    // 7. Format Admin table response
    // -----------------------------------------

    const data = listings.map((listing) => {
      const userId = listing.vendor?._id?.toString();

      const vendorProfile = userId
        ? vendorMap[userId]
        : null;

      const hasHistory =
        Array.isArray(listing.approvalHistory) &&
        listing.approvalHistory.length > 0;

      const hasPreviousRejection =
        Array.isArray(listing.approvalHistory) &&
        listing.approvalHistory.some(
          (history) => history.status === "rejected",
        );

      const hasPreviousEdit =
        Array.isArray(listing.approvalHistory) &&
        listing.approvalHistory.some(
          (history) => history.status === "edited",
        );

      return {
        listingId: listing._id,

        title: listing.title,
        subtitle: listing.subtitle,

        thumbnail:
          Array.isArray(listing.images) &&
          listing.images.length > 0
            ? listing.images[0]
            : "",

        vendor: {
          vendorId: vendorProfile?._id || null,
          userId: listing.vendor?._id || null,

          businessName:
            vendorProfile?.businessName || "",

          businessLogo:
            vendorProfile?.businessLogo || "",

          email:
            vendorProfile?.businessEmail ||
            listing.vendor?.email ||
            "",

          approvalStatus:
            listing.vendor?.approvalStatus ||
            "pending",
        },

        category: listing.category || null,
        subCategory: listing.subCategory || null,

        pricing: listing.pricing,

        status: listing.status,

        approvalStatus:
          listing.approvalStatus || "pending",

        rejectionReason:
          listing.rejectionReason || {
            en: "",
            nl: "",
          },

        submittedForReviewAt:
          listing.submittedForReviewAt,

        reviewedAt: listing.reviewedAt,

        reviewedBy: listing.reviewedBy,

        history: {
          hasHistory,
          hasPreviousRejection,
          hasPreviousEdit,
          count: Array.isArray(listing.approvalHistory)
            ? listing.approvalHistory.length
            : 0,
        },

        createdAt: listing.createdAt,
        updatedAt: listing.updatedAt,
      };
    });

    // -----------------------------------------
    // 8. Response
    // -----------------------------------------

    return res.status(200).json({
      success: true,

      data,

      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        total,
        limit: limitNum,
      },

      filters: {
        status,
        search: searchValue,
        vendorId: vendorId || "",
        vendorName: vendorName.trim() || "",
        categoryId: categoryId || "",
        subCategoryId: subCategoryId || "",
        sortBy: finalSortBy,
        sortOrder: sortDirection === 1 ? "asc" : "desc",
      },
    });
  } catch (error) {
    console.error(
      "Error fetching admin approval listings:",
      error,
    );

    return res.status(500).json({
      success: false,
      message: {
        en: "Unable to load listing approvals.",
        nl: "Kan advertentiegoedkeuringen niet laden.",
      },
      error: error.message,
    });
  }
};


// @desc    Get single listing for Admin review
// @route   GET /api/admin/approvals/listings/:listingId
// @access  Admin

const getAdminApprovalListingById = async (req, res) => {
  try {
    const { listingId } = req.params;

    // -----------------------------------------
    // 1. Validate ID
    // -----------------------------------------

    if (!mongoose.Types.ObjectId.isValid(listingId)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_LISTING_ID",
        message: {
          en: "Invalid listing ID.",
          nl: "Ongeldige advertentie-ID.",
        },
      });
    }

    // -----------------------------------------
    // 2. Get complete listing
    // -----------------------------------------

    const listing = await Listing.findById(listingId)
      .populate(
        "vendor",
        `
          _id
          firstName
          lastName
          email
          contactNumber
          accountType
          userType
          profileImage
          isActive
          approvalStatus
          stripeOnboardingComplete
        `,
      )
      .populate(
        "category",
        "name icon description",
      )
      .populate(
        "subCategory",
        `
          name
          icon
          description
          mainCategory
          isUpfrontEnabled
          upfrontFeePercent
          escrowHours
          isEvenlyoProtectEnabled
          evenlyoProtectFeePercent
        `,
      )
      .populate(
        "reviewedBy",
        "firstName lastName email",
      )
      .populate(
        "approvalHistory.changedBy",
        "firstName lastName email userType",
      )
      .lean();

    if (!listing) {
      return res.status(404).json({
        success: false,
        code: "LISTING_NOT_FOUND",
        message: {
          en: "Listing not found.",
          nl: "Advertentie niet gevonden.",
        },
      });
    }

    // -----------------------------------------
    // 3. Validate listing belongs to vendor
    // -----------------------------------------

    if (
      !listing.vendor ||
      listing.vendor.userType !== "vendor"
    ) {
      return res.status(404).json({
        success: false,
        code: "LISTING_VENDOR_NOT_FOUND",
        message: {
          en: "Vendor account for this listing was not found.",
          nl: "Het leveranciersaccount voor deze advertentie is niet gevonden.",
        },
      });
    }

    // -----------------------------------------
    // 4. Get Vendor profile
    //
    // Listing.vendor = User._id
    // Vendor.userId    = User._id
    // -----------------------------------------

    const vendor = await Vendor.findOne({
      userId: listing.vendor._id,
    })
      .populate(
        "mainCategories",
        "name icon description",
      )
      .populate(
        "subCategories",
        "name icon description mainCategory",
      )
      .lean();

    // -----------------------------------------
    // 5. Vendor listing statistics
    // -----------------------------------------

    const vendorListingStats = await Listing.aggregate([
      {
        $match: {
          vendor: listing.vendor._id,
        },
      },
      {
        $group: {
          _id: "$approvalStatus",
          count: {
            $sum: 1,
          },
        },
      },
    ]);

    const listingStats = {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      edited: 0,
    };

    vendorListingStats.forEach((item) => {
      listingStats.total += item.count;

      if (
        Object.prototype.hasOwnProperty.call(
          listingStats,
          item._id,
        )
      ) {
        listingStats[item._id] = item.count;
      }
    });

    // -----------------------------------------
    // 6. History information
    // -----------------------------------------

    const approvalHistory = Array.isArray(
      listing.approvalHistory,
    )
      ? listing.approvalHistory
      : [];

    const rejectionHistory =
      approvalHistory.filter(
        (history) =>
          history.status === "rejected",
      );

    const history = {
      hasHistory: approvalHistory.length > 0,

      hasPreviousRejection:
        rejectionHistory.length > 0,

      hasPreviousEdit:
        approvalHistory.some(
          (item) => item.status === "edited",
        ),

      totalEvents: approvalHistory.length,
    };

    // -----------------------------------------
    // 7. Approval settings
    // -----------------------------------------

    const approvalSettings =
      await getApprovalSettings();

    // -----------------------------------------
    // 8. Response
    // -----------------------------------------

    return res.status(200).json({
      success: true,

      data: {
        listing: {
          ...listing,

          approvalStatus:
            listing.approvalStatus || "pending",

          rejectionReason:
            listing.rejectionReason || {
              en: "",
              nl: "",
            },
        },

        vendor: vendor
          ? {
              vendorId: vendor._id,
              userId: listing.vendor._id,

              businessName:
                vendor.businessName,

              businessEmail:
                vendor.businessEmail,

              businessPhone:
                vendor.businessPhone,

              businessWebsite:
                vendor.businessWebsite,

              businessLocation:
                vendor.businessLocation,

              businessLogo:
                vendor.businessLogo,

              businessImage:
                vendor.businessImage,

              accountType:
                listing.vendor.accountType,

              email:
                listing.vendor.email,

              contactNumber:
                listing.vendor.contactNumber,

              isActive:
                listing.vendor.isActive,

              approvalStatus:
                listing.vendor.approvalStatus ||
                "pending",

              stripeOnboardingComplete:
                listing.vendor
                  .stripeOnboardingComplete ===
                true,

              mainCategories:
                vendor.mainCategories || [],

              subCategories:
                vendor.subCategories || [],
            }
          : null,

        listingStats,

        history,

        rejectionHistory,

        approvalSettings: {
          itemApprovalRequired:
            approvalSettings.itemApprovalRequired,
        },
      },
    });
  } catch (error) {
    console.error(
      "Error fetching admin listing detail:",
      error,
    );

    return res.status(500).json({
      success: false,
      message: {
        en: "Unable to load listing details.",
        nl: "Kan advertentiegegevens niet laden.",
      },
      error: error.message,
    });
  }
};
// @desc    Approve listing
// @route   PATCH /api/admin/approvals/listings/:listingId/approve
// @access  Admin

const approveListing = async (req, res) => {
  try {
    const { listingId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(listingId)) {
      return res.status(400).json({
        success: false,
        message: {
          en: "Invalid listing ID.",
          nl: "Ongeldige advertentie-ID.",
        },
      });
    }

    const approvalSettings = await getApprovalSettings();

    if (!approvalSettings.itemApprovalRequired) {
      return res.status(400).json({
        success: false,
        code: "ITEM_APPROVAL_DISABLED",
        message: {
          en: "Manual listing approval is currently disabled.",
          nl: "Handmatige goedkeuring van advertenties is momenteel uitgeschakeld.",
        },
      });
    }

    const listing = await Listing.findById(listingId);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: {
          en: "Listing not found.",
          nl: "Advertentie niet gevonden.",
        },
      });
    }

    if (listing.approvalStatus === "approved") {
      return res.status(400).json({
        success: false,
        code: "LISTING_ALREADY_APPROVED",
        message: {
          en: "Listing is already approved.",
          nl: "Advertentie is al goedgekeurd.",
        },
      });
    }

    const now = new Date();

    // Did the vendor already have a listing that made it publicly visible
    // BEFORE this approval? If not, this approval is what takes the vendor
    // live, and it is the only moment the Dutch approval email is sent.
    // "edited" counts as visible: a vendor that is already live must not
    // re-trigger the "you are now live" email just because another listing of
    // its is approved.
    const hadVisibleListingBefore = await Listing.exists({
      vendor: listing.vendor,
      _id: { $ne: listing._id },
      approvalStatus: { $in: VENDOR_VISIBLE_LISTING_STATES },
    });

    listing.approvalStatus = "approved";
    listing.rejectionReason = {
      en: "",
      nl: "",
    };
    listing.reviewedAt = now;
    listing.reviewedBy = req.user.id;

    listing.approvalHistory.push({
      status: "approved",

      reason: {
        en: "",
        nl: "",
      },

      changedBy: req.user.id,
      changedAt: now,
    });

    await listing.save();

    // -----------------------------------------
    // Vendor going live.
    //
    // There is no separate vendor approval state. A vendor is publicly
    // visible as soon as it owns at least one approved listing, so this
    // approval is what makes it visible whenever it had none before.
    // -----------------------------------------
    const vendorJustWentLive = !hadVisibleListingBefore;

    const vendorUser = await User.findOne({
      _id: listing.vendor,
      userType: "vendor",
    });

    const approveVendorProfile = await Vendor.findOne({
      userId: listing.vendor,
    })
      .select("businessName")
      .lean();

    // Vendor notification. The Dutch approval email is only sent when this
    // approval is what put the vendor live on the public site.
    await approvalNotifications.notifyVendorListingApproved({
      vendorUser,
      vendorProfile: approveVendorProfile,
      listing,
      vendorWentLive: vendorJustWentLive,
    });

    const populatedListing = await Listing.findById(listing._id)
      .populate("vendor", "_id email contactNumber accountType")
      .populate("category", "name icon description")
      .populate("subCategory", "name icon description")
      .populate("reviewedBy", "firstName lastName email");

    return res.status(200).json({
      success: true,
      message: {
        en: "Listing approved successfully.",
        nl: "Advertentie succesvol goedgekeurd.",
      },
      data: populatedListing,
    });
  } catch (error) {
    console.error("Error approving listing:", error);

    return res.status(500).json({
      success: false,
      message: {
        en: "Unable to approve listing.",
        nl: "Kan advertentie niet goedkeuren.",
      },
      error: error.message,
    });
  }
};

// @desc    Reject listing
// @route   PATCH /api/admin/approvals/listings/:listingId/reject
// @access  Admin

const rejectListing = async (req, res) => {
  try {
    const { listingId } = req.params;
    const { reason } = req.body;

    // -----------------------------------------
    // 1. Validate listing ID
    // -----------------------------------------
    if (!mongoose.Types.ObjectId.isValid(listingId)) {
      return res.status(400).json({
        success: false,
        message: {
          en: "Invalid listing ID.",
          nl: "Ongeldige advertentie-ID.",
        },
      });
    }

    // -----------------------------------------
    // 2. Get approval settings
    // -----------------------------------------
    const approvalSettings = await getApprovalSettings();

    if (!approvalSettings.itemApprovalRequired) {
      return res.status(400).json({
        success: false,
        code: "ITEM_APPROVAL_DISABLED",
        message: {
          en: "Manual listing approval is currently disabled.",
          nl: "Handmatige goedkeuring van advertenties is momenteel uitgeschakeld.",
        },
      });
    }

    // -----------------------------------------
    // 3. Normalize rejection reason
    // Supports:
    // reason: "..."
    // OR
    // reason: { en: "...", nl: "..." }
    // -----------------------------------------
    const multilingualReason = toMultilingualText(reason);

    const hasReason =
      multilingualReason.en.trim() || multilingualReason.nl.trim();

    if (!hasReason) {
      return res.status(400).json({
        success: false,
        code: "REJECTION_REASON_REQUIRED",
        message: {
          en: "A rejection reason is required.",
          nl: "Een reden voor afwijzing is vereist.",
        },
      });
    }

    // -----------------------------------------
    // 4. Find listing
    // -----------------------------------------
    const listing = await Listing.findById(listingId);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: {
          en: "Listing not found.",
          nl: "Advertentie niet gevonden.",
        },
      });
    }

    // -----------------------------------------
    // 5. Prevent duplicate rejection
    // -----------------------------------------
    if (listing.approvalStatus === "rejected") {
      return res.status(400).json({
        success: false,
        code: "LISTING_ALREADY_REJECTED",
        message: {
          en: "Listing is already rejected.",
          nl: "Advertentie is al afgewezen.",
        },
      });
    }

    // -----------------------------------------
    // 6. Prepare final reason
    // -----------------------------------------
    const finalReason = multilingualReason;

    const now = new Date();

    // -----------------------------------------
    // 7. Update approval state
    // -----------------------------------------
    listing.approvalStatus = "rejected";
    listing.rejectionReason = finalReason;
    listing.reviewedAt = now;
    listing.reviewedBy = req.user.id;

    // -----------------------------------------
    // 8. Add history
    // -----------------------------------------
    listing.approvalHistory.push({
      status: "rejected",
      reason: finalReason,
      changedBy: req.user.id,
      changedAt: now,
    });

    await listing.save();

    // -----------------------------------------
    // Notify vendor about the rejection (with reason).
    // -----------------------------------------
    const rejectVendorUser = await User.findOne({
      _id: listing.vendor,
      userType: "vendor",
    });

    // -----------------------------------------
    // Vendor going off the public site.
    //
    // There is no separate vendor rejection state. Visibility is derived
    // entirely from the vendor's listings, so rejecting the last visible
    // listing of a vendor takes it off the public site until another listing
    // is approved.
    //
    // "edited" counts as visible, so rejecting one listing never hides a
    // vendor that still has another listing keeping it on the site.
    // -----------------------------------------
    const vendorStillVisible = await Listing.exists({
      vendor: listing.vendor,
      _id: { $ne: listing._id },
      approvalStatus: { $in: VENDOR_VISIBLE_LISTING_STATES },
    });

    const vendorWentOffLive = !vendorStillVisible;

    const rejectVendorProfile = await Vendor.findOne({
      userId: listing.vendor,
    })
      .select("businessName")
      .lean();

    await approvalNotifications.notifyVendorListingRejected({
      vendorUser: rejectVendorUser,
      vendorProfile: rejectVendorProfile,
      listing,
      reason: finalReason,
      vendorWentOffLive,
    });

    // -----------------------------------------
    // 9. Populate response
    // -----------------------------------------
    const populatedListing = await Listing.findById(listing._id)
      .populate("vendor", "_id email contactNumber accountType")
      .populate("category", "name icon description")
      .populate("subCategory", "name icon description")
      .populate("reviewedBy", "firstName lastName email")
      .populate(
        "approvalHistory.changedBy",
        "firstName lastName email userType",
      );

    // -----------------------------------------
    // 10. Response
    // -----------------------------------------
    return res.status(200).json({
      success: true,

      message: {
        en: "Listing rejected successfully.",
        nl: "Advertentie succesvol afgewezen.",
      },

      data: populatedListing,
    });
  } catch (error) {
    console.error("Error rejecting listing:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: {
          en: "Invalid listing ID.",
          nl: "Ongeldige advertentie-ID.",
        },
      });
    }

    return res.status(500).json({
      success: false,
      message: {
        en: "Unable to reject listing.",
        nl: "Kan advertentie niet afwijzen.",
      },
      error: error.message,
    });
  }
};

// Is endpoint sy global approval flow get hoga

const getAdminApprovalSettings = async (req, res) => {
  try {
    const approvalSettings = await getApprovalSettings();

    return res.status(200).json({
      success: true,
      data: {
        approvalSettings,
      },
    });
  } catch (error) {
    console.error("Error fetching approval settings:", error);

    return res.status(500).json({
      success: false,
      message: {
        en: "Unable to load approval settings.",
        nl: "Kan goedkeuringsinstellingen niet laden.",
      },
      error: error.message,
    });
  }
};

const updateAdminApprovalSettings = async (req, res) => {
  try {
    const allowedFields = ["itemApprovalRequired"];

    const updates = {};

    // -----------------------------------------
    // 1. Validate input
    // -----------------------------------------
    // Accept both nested (`{ approvalSettings: { itemApprovalRequired: true } }`)
    // and flat (`{ itemApprovalRequired: true }`) payloads.
    const requestSettings = req.body.approvalSettings || req.body;

    for (const field of allowedFields) {
      if (requestSettings[field] !== undefined) {
        if (typeof requestSettings[field] !== "boolean") {
          return res.status(400).json({
            success: false,
            message: {
              en: `${field} must be a boolean value.`,
              nl: `${field} moet een booleaanse waarde zijn.`,
            },
          });
        }

        updates[`approvalSettings.${field}`] = requestSettings[field];
      }
    }

    // -----------------------------------------
    // 2. Make sure at least one valid field sent
    // -----------------------------------------
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        code: "NO_VALID_SETTINGS",
        message: {
          en: "No valid approval settings were provided.",
          nl: "Er zijn geen geldige goedkeuringsinstellingen opgegeven.",
        },
      });
    }

    // -----------------------------------------
    // 3. Get/create global Settings document
    // -----------------------------------------
    let settings = await Settings.findOne();

    if (!settings) {
      settings = await Settings.create({
        bookingItemPlatformFee: 0,
        salesItemPlatformFee: 0,
        vat: 0,
      });
    }

    // -----------------------------------------
    // 4. Update requested fields
    // -----------------------------------------
    const updatedSettings = await Settings.findByIdAndUpdate(
      settings._id,
      {
        $set: updates,
      },
      {
        new: true,
        runValidators: true,
      },
    ).select("approvalSettings");

    // -----------------------------------------
    // 5. Record who changed the toggle and when
    //
    // Append-only audit trail, one entry per actual value change. Writing the
    // same value again is a no-op and is not recorded. The history is
    // intentionally not exposed by the GET endpoint.
    // -----------------------------------------
    const field = Object.keys(updates)[0].split(".").pop();
    const newValue = updates[`approvalSettings.${field}`];
    const previousValue = settings.approvalSettings?.[field];

    const didValueChange = previousValue !== newValue;

    if (didValueChange) {
      await Settings.updateOne(
        { _id: settings._id },
        {
          $push: {
            approvalSettingsHistory: {
              [field]: newValue,
              previousValue: previousValue ?? null,
              changedBy: req.user.id,
              changedAt: new Date(),
            },
          },
        },
      );
    }

    return res.status(200).json({
      success: true,

      message: {
        en: "Approval settings updated successfully.",
        nl: "Goedkeuringsinstellingen succesvol bijgewerkt.",
      },

      data: {
        approvalSettings: updatedSettings.approvalSettings,
      },
    });
  } catch (error) {
    console.error("Error updating approval settings:", error);

    return res.status(500).json({
      success: false,
      message: {
        en: "Unable to update approval settings.",
        nl: "Kan goedkeuringsinstellingen niet bijwerken.",
      },
      error: error.message,
    });
  }
};

module.exports = {
  // Vendor review is driven by the vendor's FIRST listing.
  // There is intentionally no approve/reject endpoint for vendors.
  getAdminApprovalVendors,
  getAdminApprovalVendorById,

  // Listing Admin module
  getAdminApprovalListings,
  getAdminApprovalListingById,
  approveListing,
  rejectListing,
  getAdminApprovalSettings,
  updateAdminApprovalSettings,
};
