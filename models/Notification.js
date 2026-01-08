const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  title: {
    en: { type: String, trim: true, required: true },
    nl: { type: String, trim: true, required: true }
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BookingRequest',
    required: false // Made optional for admin notifications
  },
  notificationFor: { type: String, default: "Vendor" },
  message: {
    en: { type: String, trim: true, required: true },
    nl: { type: String, trim: true, required: true }
  },
  isRead: {
    type: Boolean,
    default: false
  },
  isClientRead: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Notification', NotificationSchema);
