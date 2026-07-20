// scripts/testIdealPayment.js
require('dotenv').config();
const stripe = require('../config/stripe');

(async () => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 1000, // €10.00
      currency: 'eur',
      payment_method_types: ['ideal'],
      payment_method_data: {
        type: 'ideal',
        ideal: { bank: 'abn_amro' }, // Stripe's fake test bank
      },
      confirm: true,
      return_url: 'https://example.com/return', // dummy, we won't actually land here
    });

    console.log('PaymentIntent ID:', paymentIntent.id);
    console.log('Status:', paymentIntent.status);

    if (paymentIntent.next_action?.redirect_to_url?.url) {
      console.log('\nOpen this URL in your browser to simulate the bank auth page:');
      console.log(paymentIntent.next_action.redirect_to_url.url);
    } else {
      console.log('No redirect URL — check the full response:', paymentIntent);
    }
  } catch (err) {
    console.error('Error creating iDEAL PaymentIntent:', err.message);
  }
})();