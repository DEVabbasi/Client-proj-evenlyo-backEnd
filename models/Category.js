const mongoose = require('mongoose');

// Main Category Schema
const categorySchema = new mongoose.Schema({
  name: {
    en: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    nl: {
      type: String,
      required: true,
      unique: true,
      trim: true
    }
  },
  icon: {
    type: String,
    validate: {
      validator: function (v) {
        if (!v) return true; // Allow empty/null values
        return /^https:\/\/res\.cloudinary\.com\//.test(v);
      },
      message: 'Icon must be a valid Cloudinary URL'
    }
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
  isActive: {
    type: Boolean,
    default: true
  },
  sortOrder: {
    type: Number,
    default: 0
  },
}, { timestamps: true });

// Pre-save middleware
categorySchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for better performance
// categorySchema.index({ 'name.en': 1 });
// categorySchema.index({ 'name.nl': 1 }); // Have already set "unique: true" so no need for this :)
categorySchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('Category', categorySchema);



