const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
    bookingItemPlatformFee: {
        type: Number,
        required: true,
        default: 0
    },
    salesItemPlatformFee: {
        type: Number,
        required: true,
        default: 0
    },
    vat: {
        type: Number,
        required: true,
        default: 0
    },
    adminNotificationSettings: {
        type: Object,
        default: {
            email: {
                bookingCompletion: true,
                newAccount: true
            },
            push: {
                bookingCompletion: true,
                newAccount: true
            }
        }
    }
});

module.exports = mongoose.model('Settings', SettingsSchema);
