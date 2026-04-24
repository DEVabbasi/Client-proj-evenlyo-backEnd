const mongoose = require('mongoose');

const chatbotTicketSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['new', 'open', 'closed'],
      default: 'new',
    },
  },
  { timestamps: true }
);

chatbotTicketSchema.index({ status: 1 });
chatbotTicketSchema.index({ email: 1 });

module.exports = mongoose.model('ChatbotTicket', chatbotTicketSchema);