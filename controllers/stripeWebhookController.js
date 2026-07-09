const stripe = require('../config/stripe');
const asyncHandler = require('express-async-handler');
const paymentController = require('./paymentController');

// IMPORTANT: This handler expects the raw body to be available on req.rawBody
exports.handleWebhook = asyncHandler(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.LOCAL_WEBHOOK_SECRET;

  try {
    let event;
    if (webhookSecret) {
      // req.rawBody should be a Buffer set by app-level middleware
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } else {
      // If no webhook secret configured, parse the raw body as JSON (NOT recommended in production)
      const raw = req.rawBody || req.body;
      try {
        event = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(raw.toString());
      } catch (err) {
        console.error('Failed to parse webhook body without secret:', err.message);
        return res.status(400).send('Invalid webhook payload');
      }
    }

    // Handle the event
    console.log('Stripe webhook received event:', event.type, 'id:', event.id, 'raw sig header present=', !!sig);
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        // Store payment method and amount
        const paymentMethod = pi.payment_method_types ? pi.payment_method_types[0] : (pi.payment_method || 'stripe');
        const amount = pi.amount_received || pi.amount;
        await paymentController.updateStatus(pi.id, pi.status || 'succeeded', paymentMethod, amount);
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        await paymentController.updateStatus(pi.id, pi.status || 'failed');
        break;
      }
      case 'payment_intent.requires_action': {
        const pi = event.data.object;
        await paymentController.updateStatus(pi.id, pi.status || 'requires_action');
        break;
      }
      case 'payment_intent.processing': {
        const pi = event.data.object;
        const paymentMethod = pi.payment_method_types ? pi.payment_method_types[0] : (pi.payment_method || 'stripe');
        await paymentController.updateStatus(pi.id, pi.status || 'processing', paymentMethod);
        break;
      }
      default:
        // Unexpected event type
        console.log(`Unhandled event type ${event.type}`);
    }

    // Return a response to acknowledge receipt of the event
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handling error:', err && err.stack ? err.stack : err);
    return res.status(500).send('Webhook handling error');
  }
});