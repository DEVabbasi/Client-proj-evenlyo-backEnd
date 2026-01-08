const mongoose = require('mongoose');

const stockLogSchema = new mongoose.Schema({
  listing: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Listing',
    required: true
  },
  type: {
    type: String,
    enum: ['checkin', 'checkout', 'missing', 'stockin'],
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  dateTime: {
    type: Date,
    default: Date.now
  },
  note: {
    type: String
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  itemType: {
    type: String,
    default: "booking"
  }
}, { timestamps: true });

module.exports = mongoose.model('StockLog', stockLogSchema);
