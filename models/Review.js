const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    vendorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking'
    },
    review: {
        type: String,
        default: ""
    },
    rating: {
        type: Number,
        default: 1
    }
}, {
    timestamps: true
});


const Plan = mongoose.model('reviews', reviewSchema);

module.exports = Plan;
