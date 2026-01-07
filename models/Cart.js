const mongoose = require("mongoose");

// Cart Schema
const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // One cart per user
    },

    items: [
      {
        listingId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Listing",
          required: true,
        },
        tempDetails: {
          startDate: Date,
          endDate: Date,
          startTime: String,
          endTime: String,
          distance: Number,
          eventLocation: String,
          eventLatitude: String,
          eventLongitude: String,
          paymentPolicy: {
            type: Object,
            default: null,
          },
          evenyloProtect: Boolean,

          specialRequests: String,
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
        // Store listing snapshot for quick reference
        listingSnapshot: {
          title: String,
          featuredImage: String,
          vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vendor",
          },
        },
      },
    ],
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for total items count
cartSchema.virtual("totalItems").get(function () {
  return this.items.length;
});

// Virtual for estimated total (if pricing available)
cartSchema.virtual("estimatedTotal").get(function () {
  return this.items.reduce((total, item) => {
    const snapshot = item.listingSnapshot;
    if (!snapshot || !snapshot.pricing) return total;

    const duration = item.tempDetails?.duration;
    let itemTotal = 0;

    if (
      snapshot.pricing.type === "hourly" &&
      snapshot.pricing.perHour &&
      duration?.hours
    ) {
      itemTotal = snapshot.pricing.perHour * duration.hours;
    } else if (
      snapshot.pricing.type === "daily" &&
      snapshot.pricing.perDay &&
      duration?.days
    ) {
      itemTotal = snapshot.pricing.perDay * duration.days;
    } else if (
      snapshot.pricing.type === "per_event" &&
      snapshot.pricing.perEvent
    ) {
      itemTotal = snapshot.pricing.perEvent;
    }

    return total + itemTotal;
  }, 0);
});

// Pre-save middleware to update lastUpdated
cartSchema.pre("save", function (next) {
  this.lastUpdated = new Date();
  next();
});

// Instance method to add item to cart
cartSchema.methods.addItem = function (
  listingId,
  listingSnapshot,
  tempDetails = {}
) {
  // Check if item already exists
  const existingItem = this.items.find(
    (item) => item.listingId.toString() === listingId.toString()
  );

  if (existingItem) {
    // Update existing item
    existingItem.tempDetails = { ...existingItem.tempDetails, ...tempDetails };
    existingItem.addedAt = new Date();
    if (listingSnapshot) {
      existingItem.listingSnapshot = listingSnapshot;
    }
  } else {
    // Add new item
    this.items.push({
      listingId,
      listingSnapshot,
      tempDetails,
      addedAt: new Date(),
    });
  }

  return this.save();
};

// Instance method to remove item from cart
cartSchema.methods.removeItem = function (listingId) {
  this.items = this.items.filter(
    (item) => item.listingId.toString() !== listingId.toString()
  );
  return this.save();
};

// Instance method to clear cart
cartSchema.methods.clearCart = function () {
  this.items = [];
  return this.save();
};

// Instance method to update item details
cartSchema.methods.updateItemDetails = function (listingId, tempDetails) {
  const item = this.items.find(
    (item) => item.listingId.toString() === listingId.toString()
  );

  if (item) {
    item.tempDetails = { ...item.tempDetails, ...tempDetails };
    return this.save();
  }

  throw new Error("Item not found in cart");
};

// Indexes for better performance
// cartSchema.index({ userId: 1 }); unique true for userId is already set above..
cartSchema.index({ "items.listingId": 1 });
cartSchema.index({ lastUpdated: -1 });

module.exports = mongoose.model("Cart", cartSchema);
