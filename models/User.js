const mongoose = require("mongoose");

// User Schema
const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: function () {
        // Required for clients and personal vendors, not for business vendors
        if (this.userType === "client") return true;
        if (this.userType === "vendor" && this.accountType === "personal")
          return true;
        return false;
      },
      trim: true,
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
    lastName: {
      type: String,
      // required: function () {
      //   // Required for clients and personal vendors, not for business vendors
      //   if (this.userType === "client") return true;
      //   if (
      //     this.userType === "vendor" &&
      //     (!this.provider || this.provider === "email")
      //   ) {
      //     // Check if this is a business vendor (firstName === businessName)
      //     // If lastName is not set and firstName is set, assume business if lastName is missing
      //     // But better: require lastName for personal vendors only
      //     if (this.accountType && this.accountType === "personal") return true;
      //     // If accountType is not present, fallback: if lastName is set, allow, else not required
      //     return false;
      //   }
      //   return false;
      // },
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: function () {
        return !this.provider || this.provider === "email";
      },
      default: "", // Default to null for social logins
    },
    contactNumber: {
      type: String,
    },
    provider: {
      type: String,
      enum: ["email", "google"],
      default: "email",
    },
    googleId: {
      type: String,
      sparse: true, // Allow multiple null values
      unique: true,
    },
    accountType: {
      type: String,
      enum: ["personal", "business"],
      required: function () {
        return this.userType === "vendor";
      },
    },
    address: {
      type: String,
      default: "",
      trim: true,
    },
    userType: {
      type: String,
      enum: ["client", "vendor", "admin"],
      required: true,
    },
    profileImage: {
      type: String,
      default: "",
    },
    postalCode: {
      type: String,
      default: "",
    },
    city: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // -----------------------------------------
    // Vendor Admin Approval
    // Only relevant when userType === "vendor"
    // -----------------------------------------
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: function () {
        return this.userType === "vendor" ? "pending" : "approved";
      },
    },

    approvalRejectionReason: {
      en: {
        type: String,
        trim: true,
        default: "",
      },
      nl: {
        type: String,
        trim: true,
        default: "",
      },
    },

    submittedForReviewAt: {
      type: Date,
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    designationID: { type: mongoose.Types.ObjectId },
    language: {
      type: String,
      enum: ["english", "dutch"],
      default: "english",
    },
    createdById: { type: mongoose.Types.ObjectId, default: null },
    notifications: {
      email: {
        type: Boolean,
        default: true,
      },
      push: {
        type: Boolean,
        default: true,
      },
    },
    stripeAccountId: {
      type: String,
      default: "",
    },
    stripeOnboardingComplete: {
      type: Boolean,
      default: false,
    },
    lastLogin: Date,
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: false,
    },
    deliveryCharges: {
      type: Number,
      default: 0,
    },
    webFcm: {
      type: String,
    },
    appFcm: {
      type: String,
    },

    // Denormalized copy of Vendor.businessName for the owner of this account.
    // Vendors are business-only profiles now, so they have no firstName/lastName
    // to build a display name from. Keeping the business name on the User doc
    // lets every endpoint that already returns a User (Listing.vendor,
    // Booking.vendorId, cart items, ...) expose a usable `fullName` without any
    // extra lookup. Kept in sync by the Vendor model hooks.
    //
    // Deliberately no default: clients and personal vendors must not start
    // serializing an empty businessName they never had.
    businessName: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

// Virtual for fullName
//
// This is the single display-name field the whole API (and the frontend) reads,
// so it must never be empty for an active account. Business vendors have no
// firstName/lastName, so the business name wins; clients and personal vendors
// fall back to their personal name. Never stringify missing parts into
// "undefined undefined".
userSchema.virtual("fullName").get(function () {
  const businessName = typeof this.businessName === "string" ? this.businessName.trim() : "";
  if (businessName) return businessName;

  return `${this.firstName || ""} ${this.lastName || ""}`.trim();
});

// Ensure virtual fields are serialized
userSchema.set("toJSON", { virtuals: true });
userSchema.set("toObject", { virtuals: true });

// Pre-save middleware
userSchema.pre("save", function (next) {
  this.updatedAt = Date.now();

  // Social login users should not have password
  if (this.provider === "google") {
    this.password = null;
  }

  // Email users must have password
  if (this.provider === "email" && !this.password && this.isNew) {
    return next(new Error("Password is required for email authentication"));
  }

  next();
});

// Indexes for better performance
// Note: email already has unique index from schema definition
userSchema.index({ userType: 1, approvalStatus: 1, isActive: 1 });
// userSchema.index({ googleId: 1 }, { sparse: true });
userSchema.index({ provider: 1 });

module.exports = mongoose.model("User", userSchema);
