const mongoose = require("mongoose");

// BookingRequest Schema - Updated to match requirements
const bookingRequestSchema = new mongoose.Schema(
  {
    orderType: { type: String, default: "normal" },
    trackingId: {
      condition: {
        type: String,
        enum: ["good", "fair", "claim"],
        default: "good",
        required: true,
      },
      type: String,
      unique: true,
      required: true,
      default: function () {
        return (
          "TRK" +
          Date.now() +
          Math.random().toString(36).substr(2, 9).toUpperCase()
        );
      },
    },
    userId: {
      // Updated from clientId for consistency
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    listingId: {
      // Updated from serviceItemId to match requirements
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
    },
    listingDetails: {
      type: Object,
      default: null,
    },
    details: {
      startDate: {
        type: Date,
        required: true,
      },
      endDate: {
        type: Date,
        required: true,
      },
      startTime: {
        type: String,
        required: function () {
          // Only required if startDate and endDate are the same (single-day booking)
          return (
            this.details &&
            this.details.startDate &&
            this.details.endDate &&
            new Date(this.details.startDate).toDateString() ===
            new Date(this.details.endDate).toDateString()
          );
        },
      },
      endTime: {
        type: String,
        required: function () {
          // Only required if startDate and endDate are the same (single-day booking)
          return (
            this.details &&
            this.details.startDate &&
            this.details.endDate &&
            new Date(this.details.startDate).toDateString() ===
            new Date(this.details.endDate).toDateString()
          );
        },
      },
      duration: {
        hours: Number,
        days: Number,
        totalHours: Number, // Total hours across all days
        isMultiDay: {
          type: Boolean,
          default: false,
        },
      },
      schedule: [
        {
          // For multi-day bookings with different daily schedules
          date: {
            type: Date,
            required: true,
          },
          startTime: {
            type: String,
            required: true,
          },
          endTime: {
            type: String,
            required: true,
          },
          dailyHours: Number,
          notes: {
            en: {
              type: String,
              trim: true,
            },
            nl: {
              type: String,
              trim: true,
            },
          },
        },
      ],
      eventLocation: { type: String },
      eventLatitude: { type: String },
      eventLongitude: { type: String },
      coordinates: {
        latitude: {
          type: Number,
          min: -90,
          max: 90,
        },
        longitude: {
          type: Number,
          min: -180,
          max: 180,
        },
      },
      eventType: {
        en: {
          type: String,
          trim: true,
        },
        nl: {
          type: String,
          trim: true,
        },
      },
      guestCount: Number,
      specialRequests: {
        en: {
          type: String,
          trim: true,
        },
        nl: {
          type: String,
          trim: true,
        },
      },
      contactPreference: {
        type: String,
        enum: ["phone", "email", "whatsapp"],
        default: "email",
      },
    },
    status: {
      type: String,
      enum: [
        "pending",
        "accepted",
        "rejected",
        "paid",
        "on_the_way",
        "received",
        "picked_up",
        "completed",
        "cancelled",
        "claim",
        "finished",
        "received_back",
      ],
      default: "pending",
    },
    paymentStatus: {
      type: String,
      enum: [
        "pending",
        "paid",
        "refunded",
        "partially_refunded",
        "upfront_paid",
      ],
      default: "pending",
    },
    paymentMethod: {
      type: String,
    },
    statusHistory: [
      {
        status: {
          type: String,
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        updatedBy: {
          userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          userType: String,
          name: String,
        },
        notes: {
          en: {
            type: String,
            trim: true,
          },
          nl: {
            type: String,
            trim: true,
          },
        },
      },
    ],
    completedAt: {
      type: Date,
      default: null,
    },
    cancellationDetails: {
      reason: {
        type: String,
      },
      requestedBy: {
        type: String,
        enum: ["client", "vendor"],
      },
      requestedAt: Date,
      isWithinCancellationWindow: Boolean,
      refundedAmount: {
        type: Number,
        default: 0,
      },
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    claimDetails: {
      reason: { type: String, },
      claimedBy: {
        type: String,
        enum: ["client", "vendor"],
      },
      claimType: {
        type: String,
      },
      stripeTransferIdToUser: {
        type: String,
      },
      claimedAt: Date,
      paidAt: Date,
      status: {
        type: String,
        enum: ["pending", "resolved", "rejected", "paid"],
        default: "pending",
      },
      amount: {
        type: Number,
        default: 0,
        min: 0,
      },
      refundAmount: {
        type: Number,
        default: 0,
      },
      AmountPaidByAdmin: {
        type: Number,
        default: 0,
        min: 0,
      },
      adminNotes: { type: String },
      stockUpdated: {
        type: Boolean,
        default: false,
      },
    },
    pricingBreakdown: {
      type: Object,
      default: null,
    },
    feedback: {
      clientFeedback: {
        type: String,
        trim: true,
      },
    },
    invoiceUrl: String,
    // Platform fees
    platformFee: {
      type: Number,
      default: 0,
    },
    itemPlatformFee: {
      type: Number,
      default: 0,
    },
    isFullyPaid: {
      type: Boolean,
      default: false,
    },
    isUpfrontPaid: {
      type: Boolean,
      default: false,
    },
    willPayUpfront: {
      type: Boolean,
      default: false,
    },
    AmountPaid: {
      type: Number,
      default: 0,
    },
    AmountLeft: {
      type: Number,
      default: 0,
    },
    paymentIntentId: {
      type: String,
      default: "",
    },
    paymentPolicy: {
      type: Object,
      default: null,
    },
    reminder3DaysSent: {
      type: Boolean,
      default: false,
    },
    reminder1DaysSent: {
      type: Boolean,
      default: false,
    },
    vendorPaid: {
      type: Boolean,
      default: false
    },
    securityRefundDetails: {
      isSecurityReturned: {
        type: Boolean,
        default: false
      },
      securityReturnedAt: {
        type: Date,
        default: null
      },
      stripeRefundId: {
        type: String,
        default: null
      },
      securityRefundAmount: {
        type: Number,
        default: 0
      }
    },
    vendorPaidAt: Date,
    stripeTransferId: String
  },
  { timestamps: true }
);

// Pre-save middleware
bookingRequestSchema.pre("save", function (next) {
  this.updatedAt = Date.now();

  // Generate tracking ID if not exists
  if (!this.trackingId) {
    this.trackingId =
      "TRK" +
      Date.now() +
      Math.random().toString(36).substr(2, 9).toUpperCase();
  }

  // Calculate multi-day booking details
  if (this.details && this.details.startDate && this.details.endDate) {
    const startDate = new Date(this.details.startDate);
    const endDate = new Date(this.details.endDate);
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Include both start and end dates

    // Set multi-day flag
    this.details.duration.isMultiDay = diffDays > 1;
    this.details.duration.days = diffDays;

    // If no custom schedule provided and it's multi-day, create default schedule
    if (
      this.details.duration.isMultiDay &&
      (!this.details.schedule || this.details.schedule.length === 0)
    ) {
      this.details.schedule = [];
      const currentDate = new Date(startDate);

      for (let i = 0; i < diffDays; i++) {
        const scheduleDate = new Date(currentDate);
        scheduleDate.setDate(currentDate.getDate() + i);

        // Calculate daily hours
        const dailyStartTime = this.details.startTime || "09:00";
        const dailyEndTime = this.details.endTime || "17:00";
        const dailyHours = this.calculateHoursBetween(
          dailyStartTime,
          dailyEndTime
        );

        this.details.schedule.push({
          date: scheduleDate,
          startTime: dailyStartTime,
          endTime: dailyEndTime,
          dailyHours: dailyHours,
          notes: {
            en:
              i === 0
                ? "First day"
                : i === diffDays - 1
                  ? "Last day"
                  : `Day ${i + 1}`,
            nl:
              i === 0
                ? "Eerste dag"
                : i === diffDays - 1
                  ? "Laatste dag"
                  : `Dag ${i + 1}`,
          },
        });
      }
    }

    // Calculate total hours across all days
    if (this.details.schedule && this.details.schedule.length > 0) {
      this.details.duration.totalHours = this.details.schedule.reduce(
        (total, day) => {
          return total + (day.dailyHours || 8); // Default to 8 hours if not specified
        },
        0
      );
    } else {
      // Single day calculation
      const dailyHours = this.calculateHoursBetween(
        this.details.startTime,
        this.details.endTime
      );
      this.details.duration.hours = dailyHours;
      this.details.duration.totalHours = dailyHours;
    }
  }

  // Add status to history if statuss changed
  if (this.isModified("status") && !this.isNew) {
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date(),
      notes: {
        en: "Status updated",
        nl: "Status bijgewerkt",
      },
    });
  }
  next();
});

// Helper method to calculate hours between two time strings
bookingRequestSchema.methods.calculateHoursBetween = function (
  startTime,
  endTime
) {
  const start = new Date(`2000-01-01 ${startTime}`);
  const end = new Date(`2000-01-01 ${endTime}`);
  let diffHours = (end - start) / (1000 * 60 * 60);

  // Handle overnight bookings (e.g., 22:00 to 02:00)
  if (diffHours < 0) {
    diffHours += 24;
  }
  return Math.max(diffHours, 0);
};

// Indexes for better performance
// bookingRequestSchema.index({ trackingId: 1 });
bookingRequestSchema.index({ userId: 1, status: 1 });
bookingRequestSchema.index({ vendorId: 1, status: 1 });
bookingRequestSchema.index({ listingId: 1 });
bookingRequestSchema.index({ "details.startDate": 1, "details.endDate": 1 });
bookingRequestSchema.index({ paymentStatus: 1 });
bookingRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model("BookingRequest", bookingRequestSchema);
