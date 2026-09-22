const Vendor = require("../../models/Vendor");
const User = require("../../models/User");
const Listing = require("../../models/Listing");

const getOnboardingStatus = async (req, res) => {
  try {
    // -----------------------------------------
    // 1. Validate authenticated user
    // -----------------------------------------
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

    // -----------------------------------------
    // 2. Get user + vendor
    // -----------------------------------------
    const [user, vendor] = await Promise.all([
      User.findById(userId)
        .select("userType accountType stripeOnboardingComplete")
        .lean(),

      Vendor.findOne({ userId }).select("mainCategories subCategories").lean(),
    ]);

    // -----------------------------------------
    // 3. Validate vendor
    // -----------------------------------------
    if (!user || user.userType !== "vendor" || !vendor) {
      return res.status(404).json({
        success: false,
        message: {
          en: "Vendor profile not found.",
          nl: "Leveranciersprofiel niet gevonden.",
        },
      });
    }

    // Current onboarding only supports business vendors
    if (user.accountType !== "business") {
      return res.status(400).json({
        success: false,
        message: {
          en: "Onboarding is currently available for business vendors only.",
          nl: "Onboarding is momenteel alleen beschikbaar voor zakelijke leveranciers.",
        },
      });
    }

    // -----------------------------------------
    // 4. Check categories
    // -----------------------------------------
    const categoriesCompleted =
      Array.isArray(vendor.mainCategories) &&
      vendor.mainCategories.length > 0 &&
      Array.isArray(vendor.subCategories) &&
      vendor.subCategories.length > 0;

    // -----------------------------------------
    // 5. Check first listing
    // Only query Listing if categories are complete
    // -----------------------------------------
    let hasListing = false;

    if (categoriesCompleted) {
      hasListing = Boolean(
        await Listing.exists({
          vendor: userId,
        }),
      );
    }

    // -----------------------------------------
    // 6. Step completion
    // -----------------------------------------
    const registrationCompleted = true;

    const firstListingCompleted = categoriesCompleted && hasListing;

    const stripeCompleted = user.stripeOnboardingComplete === true;

    // -----------------------------------------
    // 7. Build steps
    // -----------------------------------------
    const steps = [
      {
        key: "registration",
        order: 1,
        weight: 25,
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
        weight: 25,
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
        weight: 25,
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
        weight: 25,
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
    ];

    // -----------------------------------------
    // 8. Calculate overall progress
    // -----------------------------------------
    const overallProgress = steps.reduce((total, step) => {
      return total + (step.completed ? step.weight : 0);
    }, 0);

    // -----------------------------------------
    // 9. Find current actionable step
    //
    // Skip:
    // - completed steps
    // - locked steps
    // -----------------------------------------
    const currentStepData = steps.find(
      (step) => !step.completed && !step.locked,
    );

    const currentStep = currentStepData?.key || null;

    // -----------------------------------------
    // 10. Assign UI-friendly status
    // -----------------------------------------
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

    // -----------------------------------------
    // 11. Response
    // -----------------------------------------
    return res.status(200).json({
      success: true,
      message: {
        en: "Onboarding status retrieved successfully.",
        nl: "Onboardingstatus succesvol opgehaald.",
      },
      data: {
        overallProgress,
        isComplete: overallProgress === 100,
        currentStep,
        steps: formattedSteps,
      },
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

module.exports = {
  getOnboardingStatus,
};
