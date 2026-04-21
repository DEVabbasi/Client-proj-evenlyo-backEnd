const mongoose = require('mongoose');

const qnaSchema = new mongoose.Schema(
  {
    question: {
      en: { type: String, trim: true, required: true },
      nl: { type: String, trim: true, required: true },
    },
    answer: {
      en: { type: String, trim: true, required: true },
      nl: { type: String, trim: true, required: true },
    },
    category: {
      type: String,
      required: true,
      enum: [
        'Booking Flow',
        'Pricing & Fees',
        'Cancellation',
        'Services & Categories',
        'Vendor & Chat',
        'Support',
      ],
    },
    keywords: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
  },
  { timestamps: true }
);

qnaSchema.index({ status: 1 });
qnaSchema.index({ category: 1 });

module.exports = mongoose.model('QnA', qnaSchema);