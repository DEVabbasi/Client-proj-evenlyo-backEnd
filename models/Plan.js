const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  planName: {
    en: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    nl: {
      type: String,
      required: true,
      trim: true,
      unique: true
    }
  },
  planPrice: {
    type: Number,
    required: true,
    min: 0
  },
  Period: {
    type: String,
    required: true,
    enum: ['month'],
    default: 'month'
  },
  features: [{
    en: {
      type: String,
      required: true
    },
    nl: {
      type: String,
      required: true
    }
  }],
  discount: {
    percentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    discountDays: {
      type: Number,
      min: 0,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: false
    }
  },
  // Stripe-specific fields
  stripeProductId: {
    type: String,
    required: false // Will be set when product is created in Stripe
  },
  stripePriceId: {
    type: String,
    required: false // Will be set when price is created in Stripe
  },
  currency: {
    type: String,
    required: true,
    default: 'eur',
    lowercase: true
  },
  // Additional useful fields
  isActive: {
    type: Boolean,
    default: true
  },
  description: {
    en: {
      type: String,
      trim: true
    },
    nl: {
      type: String,
      trim: true
    }
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  metadata: {
    type: Map,
    of: String,
    default: {}
  }
}, {
  timestamps: true
});

// Virtual for discounted price
planSchema.virtual('discountedPrice').get(function() {
  if (this.discount.isActive && this.discount.percentage > 0) {
    return this.planPrice - (this.planPrice * this.discount.percentage / 100);
  }
  return this.planPrice;
});

// Method to check if discount is currently active
planSchema.methods.isDiscountActive = function() {
  if (!this.discount.isActive || this.discount.discountDays <= 0) {
    return false;
  }
  
  const discountEndDate = new Date(this.createdAt);
  discountEndDate.setDate(discountEndDate.getDate() + this.discount.discountDays);
  
  return new Date() <= discountEndDate;
};

// Method to get effective price (with discount if applicable)
planSchema.methods.getEffectivePrice = function() {
  if (this.isDiscountActive()) {
    return this.discountedPrice;
  }
  return this.planPrice;
};

// Index for better query performance
planSchema.index({ isActive: 1, sortOrder: 1 });
planSchema.index({ stripeProductId: 1 });
planSchema.index({ stripePriceId: 1 });

const Plan = mongoose.model('Plan', planSchema);

module.exports = Plan;
