const mongoose = require('mongoose');

const adminEmployeeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: "Admin" },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  designationID: { type: mongoose.Types.ObjectId },
  lastLogin: Date,
  notificationSettings: {
    email: {
      orderCancellation: { type: Boolean, default: true },
      evenlyoProtect: { type: Boolean, default: true },
    },
    push: {
      evenlyoProtect: { type: Boolean, default: true },
      newRegistration: { type: Boolean, default: true },
    }
  }

}, { timestamps: true });

module.exports = mongoose.model('AdminEmployee', adminEmployeeSchema);