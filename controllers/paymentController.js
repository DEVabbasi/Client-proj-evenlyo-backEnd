const stripe = require('../config/stripe');
const asyncHandler = require('express-async-handler');
const Listing = require('../models/Listing');
const PaymentIntent = require('../models/PaymentIntent');
const Plan = require('../models/Plan');
const Vendor = require('../models/Vendor');

const createPaymentIntent = asyncHandler(async (req, res) => {
  // Accept booking flow: { bookingId, items } OR listing flow: { listingId or productId }
  const { bookingId, items, listingId, productId, quantity = 1, metadata = {}, currency } = req.body;

  let usedCurrency = currency || 'eur';
  let amount = 0; // in smallest unit
  let listing;
  let booking;

  if (bookingId) {
    // Booking-based payment
    const Booking = require('../models/Booking');
    booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Use booking.pricing.totalPrice as main amount (assume stored in main units)
    usedCurrency = booking.pricing?.currency || usedCurrency;
    amount = Math.round((booking.pricing.totalPrice || booking.pricing.bookingPrice || 0) * 100);

    // Fallback: if booking total is missing/zero and items array provided,
    // sum listing prices from provided item listing IDs
    if ((!amount || amount <= 0) && Array.isArray(items) && items.length > 0) {
      const ListingModel = require('../models/Listing');
      const listings = await ListingModel.find({ _id: { $in: items } });
      if (listings && listings.length > 0) {
        // If listings have pricing.amount, sum them
        const sum = listings.reduce((acc, l) => acc + (l.pricing?.amount || 0), 0);
        amount = Math.round(sum * 100);
        // try derive currency from first listing
        usedCurrency = listings[0].pricing?.currency || usedCurrency;
      }
    }
  } else {
    // Listing-based payment
    const id = listingId || productId;
    if (!id) return res.status(400).json({ error: 'listingId or productId is required' });

    listing = await Listing.findById(id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    usedCurrency = currency || listing.pricing?.currency || usedCurrency;
    amount = Math.round((listing.pricing.amount * 100) * quantity);
  }

  // Validate amount
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Amount is missing or zero. Check booking.pricing.totalPrice or listing.pricing.amount.' });
  }

  // prepare metadata for Stripe: all values must be strings
  const metadataForStripe = {};
  // include listing/booking/quantity/items as strings when present
  if (listing) metadataForStripe.listingId = String(listing._id);
  if (booking) metadataForStripe.bookingId = String(booking._id);
  metadataForStripe.quantity = String(quantity || 1);
  if (items) metadataForStripe.items = Array.isArray(items) ? JSON.stringify(items) : String(items);

  // include any additional metadata provided in request, stringifying non-string values
  if (metadata && typeof metadata === 'object') {
    Object.entries(metadata).forEach(([k, v]) => {
      metadataForStripe[k] = typeof v === 'string' ? v : JSON.stringify(v);
    });
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: usedCurrency,
    automatic_payment_methods: { enabled: true },
    metadata: metadataForStripe,
  });

  // store mapping in DB
  const pi = await PaymentIntent.create({
    stripeIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret,
    status: paymentIntent.status,
    listing: listing ? listing._id : undefined,
    booking: booking ? booking._id : undefined,
    amount,
    currency: usedCurrency,
    quantity,
    metadata: { ...(metadata || {}), items: items || undefined },
  });

  // Return internal id, Stripe client secret and Stripe intent id
  res.status(201).json({
    internalId: pi.internalId,
    client_secret: paymentIntent.client_secret,
    stripeId: paymentIntent.id,
  });
});

// Get payment intent by internal id (returns client_secret and status)
 const getPaymentIntent = asyncHandler(async (req, res) => {
  const { internalId } = req.body;
  if (!internalId) return res.status(400).json({ error: 'internalId is required' });

  // populate the listing reference
  const pi = await PaymentIntent.findOne({ internalId }).populate('listing');
  if (!pi) return res.status(404).json({ error: 'PaymentIntent not found' });

  res.json({
    internalId: pi.internalId,
    clientSecret: pi.clientSecret,
    status: pi.status,
    amount: pi.amount,
    currency: pi.currency,
    listing: pi.listing,
    quantity: pi.quantity,
  });
});

