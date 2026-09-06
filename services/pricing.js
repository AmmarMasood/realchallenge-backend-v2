/**
 * Currency and VAT.
 *
 * Two rules the rest of the code depends on:
 *  - money is always stored with an ISO 4217 code, never a symbol
 *  - consumer prices are VAT-INCLUSIVE, so VAT is extracted from a price rather
 *    than added to it
 */
const { VatRate } = require("../models/PaymentModel/vatRateModel");

// Currencies the system will accept. Mollie handles more; this is what we are
// prepared to store and display.
const SUPPORTED_CURRENCIES = ["EUR", "USD", "AED"];
const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY || "EUR";

const SYMBOL_TO_ISO = { "€": "EUR", $: "USD", "د.إ": "AED" };
const ISO_TO_SYMBOL = { EUR: "€", USD: "$", AED: "د.إ" };

// Fallbacks when the VatRate collection has not been seeded. NL is the launch
// market; the rest are here so a missing row is never a silent 0%.
const FALLBACK_RATES = { NL: 21, BE: 21, DE: 19 };
const DEFAULT_COUNTRY = process.env.DEFAULT_VAT_COUNTRY || "NL";

/**
 * Normalises anything money-shaped to an ISO code.
 * Accepts symbols and lowercase, because both exist in the data already.
 */
const toCurrencyCode = (value) => {
  if (!value) return DEFAULT_CURRENCY;
  const raw = String(value).trim();
  if (SYMBOL_TO_ISO[raw]) return SYMBOL_TO_ISO[raw];
  const upper = raw.toUpperCase();
  return SUPPORTED_CURRENCIES.includes(upper) ? upper : DEFAULT_CURRENCY;
};

const toCurrencySymbol = (value) => ISO_TO_SYMBOL[toCurrencyCode(value)] || "€";

/** Formats for display. Not used for storage or for anything sent to Mollie. */
const formatMoney = (amount, currency) =>
  toCurrencySymbol(currency) + Number(amount || 0).toFixed(2);

/** The VAT rate for a country, from config, falling back sensibly. */
/**
 * Which country's VAT applies to an EU B2C sale of digital services.
 *
 * NOT simply "wherever the customer lives". A business established in one member
 * state whose cross-border B2C digital sales stay under EUR 10,000 for the year
 * may charge its OWN rate to every EU customer, and only switches to the
 * customer's rate once that threshold is passed or it opts in voluntarily.
 *
 * So this is a business position, not something derivable from an address, and
 * charging a German customer 19% purely because they typed a German address is
 * wrong while the seller is still below the threshold.
 *
 * `domestic`    - always the seller's own rate. The correct default: it is what
 *                 the system did before addresses existed, and it is right for
 *                 any seller under the threshold who has not opted in.
 * `destination` - the customer's own country rate. Correct once registered for
 *                 OSS, over the threshold, or voluntarily opted in.
 *
 * Non-EU customers are a separate question this does not attempt to answer.
 */
const VAT_MODE = (process.env.VAT_MODE || "domestic").toLowerCase();
const SELLER_COUNTRY = (process.env.SELLER_VAT_COUNTRY || DEFAULT_COUNTRY).toUpperCase();

/** The country whose rate applies, given the mode and the customer's country. */
const vatCountryFor = (customerCountry) =>
  VAT_MODE === "destination"
    ? (customerCountry || SELLER_COUNTRY).toUpperCase()
    : SELLER_COUNTRY;

const vatRateFor = async (countryCode) => {
  const code = (countryCode || DEFAULT_COUNTRY).toUpperCase();

  const configured = await VatRate.findOne({ countryCode: code });
  if (configured) return configured.ratePercent;

  const fallbackDefault = await VatRate.findOne({ isDefault: true });
  if (fallbackDefault) return fallbackDefault.ratePercent;

  return FALLBACK_RATES[code] !== undefined
    ? FALLBACK_RATES[code]
    : FALLBACK_RATES[DEFAULT_COUNTRY];
};

