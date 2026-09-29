const mongoose = require('mongoose');

// Listing Schema
const listingSchema = new mongoose.Schema(
  {
    quantity: {
      type: Number,
      default: 1,
      min: 0,
      description: "Current stock quantity for this listing.",
    },
    title: {
      en: { type: String, trim: true, required: true, maxlength: 100 },
      nl: { type: String, trim: true, required: true, maxlength: 100 },
    },
    subtitle: {
      en: { type: String, trim: true },
      nl: { type: String, trim: true },
    },
    description: {
      en: { type: String, trim: true, required: true },
      nl: { type: String, trim: true, required: true },
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    subCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
      required: true,
    },
    pricing: {
      type: Object,
      default: null,
    },
    images: {
      type: [String],
      default: [],
    },
    contact: {
      phone: {
        type: String,
        required: false,
      },
      email: {
        type: String,
        required: false,
      },
      website: String,
      socialMedia: {
        facebook: String,
        instagram: String,
        twitter: String,
        linkedin: String,
      },
    },
    location: {
      userAddress: String,
      coordinates: {
        latitude: {
          type: Number,
          min: -90,
          max: 90,
        },
        longitude: {
          type: Number,
          min: -180,
          max: 180,
        },
      },
    },
    availability: {
      isAvailable: {
        type: Boolean,
        default: true,
      },
      availableDays: [
        {
          type: String,
          enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        },
      ],
      availableTimeSlots: [
        {
          startTime: String, // "09:00"
          endTime: String, // "17:00"
        },
      ],
    },

    serviceDetails: {
      serviceType: {
        type: String,
        enum: ["human", "non_human"],
        required: true,
        default: "human",
      },
    },

    status: {
      type: String,
      enum: ["draft", "pending", "active", "inactive", "suspended"],
      default: "draft",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    rating: {
      average: {
        type: Number,
        min: 0,
        max: 5,
        default: 0,
      },
      totalReviews: {
        type: mongoose.Schema.Types.Double,
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
          en: String,
          nl: String,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    bookings: {
      total: {
        type: Number,
        default: 0,
      },
      completed: {
        type: Number,
        default: 0,
      },
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    popular: {
      type: Boolean,
      default: false,
      description:
        "Indicates if the listing is popular based on certain criteria (e.g., high bookings, high ratings, etc.)",
    },

    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "edited"],
      default: "pending",
    },

    rejectionReason: {
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

    // Last approved, publicly visible content of the listing.
    // Captured every time the listing is approved (admin approval, or
    // auto-approval while the item-approval toggle is off).
    //
    approvalHistory: [
      {
        status: {
          type: String,
          enum: ["pending", "approved", "rejected", "edited"],
          required: true,
        },

        reason: {
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

        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },

        changedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);



listingSchema.index({
  approvalStatus: 1,
  isActive: 1,
});
// Pre-save middleware
// listingSchema.pre('save', function (next) {
//   // Update the sort order based on rating and bookings if not manually set
//   if (this.isModified('rating') || this.isModified('bookings')) {
//     this.sortOrder = (this.rating.average * 20) + (this.bookings.completed * 0.1);
//   }

//   // Automatically set security fee based on service type
//   // Calculate totalPrice before saving
//   const amount = this.pricing?.amount || 0;
//   const extratimeCost = this.pricing?.extratimeCost || 0;
//   const securityFee = this.pricing?.securityFee || 0;
//   const pricePerKm = this.pricing?.pricePerKm || 0;
//   const escrowFee = this.pricing?.escrowFee || 0;
//   this.pricing.totalPrice = amount + extratimeCost + securityFee + escrowFee;

//   next();
// });

// // Indexes for better performance
// listingSchema.index({ vendor: 1, status: 1 });
// listingSchema.index({ category: 1, subCategory: 1, isActive: 1 });
// listingSchema.index({ 'location.city': 1, isActive: 1 });
// listingSchema.index({ status: 1, isActive: 1, isFeatured: -1, sortOrder: -1 });
// listingSchema.index({ tags: 1 });
// listingSchema.index({ 'rating.average': -1, 'bookings.completed': -1 });
// listingSchema.index({ 'title.en': 'text', 'title.nl': 'text', 'description.en': 'text', 'description.nl': 'text', tags: 'text' });

// // Compound index for category-based filtering
// listingSchema.index({
//   category: 1,
//   subCategory: 1,
//   'location.city': 1,
//   isActive: 1,
//   status: 1
// });

module.exports = mongoose.model('Listing', listingSchema);
