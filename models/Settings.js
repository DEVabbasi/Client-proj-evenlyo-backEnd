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
  // Listing Approval Settings
  //
  // There is a single toggle: itemApprovalRequired.
  //
  //   ON  -> new listings are created "pending" and only go live after an
  //          Admin approves them.
  //   OFF -> new listings are created "approved" immediately.
  //
  // Vendor visibility is NOT toggled. A vendor is publicly visible as soon as
  // it has at least one approved listing.
  // -----------------------------------------
  approvalSettings: {
    itemApprovalRequired: {
      type: Boolean,
      default: true,
    },
  },

  // Audit trail for the approval toggle. Append-only: one entry per actual
  // value change, recording who changed it and when. Intentionally not
  // surfaced in the admin UI.
  approvalSettingsHistory: [
    {
      itemApprovalRequired: {
        type: Boolean,
        required: true,
      },
      previousValue: {
        type: Boolean,
        default: null,
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
