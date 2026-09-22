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
  },
  {
    timestamps: true,
    collection: "vendorDetails",
  },
);

vendorSchema.index({ userId: 1 });
vendorSchema.index({ mainCategories: 1 });
// vendorSchema.index({ approvalStatus: 1 });

module.exports = mongoose.model("Vendor", vendorSchema);
