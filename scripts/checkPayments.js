// scripts/checkPayment.js
require('dotenv').config();
const stripe = require('../config/stripe');

(async () => {
  const pi = await stripe.paymentIntents.retrieve(process.argv[2]);
  console.log('Status:', pi.status);
  console.log('Amount:', pi.amount, pi.currency);
  console.log('Payment method:', pi.payment_method);
})();