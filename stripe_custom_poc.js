/**
 * Stripe Custom Connect Account — Proof of Concept
 * ---------------------------------------------------
 * Standalone script. No frontend, no database — pure API calls against
 * Stripe TEST mode to prove that a Custom connected account for a
 * Netherlands vendor can be created, fully populated, and brought to a
 * payout-ready state without the vendor ever seeing a Stripe-hosted page.
 *
 * Setup:
 *   npm install stripe dotenv
 *   Add STRIPE_SECRET_KEY=sk_test_... to your .env
 *
 * Run:
 *   node stripe_custom_poc.js
 */

require('dotenv').config();
const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
  console.error('Missing or non-test STRIPE_SECRET_KEY in .env. Refusing to run against a live key.');
  process.exit(1);
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Toggle this to 'company' to exercise the business + representative Person flow instead.
const ACCOUNT_TYPE = 'individual'; // 'individual' | 'company'

async function runPOC() {
  console.log(`\n=== Stripe Custom Account POC (${ACCOUNT_TYPE}) ===\n`);

  // ---- Step 1: Create the Custom connected account ----
  console.log('Step 1: Creating Custom connected account...');
  const account = await stripe.accounts.create({
    type: 'custom',
    country: 'NL',
    business_type: ACCOUNT_TYPE,
    capabilities: {
      transfers: { requested: true },
    },
    email: `test.vendor.${Date.now()}@example.com`,
  });
  console.log(`  -> Account created: ${account.id}\n`);

  // ---- Step 2: Push vendor data ----
  console.log('Step 2: Submitting vendor data...');
  if (ACCOUNT_TYPE === 'individual') {
    await stripe.accounts.update(account.id, {
      individual: {
        first_name: 'Test',
        last_name: 'Vendor',
        // 1901-01-01 is Stripe's documented test DOB for a successful match.
        dob: { day: 1, month: 1, year: 1901 },
        address: {
          // address_full_match is Stripe's documented test token for a
          // successful individual address verification.
          line1: 'address_full_match',
          city: 'Amsterdam',
          postal_code: '1011AB',
          country: 'NL',
        },
        email: account.email,
        phone: '+31612345678',
        // 000000000 is Stripe's documented test ID number for a successful match.
        id_number: '000000000',
      },
      business_profile: {
        product_description: 'Event vendor services (POC test)',
        // accessible.stripe.com is Stripe's documented test token for a
        // successful business URL verification.
        url: 'https://accessible.stripe.com',
      },
    });
  } else {
    await stripe.accounts.update(account.id, {
      company: {
        name: 'Test Vendor B.V.',
        // 000000000 is Stripe's documented test tax ID for a successful match.
        tax_id: '000000000',
        address: {
          // address_full_match works the same way for company.address.
          line1: 'address_full_match',
          city: 'Amsterdam',
          postal_code: '1011AB',
          country: 'NL',
        },
        phone: '+31612345678',
      },
      business_profile: {
        product_description: 'Event vendor services (POC test)',
        url: 'https://accessible.stripe.com',
      },
    });

    // ---- Step 2b: Create the representative Person (company/non-profit only) ----
    console.log('Step 2b: Creating representative Person...');
    await stripe.accounts.createPerson(account.id, {
      first_name: 'Test',
      last_name: 'Representative',
      dob: { day: 1, month: 1, year: 1901 },
      address: {
        line1: 'address_full_match',
        city: 'Amsterdam',
        postal_code: '1011AB',
        country: 'NL',
      },
      email: account.email,
      phone: '+31612345678',
      relationship: {
        representative: true,
        owner: true,
        director: true,
        executive: true,
      },
    });
  }
  console.log('  -> Vendor data submitted.\n');

  // ---- Step 3: Add a test IBAN as the external account ----
  console.log('Step 3: Adding test IBAN as external account...');
  await stripe.accounts.createExternalAccount(account.id, {
    external_account: {
      object: 'bank_account',
      country: 'NL',
      currency: 'eur',
      account_holder_name: ACCOUNT_TYPE === 'individual' ? 'Test Vendor' : 'Test Vendor B.V.',
      account_holder_type: ACCOUNT_TYPE === 'individual' ? 'individual' : 'company',
      // NL39RABO0300065264 is Stripe's documented test IBAN for a successful payout.
      account_number: 'NL39RABO0300065264',
    },
  });
  console.log('  -> Test IBAN added.\n');

  // ---- Step 4: Accept the Connected Account Agreement on the vendor's behalf ----
  console.log('Step 4: Recording TOS acceptance...');
  await stripe.accounts.update(account.id, {
    tos_acceptance: {
      date: Math.floor(Date.now() / 1000),
      ip: '8.8.8.8', // placeholder — use the real req.ip in production
    },
  });
  console.log('  -> TOS acceptance recorded.\n');

  // ---- Step 5: Retrieve the account and check verification status ----
  console.log('Step 5: Retrieving account to check status...');
  const updated = await stripe.accounts.retrieve(account.id);

  console.log('\n=== RESULT ===');
  console.log('Account ID:        ', updated.id);
  console.log('charges_enabled:   ', updated.charges_enabled);
  console.log('payouts_enabled:   ', updated.payouts_enabled);
  console.log('details_submitted: ', updated.details_submitted);
  console.log('currently_due:     ', updated.requirements.currently_due);
  console.log('eventually_due:    ', updated.requirements.eventually_due);
  console.log('disabled_reason:   ', updated.requirements.disabled_reason);
  console.log('\nIf payouts_enabled is true and currently_due is empty, the vendor');
  console.log('reached a payout-ready state purely through API calls — no Stripe-hosted UI.');
}

runPOC().catch((err) => {
  console.error('\nPOC failed:', err.message);
  if (err.raw) console.error('Stripe error detail:', err.raw.message);
  process.exit(1);
});