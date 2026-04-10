const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  author: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  content: {
    en: { type: String, trim: true, required: true, maxlength: 1000 },
    nl: { type: String, trim: true, required: true, maxlength: 1000 }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  isApproved: {
    type: Boolean,
    default: true
  }
});

const blogSchema = new mongoose.Schema({
  title: {
    en: { type: String, trim: true, required: true, maxlength: 1000 },
    nl: { type: String, trim: true, required: true, maxlength: 1000 }
  },
  description: {
    en: { type: String, trim: true, required: true, maxlength: 5000 },
    nl: { type: String, trim: true, required: true, maxlength: 5000 }
  },
  content: {
    en: { type: String, trim: true, required: true },
    nl: { type: String, trim: true, required: true }
  },
  author: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  readTime: {
    type: Number,
    required: true,
    min: 1
  },
  image: {
    type: String,
    required: true
  },
  isMain: {
    type: Boolean,
    default: false
  },
  isPublished: {
    type: Boolean,
    default: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  views: {
    type: Number,
    default: 0
  },
  keywords: {
    type: String,
    trim: true
  },
  metaDescription: {
    type: String,
    trim: true
  },
  metaTitle: {
    type: String,
    trim: true
  },
  slug: {
    type: String,
    trim: true
  },
  comments: [commentSchema]
}, {
  timestamps: true
});

// Index for better query performance
blogSchema.index({ isPublished: 1, createdAt: -1 });
blogSchema.index({ category: 1 });
blogSchema.index({ isMain: 1 });

// Virtual for formatted date
blogSchema.virtual('formattedDate').get(function () {
  return this.createdAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

module.exports = mongoose.model('Blog', blogSchema);
