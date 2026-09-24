const Vendor = require("../../models/Vendor");
const User = require("../../models/User");
const Listing = require("../../models/Listing");
const VendorDesignations = require("../../models/vendorDesignations");
const Employee = require("../../models/Employee");
const SubCategory = require("../../models/SubCategory");
const Booking = require("../../models/Booking");
const StockLog = require("../../models/StockLog");
const ServiceItemStockLog = require("../../models/ServiceItemStockLog");
const Item = require("../../models/Item");
const SaleItemPurchase = require("../../models/SaleItemPurchase");

const PROFILE_ENHANCEMENT_KEYS = [
  "designation",
  "roles",
  "stock",
  "tracking",
  "escrow",
  "securityFee",
];

const STEP_WEIGHTS = {
  registration: 40,
  categories: 10,
  firstItem: 10,
  stripe: 10,
  profileEnhancement: 30,
};

// ------------------------------------------------------------------
// Detect which Profile Enhancement sub-points are already satisfied
// from real vendor data. A point is complete when it is detected
// (data exists) OR manually flagged on the Vendor document.
// ------------------------------------------------------------------
async function detectProfileEnhancementPoints(userId, manualPoints = {}) {
  const [
    hasDesignation,
    hasRoles,
    securityFeeListing,
    subCategoryIds,
    listingIds,
    hasBooking,
    hasSalePurchase,
    saleItemIds,
  ] = await Promise.all([
    VendorDesignations.exists({ vendorId: userId }),
    Employee.exists({ vendor: userId }),
    Listing.exists({ vendor: userId, "pricing.securityFee": { $gt: 0 } }),
    Listing.distinct("subCategory", { vendor: userId }),
    Listing.distinct("_id", { vendor: userId }),
    Booking.exists({ vendorId: userId }),
    SaleItemPurchase.exists({ vendorId: userId }),
    Item.distinct("_id", { vendor: userId }),
  ]);

  const [hasEscrow, hasStock] = await Promise.all([
    subCategoryIds.length > 0
      ? SubCategory.exists({
          _id: { $in: subCategoryIds },
          escrowHours: { $gt: 0 },
        })
      : Promise.resolve(false),
    listingIds.length > 0 || saleItemIds.length > 0
      ? Promise.all([
          listingIds.length > 0
            ? StockLog.exists({ listing: { $in: listingIds } })
            : Promise.resolve(false),
          saleItemIds.length > 0
            ? ServiceItemStockLog.exists({ item: { $in: saleItemIds } })
            : Promise.resolve(false),
        ]).then(([bookingStock, saleStock]) => bookingStock || saleStock)
      : Promise.resolve(false),
  ]);

  const detected = {
    designation: Boolean(hasDesignation),
    roles: Boolean(hasRoles),
    stock: Boolean(hasStock),
    tracking: Boolean(hasBooking || hasSalePurchase),
    escrow: Boolean(hasEscrow),
    securityFee: Boolean(securityFeeListing),
  };

  return PROFILE_ENHANCEMENT_KEYS.map((key) => ({
    key,
    completed: Boolean(detected[key] || manualPoints[key]),
    manual: Boolean(manualPoints[key]),
  }));
}

