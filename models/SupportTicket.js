const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const supportTicketSchema = new mongoose.Schema({
  ticketId: {
    type: String,
    unique: true,
    default: () => `TICKET-${uuidv4().substring(0, 8).toUpperCase()}`,
  },
  trackingId: {
    type: String,
  },
  userEmail: {
    type: String,
    required: true,
    trim: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  issueRelatedto: {
    type: String,
    required: true,
  },
  details: {
    type: String,
  },
  status: {
    type: String,
    enum: ["open", "closed"],
    default: "open",
  },
  closedAt: {
    type: Date,
  },
}, {
  timestamps: true
});

// Update the updatedAt field before saving
supportTicketSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  if (this.status === "closed" && !this.closedAt) {
    this.closedAt = Date.now();
  }
  next();
});

// Create indexes for better performance
supportTicketSchema.index({ userEmail: 1, createdAt: -1 }); // won't remove because of createdAt: -1, this is used for faster querying!
// supportTicketSchema.index({ ticketId: 1 });
supportTicketSchema.index({ status: 1 });

module.exports = mongoose.model("SupportTicket", supportTicketSchema);
