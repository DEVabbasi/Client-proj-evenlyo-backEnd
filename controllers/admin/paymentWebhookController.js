const stripe = require("../../config/stripe");
const asyncHandler = require("express-async-handler");
const paymentController = require("./PaymentController"); // capital P — match the actual filename
const WebhookEvent = require("../../models/WebhookEvent");


const HANDLED_EVENTS = new Set([
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.processing",
  "payment_intent.requires_action",
  "payment_intent.canceled",
  "charge.refunded",
]);

exports.handleWebhook = asyncHandler(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return res.status(500).send("Webhook not configured");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  res.status(200).json({ received: true });

  if (!HANDLED_EVENTS.has(event.type)) {
    console.log(`Ignoring unhandled event type: ${event.type}`);
    return;
  }

  try {
    await WebhookEvent.create({ eventId: event.id, type: event.type });
  } catch (err) {
    if (err.code === 11000) {
      console.log(`Duplicate webhook event ${event.id} (${event.type}), skipping`);
      return;
    }
    console.error("WebhookEvent dedupe insert failed:", err);
  }

  try {
    switch (event.type) {
      case "payment_intent.processing": {
        const pi = event.data.object;
        await paymentController.updateStatus(pi.id, "processing", pi.payment_method_types?.[0]);
        break;
      }

      case "payment_intent.succeeded": {
        const pi = event.data.object;
        await paymentController.updateStatus(
          pi.id,
          "succeeded",
          pi.payment_method_types?.[0],
          pi.amount_received || pi.amount
        );
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        const reason = pi.last_payment_error?.message || "unknown";
        console.log(`Payment failed for ${pi.id}: ${reason}`);
        await paymentController.updateStatus(pi.id, "failed", pi.payment_method_types?.[0]);
        break;
      }

      case "payment_intent.canceled": {
        const pi = event.data.object;
        await paymentController.updateStatus(pi.id, "canceled", pi.payment_method_types?.[0]);
        break;
      }

      case "payment_intent.requires_action": {
        const pi = event.data.object;
        await paymentController.updateStatus(pi.id, "requires_action", pi.payment_method_types?.[0]);
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;
        await paymentController.updateStatus(charge.payment_intent, "refunded");
        break;
      }
    }
  } catch (err) {
    console.error(`Error processing webhook event ${event.id} (${event.type}):`, err.stack || err);
  }
});