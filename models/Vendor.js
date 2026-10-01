const mongoose = require("mongoose");

const vendorSchema = new mongoose.Schema(
  {
    // vendorId: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: 'User',
    //   required: true
    // },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    businessEmail: {
      type: String,
      trim: true,
    },
    businessPhone: {
      type: String,
      trim: true,
    },
    businessWebsite: {
      type: String,
    },
    teamType: {
      type: String,
    },
    teamSize: {
      type: String,
      min: 1,
    },
    businessLocation: {
      type: String,
      trim: true,
    },
    businessLogo: {
      type: String,
      default: "",
    },
    tagline: {
      en: { type: String, trim: true },
      nl: { type: String, trim: true },
    },
    description: {
      en: { type: String, trim: true },
      nl: { type: String, trim: true },
    },
    businessImage: {
      type: String,
      default: "",
    },
    whyChooseUs: {
      en: { type: String, trim: true, default: "" },
      nl: { type: String, trim: true, default: "" },
    },
    businessDescription: {
      en: { type: String, trim: true },
      nl: { type: String, trim: true },
    },
    mainCategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
      },
    ],
    subCategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubCategory",
      },
    ],
    rating: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
      totalReviews: {
        type: Number,
        default: 0,
      },
    },
    reviews: [
      {
        bookingId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Booking",
        },
        clientId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        rating: {
          type: Number,
          min: 1,
          max: 5,
          required: true,
        },
        review: {
          en: { type: String, trim: true },
          nl: { type: String, trim: true },
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    totalBookings: {
      type: Number,
      default: 0,
    },
    completedBookings: {
      type: Number,
      default: 0,
    },
    isApproved: {
      type: Boolean,
      default: true,
    },
    // approvalStatus: {
    //   type: String,
    //   enum: ["pending", "approved", "rejected"],
    //   default: "pending",
    // },

    // rejectionReason: {
    //   type: String,
    //   trim: true,
    //   default: "",
    // },

    // submittedForReviewAt: {
    //   type: Date,
    //   default: null,
    // },

    // reviewedAt: {
    //   type: Date,
    //   default: null,
    // },

    // reviewedBy: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: "User",
    //   default: null,
    // },
    contactMeEnabled: {
      type: Boolean,
      default: true,
    },
    passportDetails: {
      type: String,
      required: function () {
        return this.userType === "vendor" && this.accountType === "personal";
      },
      trim: true,
    },
    kvkNumber: {
      type: String,
      required: function () {
        return this.userType === "vendor" && this.accountType === "business";
      },
      trim: true,
    },
    accountType: {
      type: String,
      enum: ["personal", "business"],
    },
    // Manual completion flags for onboarding "Profile Enhancement" sub-points.
    // Keys: designation, roles, stock, tracking, escrow, securityFee.
    profileEnhancement: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: "vendorDetails",
  },
);

vendorSchema.index({ userId: 1 });
vendorSchema.index({ mainCategories: 1 });
// vendorSchema.index({ approvalStatus: 1 });

// ---------------------------------------------------------------------------
// Mirror businessName onto the owner's User document.
//
// User.fullName is the display name every API endpoint returns, and it is a
// plain virtual (no cross-collection lookups). Business vendors have no
// firstName/lastName, so without a copy of the business name on the User doc
// fullName serializes as "" everywhere a User is populated (listing details,
// homeData, cart, booking history, ...).
//
// Denormalizing here means every existing create/update path is covered
// automatically, including ones that bypass the controllers (admin edits,
// scripts, profile updates via findOneAndUpdate).
// ---------------------------------------------------------------------------
const mirrorBusinessNameToUser = async (vendorDoc) => {
  if (!vendorDoc?.userId) return;

  const User = require("./User");

  const businessName =
    typeof vendorDoc.businessName === "string" ? vendorDoc.businessName.trim() : "";

  // Personal vendors have no business name. Unset rather than write "" so the
  // field stays absent on their User doc, exactly as before.
  await User.updateOne(
    { _id: vendorDoc.userId },
    businessName
      ? { $set: { businessName } }
      : { $unset: { businessName: "" } },
  ).exec();
};

const mirrorFromQueryResult = (result, previous) => {
  // findOneAndUpdate/findByIdAndUpdate return the updated doc only when
  // { new: true } is passed; otherwise fall back to the pre-update doc.
  const doc = result || previous;
  if (!doc?.userId) return undefined;

  return mirrorBusinessNameToUser(doc).catch((err) => {
    console.error("Failed to mirror vendor businessName to user:", err);
  });
};

vendorSchema.post("save", function (doc) {
  return mirrorBusinessNameToUser(doc).catch((err) => {
    console.error("Failed to mirror vendor businessName to user:", err);
  });
});

vendorSchema.post("insertMany", function (docs) {
  return Promise.all(
    (docs || []).map((doc) =>
      mirrorBusinessNameToUser(doc).catch((err) => {
        console.error("Failed to mirror vendor businessName to user:", err);
      }),
    ),
  );
});

vendorSchema.post("findOneAndUpdate", function (result, previous) {
  return mirrorFromQueryResult(result, previous);
});

vendorSchema.post("updateOne", async function (result) {
  const doc = await this.model
    .findOne(this.getFilter())
    .select("userId businessName");
  return mirrorFromQueryResult(doc);
});

module.exports = mongoose.model("Vendor", vendorSchema);