// ------------------------------------------------------------------
// Build the full onboarding payload shared by GET and POST endpoints.
// ------------------------------------------------------------------
async function buildOnboardingData(user, vendor) {
  const userId = user._id;

  // 1. Categories
  const categoriesCompleted =
    Array.isArray(vendor.mainCategories) &&
    vendor.mainCategories.length > 0 &&
    Array.isArray(vendor.subCategories) &&
    vendor.subCategories.length > 0;

  // 2. First listing (only query Listing if categories are complete)
  let hasListing = false;
  if (categoriesCompleted) {
    hasListing = Boolean(await Listing.exists({ vendor: userId }));
  }

  // 3. Step completion
  const registrationCompleted = true;
  const firstListingCompleted = categoriesCompleted && hasListing;
  const stripeCompleted = user.stripeOnboardingComplete === true;

  // 4. Profile Enhancement sub-points
  const manualPoints = vendor.profileEnhancement || {};
  const step5Points = await detectProfileEnhancementPoints(userId, manualPoints);
  const profileEnhancementCompleted = step5Points.every((point) => point.completed);

  // 5. Build steps
  const steps = [
    {
      key: "registration",
      order: 1,
      weight: STEP_WEIGHTS.registration,
      completed: registrationCompleted,
      locked: false,
      dependsOn: [],
      message: {
        en: "Your business account has been registered successfully.",
        nl: "Uw zakelijke account is succesvol geregistreerd.",
      },
    },

    {
      key: "categories",
      order: 2,
      weight: STEP_WEIGHTS.categories,
      completed: categoriesCompleted,
      locked: false,
      dependsOn: [],
      message: categoriesCompleted
        ? {
            en: "Your business categories have been selected.",
            nl: "Uw bedrijfscategorieën zijn geselecteerd.",
          }
        : {
            en: "Select a main category and subcategory to continue.",
            nl: "Selecteer een hoofdcategorie en subcategorie om verder te gaan.",
          },
    },

    {
      key: "firstItem",
      order: 3,
      weight: STEP_WEIGHTS.firstItem,
      completed: firstListingCompleted,
      locked: !categoriesCompleted,
      dependsOn: ["categories"],
      message: !categoriesCompleted
        ? {
            en: "Complete your category selection before creating your first listing.",
            nl: "Voltooi eerst uw categorieselectie voordat u uw eerste advertentie aanmaakt.",
          }
        : firstListingCompleted
          ? {
              en: "Your first listing has been created.",
              nl: "Uw eerste advertentie is aangemaakt.",
            }
          : {
              en: "Create your first listing to continue.",
              nl: "Maak uw eerste advertentie aan om verder te gaan.",
            },
    },

    {
      key: "stripe",
      order: 4,
      weight: STEP_WEIGHTS.stripe,
      completed: stripeCompleted,
      locked: false,
      dependsOn: [],
      message: stripeCompleted
        ? {
            en: "Your Stripe account is connected and ready.",
            nl: "Uw Stripe-account is gekoppeld en klaar voor gebruik.",
          }
        : {
            en: "Complete Stripe onboarding to enable payments and payouts.",
            nl: "Voltooi de Stripe-onboarding om betalingen en uitbetalingen te activeren.",
          },
    },

    {
      key: "profileEnhancement",
      order: 5,
      weight: STEP_WEIGHTS.profileEnhancement,
      completed: profileEnhancementCompleted,
      locked: false,
      dependsOn: [],
      points: step5Points,
      message: profileEnhancementCompleted
        ? {
            en: "Your profile is fully optimized — every point is checked off.",
            nl: "Je profiel is volledig geoptimaliseerd — elk punt is afgevinkt.",
          }
        : {
            en: "Complete the quick setup points below to make your profile fully ready.",
            nl: "Voltooi de snelle instelpunten hieronder om je profiel volledig gereed te maken.",
          },
    },
  ];

  // 6. Overall progress
  const overallProgress = steps.reduce((total, step) => {
    return total + (step.completed ? step.weight : 0);
  }, 0);

  // 7. Current actionable step (skip completed / locked)
  const currentStepData = steps.find(
    (step) => !step.completed && !step.locked,
  );
  const currentStep = currentStepData?.key || null;

  // 8. UI-friendly status
  const formattedSteps = steps.map((step) => {
    let status = "pending";

    if (step.completed) {
      status = "completed";
    } else if (step.locked) {
      status = "locked";
    } else if (step.key === currentStep) {
      status = "current";
    }

    return {
      ...step,
      status,
    };
  });

  return {
    overallProgress,
    isComplete: overallProgress === 100,
    currentStep,
    steps: formattedSteps,
  };
}