/**
 * Splits a VAT-inclusive price into its parts.
 *
 * Prices shown to customers already include VAT, so this divides out rather than
 * adding on: €19.99 at 21% is €16.52 net + €3.47 VAT, and the customer still
 * pays €19.99. Rounded to cents, with VAT taken as the remainder so the parts
 * always add back to the gross exactly.
 */
const vatBreakdown = async (grossAmount, countryCode, currency) => {
  // The customer's country is recorded either way — it is needed to know when
  // the EUR 10,000 threshold is crossed — but it only drives the RATE in
  // destination mode.
  const applicable = vatCountryFor(countryCode);
  const ratePercent = await vatRateFor(applicable);
  const gross = Math.round(Number(grossAmount || 0) * 100) / 100;
  const net = Math.round((gross / (1 + ratePercent / 100)) * 100) / 100;

  return {
    gross,
    net,
    vatAmount: Math.round((gross - net) * 100) / 100,
    ratePercent,
    // The country the rate came from — the seller's in domestic mode.
    countryCode: applicable,
    // Where the customer actually is, always recorded, so cross-border turnover
    // can be measured against the threshold regardless of mode.
    customerCountry: (countryCode || "").toUpperCase() || null,
    vatMode: VAT_MODE,
    currency: toCurrencyCode(currency),
  };
};

module.exports = {
  VAT_MODE,
  SELLER_COUNTRY,
  vatCountryFor,
  SUPPORTED_CURRENCIES,
  DEFAULT_CURRENCY,
  toCurrencyCode,
  toCurrencySymbol,
  formatMoney,
  vatRateFor,
  vatBreakdown,
};

/**
 * The authoritative price for an order.
 *
 * Checkout used to charge whatever `value` the browser posted, with the coupon
 * discount applied in the browser too — so a crafted request could buy any
 * challenge or plan for a cent. The price now comes from the database: the
 * challenge document for a one-off, PackageConfig for a plan, with the coupon
 * discount applied here.
 *
 * Throws an Error carrying `statusCode` when the order cannot be priced.
 */
const resolveOrderPrice = async ({ packageType, challengeIds = [], couponCode, couponId, userId }) => {
  const { Challenges } = require("../models/ChallengeModels/challengesModel");
  const { PackageConfig } = require("../models/PackageConfigModel/packageConfigModel");
  const { validateCoupon, applyDiscount } = require("./couponService");

  const fail = (message, statusCode = 400) => {
    const err = new Error(message);
    err.statusCode = statusCode;
    throw err;
  };

  let listPrice;
  let currency;
  let challengeId = null;

  if (packageType === "CHALLENGE_1") {
    challengeId = challengeIds[0];
    if (!challengeId) fail("No challenge was selected.", 400);

    const challenge = await Challenges.findById(challengeId).select("price currency challengeName");
    if (!challenge) fail("Challenge not found.", 404);

    listPrice = Number(challenge.price) || 0;
    currency = toCurrencyCode(challenge.currency);
  } else {
    const config = await PackageConfig.findOne({ packageId: packageType });
    if (!config) fail("Unknown package.", 400);
    if (config.isActive === false) fail("This package is not available.", 400);

    listPrice = Number(config.price) || 0;
    currency = toCurrencyCode(config.currency);
  }

  let coupon = null;
  let gross = Math.round(listPrice * 100) / 100;

  if (couponCode || couponId) {
    // A bad coupon fails the checkout rather than silently charging full price:
    // the customer has been shown the discounted total and must not be charged
    // more than they agreed to.
    coupon = await validateCoupon({
      code: couponCode,
      couponId,
      packageType,
      challengeId,
      userId,
    });
    gross = applyDiscount(listPrice, coupon.discountPercent);
  }

  return { gross, listPrice, currency, coupon };
};

module.exports.resolveOrderPrice = resolveOrderPrice;
