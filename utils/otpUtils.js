const OTP = require('../models/OTP');
const { sendOTPEmail, sendForgotOTPADMIN } = require('./mailer');

/**
 * Generate a 6-digit OTP and send it to the specified email
 * @param {string} email - Email address to send OTP to
 * @returns {Promise<void>}
 */
async function generateAndSendOTP(email) {
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);// 60 sec
  await OTP.create({ email, code: otpCode, expiresAt });
  await sendForgotOTPADMIN(email, otpCode);
}

/**
 * Verify an OTP code for a given email
 * @param {string} email - Email address
 * @param {string} code - OTP code to verify
 * @returns {Promise<boolean>} - Returns true if OTP is valid, false otherwise
 */
async function verifyOTP(email, code) {
  console.log(email, code, new Date(), "ASDASD");

  const otpDoc = await OTP.findOne({
    email: email.toLowerCase(),
    code: code.toString(),
    expiresAt: { $gt: new Date() },
    verified: false
  }).sort({ createdAt: -1 });

  if (!otpDoc) return false;

  otpDoc.verified = true;
  await otpDoc.save();
  return true;
}

module.exports = {
  generateAndSendOTP,
  verifyOTP
};