// ------------------------------------------------------------------
// GET /profile-enhancement status
// ------------------------------------------------------------------
const getOnboardingStatus = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: {
          en: "Authentication required.",
          nl: "Authenticatie vereist.",
        },
      });
    }

    const [user, vendor] = await Promise.all([
      User.findById(userId)
        .select("userType accountType stripeOnboardingComplete")
        .lean(),

      Vendor.findOne({ userId })
        .select("mainCategories subCategories profileEnhancement")
        .lean(),
    ]);

    if (!user || user.userType !== "vendor" || !vendor) {
      return res.status(404).json({
        success: false,
        message: {
          en: "Vendor profile not found.",
          nl: "Leveranciersprofiel niet gevonden.",
        },
      });
    }

    if (user.accountType !== "business") {
      return res.status(400).json({
        success: false,
        message: {
          en: "Onboarding is currently available for business vendors only.",
          nl: "Onboarding is momenteel alleen beschikbaar voor zakelijke leveranciers.",
        },
      });
    }

    const data = await buildOnboardingData(user, vendor);

    return res.status(200).json({
      success: true,
      message: {
        en: "Onboarding status retrieved successfully.",
        nl: "Onboardingstatus succesvol opgehaald.",
      },
      data,
    });
  } catch (error) {
    console.error("Get onboarding status error:", error);

    return res.status(500).json({
      success: false,
      message: {
        en: "An unexpected error occurred while retrieving the onboarding status.",
        nl: "Er is een onverwachte fout opgetreden bij het ophalen van de onboardingstatus.",
      },
    });
  }
};

// ------------------------------------------------------------------
// POST /profile-enhancement  (toggle a manual sub-point flag)
// ------------------------------------------------------------------
const updateProfileEnhancement = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: {
          en: "Authentication required.",
          nl: "Authenticatie vereist.",
        },
      });
    }

    const { key, completed } = req.body || {};

    if (!PROFILE_ENHANCEMENT_KEYS.includes(key)) {
      return res.status(400).json({
        success: false,
        message: {
          en: "Invalid profile enhancement point.",
          nl: "Ongeldig profielverbeteringspunt.",
        },
      });
    }

    if (typeof completed !== "boolean") {
      return res.status(400).json({
        success: false,
        message: {
          en: "The 'completed' value must be a boolean.",
          nl: "De waarde 'completed' moet een boolean zijn.",
        },
      });
    }

    const [user, vendor] = await Promise.all([
      User.findById(userId)
        .select("userType accountType stripeOnboardingComplete")
        .lean(),

      Vendor.findOne({ userId }).lean(),
    ]);

    if (!user || user.userType !== "vendor" || !vendor) {
      return res.status(404).json({
        success: false,
        message: {
          en: "Vendor profile not found.",
          nl: "Leveranciersprofiel niet gevonden.",
        },
      });
    }

    await Vendor.updateOne(
      { userId },
      { $set: { [`profileEnhancement.${key}`]: completed } },
    );

    const mergedVendor = {
      ...vendor,
      profileEnhancement: {
        ...(vendor.profileEnhancement || {}),
        [key]: completed,
      },
    };

    const data = await buildOnboardingData(user, mergedVendor);

    return res.status(200).json({
      success: true,
      message: {
        en: "Profile enhancement updated successfully.",
        nl: "Profielverbetering succesvol bijgewerkt.",
      },
      data,
    });
  } catch (error) {
    console.error("Update profile enhancement error:", error);

    return res.status(500).json({
      success: false,
      message: {
        en: "An unexpected error occurred while updating the profile enhancement.",
        nl: "Er is een onverwachte fout opgetreden bij het bijwerken van de profielverbetering.",
      },
    });
  }
};

module.exports = {
  getOnboardingStatus,
  updateProfileEnhancement,
};