// GET handler by URL param
const getPaymentIntentByInternalId = asyncHandler(async (req, res) => {
  const { internalId } = req.params;
  if (!internalId) return res.status(400).json({ error: 'internalId is required' });

  const pi = await PaymentIntent.findOne({ internalId }).populate('listing').populate('booking');
  if (!pi) return res.status(404).json({ error: 'PaymentIntent not found' });

  res.json({
    internalId: pi.internalId,
    clientSecret: pi.clientSecret,
    status: pi.status,
    amount: pi.amount,
    currency: pi.currency,
    listing: pi.listing,
    booking: pi.booking,
    quantity: pi.quantity,
  });
});

// Create Stripe subscription for a vendor
const createSubscription = asyncHandler(async (req, res) => {
  // Expect: { vendorId, planId, paymentMethodId }
  const { vendorId, planId, paymentMethodId } = req.body;
  if (!vendorId || !planId || !paymentMethodId) {
    return res.status(400).json({ error: 'vendorId, planId, and paymentMethodId are required.' });
  }

  // Find vendor and plan
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
  const plan = await Plan.findById(planId);
  if (!plan || !plan.stripePriceId) return res.status(404).json({ error: 'Plan or Stripe price not found' });

  // Create Stripe customer if not already stored
  let stripeCustomerId = vendor.stripeCustomerId;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: vendor.businessEmail,
      name: vendor.businessName,
      metadata: { vendorId: vendor._id.toString() }
    });
    stripeCustomerId = customer.id;
    vendor.stripeCustomerId = stripeCustomerId;
    await vendor.save();
  }

  // Attach payment method to customer
  await stripe.paymentMethods.attach(paymentMethodId, { customer: stripeCustomerId });
  await stripe.customers.update(stripeCustomerId, { invoice_settings: { default_payment_method: paymentMethodId } });

  // Create subscription
  const subscription = await stripe.subscriptions.create({
    customer: stripeCustomerId,
    items: [{ price: plan.stripePriceId }],
    payment_behavior: 'default_incomplete',
    expand: ['latest_invoice.payment_intent'],
    metadata: { vendorId: vendor._id.toString(), planId: plan._id.toString() }
  });

  // Optionally, store subscription info in vendor
  vendor.subscription = {
    stripeSubscriptionId: subscription.id,
    plan: plan._id,
    status: subscription.status,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    latestInvoice: subscription.latest_invoice,
    clientSecret: subscription.latest_invoice.payment_intent.client_secret
  };
  await vendor.save();

  res.status(201).json({
    subscriptionId: subscription.id,
    status: subscription.status,
    clientSecret: subscription.latest_invoice.payment_intent.client_secret
  });
});

// Exported for webhook controller to update status

const updateStatus = asyncHandler(async (stripeIntentId, status, paymentMethod, amount) => {
  try {
  // ...existing code...
    const pi = await PaymentIntent.findOne({ stripeIntentId });
    if (!pi) {
      return null;
    }
  // ...existing code...
    pi.status = status;
    if (paymentMethod) pi.paymentMethod = paymentMethod;
     if (amount) pi.amount = amount / 100;
  await pi.save();

    // If this payment intent is linked to a booking, update booking status/paymentStatus
    if (pi.booking) {
      const Booking = require('../models/Booking');
      const booking = await Booking.findById(pi.booking);
      if (booking) {
        // Map Stripe status to booking fields
        if (status === 'succeeded') {
          booking.paymentStatus = 'paid';
          booking.paymentMethod = paymentMethod || 'stripe';
          booking.status = 'paid';
        } else if (status === 'failed' || (status && status.includes('fail'))) {
          booking.paymentStatus = booking.paymentStatus || 'pending';
        } else if (status && status.includes('requires')) {
          booking.paymentStatus = booking.paymentStatus || 'pending';
        }
        await booking.save();
        console.log('updateStatus: booking updated', booking._id.toString(), 'paymentStatus=', booking.paymentStatus);
      } else {
        // ...existing code...
      }
    }

    return pi;
  } catch (err) {
  // ...existing code...
    throw err;
  }
});

module.exports = {
  createPaymentIntent,
  getPaymentIntent,
  getPaymentIntentByInternalId,
  createSubscription,
  updateStatus
};