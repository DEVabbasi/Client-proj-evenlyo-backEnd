const mongoose = require("mongoose");

const SettingsSchema = new mongoose.Schema({
  bookingItemPlatformFee: {
    type: Number,
    required: true,
    default: 0,
  },

  salesItemPlatformFee: {
    type: Number,
    required: true,
    default: 0,
  },

  vat: {
    type: Number,
    required: true,
    default: 0,
  },

  adminNotificationSettings: {
    type: Object,
    default: {
      email: {
        bookingCompletion: true,
        newAccount: true,
      },
      push: {
        bookingCompletion: true,
        newAccount: true,
      },
    },
  },

  // -----------------------------------------
  // Vendor & Listing Approval Settings
  // -----------------------------------------
  approvalSettings: {
    vendorActivationRequired: {
      type: Boolean,
      default: true,
    },

    itemApprovalRequired: {
      type: Boolean,
      default: true,
    },
  },

  androidVersion: {
    type: Number,
    default: 1,
  },

  isAndroidPopUpShow: {
    type: Boolean,
    default: false,
  },

  iosVersion: {
    type: Number,
    default: 1,
  },

  isIosPopUpShow: {
    type: Boolean,
    default: false,
  },
});

module.exports = mongoose.model("Settings", SettingsSchema);
