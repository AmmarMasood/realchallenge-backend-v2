const { createMollieClient } = require("@mollie/api-client");
const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const {
  ClientCredentials,
  ResourceOwnerPassword,
  AuthorizationCode,
} = require("simple-oauth2");
const {
  CustomerDetails,
} = require("../../models/UserModels/customerDetailsModel");
const { Membership } = require("../../models/MembershipModel/membershipModel");
const { User } = require("../../models/UserModels/userModel");
const dotenv = require("dotenv");
const { Challenges } = require("../../models/ChallengeModels/challengesModel");
const rp = require("request-promise");
const NotificationService = require("../../services/notificationService");

const { PackageConfig } = require("../../models/PackageConfigModel/packageConfigModel");
const {
  canViewUnpublished,
  isStaff,
} = require("../../middlewares/authMiddleware");
const { PendingOrder } = require("../../models/PaymentModel/pendingOrderModel");
const {
  extendNutritionAccess,
  grantFreeNutritionTrial,
} = require("../../services/nutritionAccess");
const { emails } = require("../../services/transactionalEmail");
const {
  vatBreakdown,
  toCurrencyCode,
  resolveOrderPrice,
} = require("../../services/pricing");
const { redeemCoupon } = require("../../services/couponService");
const { issueInvoiceForOrder, issueCreditNote } = require("../../services/invoicing");

// Purchase model:
//  - CHALLENGE_1 is a ONE-OFF purchase of a single challenge. It creates no
//    subscription and no membership, and may be repeated without limit.
//  - CHALLENGE_3 / CHALLENGE_12 are recurring subscriptions. Each carries a
//    `challengesAllowed` cap covering the challenges it includes.
// A subscriber who exhausts their cap falls back to buying one-off, exactly
// like a user with no subscription.
const SUBSCRIPTION_PACKAGES = ["CHALLENGE_3", "CHALLENGE_12"];
const isSubscriptionPackage = (packageId) =>
  SUBSCRIPTION_PACKAGES.includes(packageId);

/**
 * Whether a plan is currently working, mirrored from Mollie.
 *
 * There is deliberately NO date arithmetic here. Nothing in the system expires
 * on a timer: `Membership.isValid` holds Mollie's own subscription status and
 * the webhook keeps it in sync, so Mollie remains the single source of truth
 * about whether billing is healthy. `endTime` is kept for display only.
 */
// Days a user keeps access after a payment fails, while Mollie retries. Ours,
// not Mollie's: hard failures cancel with no retries at all, so we cannot hang
// the user's access off Mollie's retry clock.
const GRACE_DAYS = Number(process.env.PAYMENT_GRACE_DAYS || 5);

/** In the grace window: payment has failed but access is retained, with a warning. */
const isInGrace = (m) =>
  Boolean(
    m &&
      m.paymentStatus === "past_due" &&
      m.graceUntil &&
      Date.now() < new Date(m.graceUntil).getTime(),
  );

/** Grace has run out and the debt is unpaid, so the plan stops granting access. */
const isPaymentLocked = (m) =>
  Boolean(
    m &&
      m.paymentStatus === "past_due" &&
      m.graceUntil &&
      Date.now() >= new Date(m.graceUntil).getTime(),
  );

/**
 * Whether a plan is currently usable. Mollie's status says whether billing is
 * set up; `paymentStatus` says whether it is actually being paid. Both must be
 * good — a subscription Mollie still calls `active` while retrying a failed
 * charge stops covering challenges once our grace period expires.
 */
const isActiveMembership = (m) =>
  Boolean(m && m.isValid === "active" && !isPaymentLocked(m));

/**
 * The plan currently covering the user, or null when they have none working.
 * Cancelled, suspended and failed plans are simply not active, so they stop
 * covering new challenges — challenges already granted are never taken away.
 * The most recent active plan wins if a user resubscribed.
 */
const findSubscriptionMembership = (customerDetails) => {
  const active = (customerDetails?.membership || []).filter(
    (m) => isSubscriptionPackage(m && m.name) && isActiveMembership(m),
  );
  if (!active.length) return null;
  return active.sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
  )[0];
};

/** How many challenges a package includes; falls back if config is missing. */
const challengesAllowedFor = async (packageId) => {
  const config = await PackageConfig.findOne({ packageId });
  if (config && typeof config.challengesAllowed === "number") {
    return config.challengesAllowed;
  }
  return { CHALLENGE_1: 1, CHALLENGE_3: 2, CHALLENGE_12: 3 }[packageId] || 1;
};

// How long a plan-granted challenge holds its slot. A challenge is made of
// weeks, so its own length is the natural hold. Fall back when a challenge has
// no weeks defined yet, otherwise the slot would free the instant it is taken.
const DEFAULT_HOLD_WEEKS = 12;
const holdUntilFor = (challenge, from = new Date()) => {
  const weeks =
    (challenge && challenge.weeks && challenge.weeks.length) || DEFAULT_HOLD_WEEKS;
  const until = new Date(from);
  until.setDate(until.getDate() + weeks * 7);
  return until;
};

/** Challenge ids the user has finished, from either place completion is recorded. */
const completedChallengeIds = (customerDetails) => {
  const done = new Set(
    (customerDetails?.completedChallenges || []).map((c) => c.toString()),
  );
  for (const t of customerDetails?.trackChallenges || []) {
    if (t && t.challengeCompleted && t.challenge) done.add(t.challenge.toString());
  }
  return done;
};

/**
 * Slots currently occupied on a plan. A slot is taken while the challenge is
 * neither completed nor past its hold date — so finishing early frees it, and
 * abandoning it frees it once the programme would have ended anyway.
 */
const occupiedSlots = (membership, customerDetails) => {
  const done = completedChallengeIds(customerDetails);
  const now = Date.now();
  return (membership?.challenges || []).filter((entry) => {
    const id = (entry.challenge || entry).toString();
    if (done.has(id)) return false;
    // Entries written before slots existed have no holdUntil; treat as occupied.
    return !entry.holdUntil || now < new Date(entry.holdUntil).getTime();
  }).length;
};

/**
 * Public URL Mollie calls to report payment status changes, or null when none
 * is configured.
 *
 * Deliberately NOT derived from BACKEND_URL: that points at production, so a
 * developer's local payments would ask Mollie to notify the live server. Set
 * MOLLIE_WEBHOOK_URL explicitly — in local dev, to a tunnel (ngrok etc.).
 * Mollie rejects payment creation outright if the URL is not reachable, so a
 * localhost value is treated as "no webhook" rather than passed through.
 */
const mollieWebhookUrl = () => {
  const url = process.env.MOLLIE_WEBHOOK_URL;
  if (!url) return null;
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url)) {
    console.warn(
      "[Mollie] MOLLIE_WEBHOOK_URL is not publicly reachable; skipping webhook.",
    );
    return null;
  }
  return url;
};

const mollieApiKey = process.env.MOLLIE_API_KEY;
const mollieClient = createMollieClient({
  apiKey: mollieApiKey,
});

// Dev-only escape hatch while the Mollie account is not activated: fakes the
// payment/subscription steps so the rest of the purchase flow (membership,
// challenge grant) runs unchanged. Never active in production.
const mollieBypassEnabled = () =>
  process.env.MOLLIE_BYPASS === "true" && process.env.NODE_ENV !== "production";

const authorizeApp = async (req, res) => {
  const config = {
    client: {
      id: "app_F47JUr8qWSCa4mfsgK898rsQ",
      secret: "7ctU3RKqCTvjzuKz5jeS4ethTj7AKDjc4g5MDbby",
    },
    auth: {
      tokenHost: "https://www.mollie.com/oauth2/authorize",
    },
  };
  const client = new AuthorizationCode(config);

  const authorizationUri = client.authorizeURL({
    redirect_uri: process.env.REDIRECT_URL,
    scope: "payments.read customers.write customers.read",
    state:
      "$2a$10$qVjB1QgQ8G2Q8VcpdcG.eee7DRObvhpxd1V6SGiXcG.eee7DRObvhpxd1V6SGiXUEHbCihziJEMa",
    response_type: "code",
    approval_prompt: "force",
    locale: "en_US",
  });

  // console.log(authorizationUri);
  let code = authorizationUri.replace("oauth", "oauth2");
  // const tokenParams = {
  //   code: "<code>",
  //   redirect_uri: "http://localhost:3000/callback",
  //   scope: "<scope>",
  // };

  if (authorizationUri) {
    res.redirect(code);
    return;
    // res.status(200).json(code);
  }
};

const getAuthCode = async (req, res) => {
  // https://wonderful-jang-efe0e4.netlify.app/?code=auth_Vu4FN4JyD6t4yc9JCx8SAN7gjbhbr5&state=%242a%2410%24qVjB1QgQ8G2Q8VcpdcG.eee7DRObvhpxd1V6SGiXcG.eee7DRObvhpxd1V6SGiXUEHbCihziJEMa

  console.log("code", req.query.code);
  // console.log("state", req.query.state);
  /** Logic */
  res.json(req.query.code);
};

// const getAuthCode = async (req, res) => {
//   const config = {
//     client: {
//       id: process.env.CLIENT_ID,
//       secret: process.env.CLIENT_SECRET,
//     },
//     auth: {
//       tokenHost: "https://www.mollie.com/oauth2/authorize",
//     },
//   };
//   const client = new AuthorizationCode(config);
//   const authorizationUri = await client.authorizeURL({
//     redirect_uri: process.env.REDIRECT_URL,
//     scope:
//       "payments.read payments.write refunds.read refunds.write customers.read customers.write subscriptions.read subscriptions.write profiles.read profiles.write invoices.read orders.read orders.write organizations.read organizations.write onboarding.read onboarding.write",
//     state:
//       "$2a$10$qVjB1QgQ8G2Q8VcpdcG.eee7DRObvhpxd1V6SGiXcG.eee7DRObvhpxd1V6SGiXUEHbCihziJEMa",
//   });
//   // res.redirect(authorizationUri);
//   // const { code } = req.query;
//   // console.log(code);
//   if (authorizationUri) {
//     res.status(200).json({
//       authorizationUri,
//       // code,
//     });
//   } else {
//     res.status(200).json({
//       message: "error",
//     });
//   }
// };

const createCustomer = async (name, email) => {
  try {
    const customer = await mollieClient.customers.create({
      name: name,
      email: email,
    });
    console.log(customer);
    if (customer) {
      return customer;
    }
    return null;
  } catch (err) {
    console.log(err);
  }
};

const getAccessToken = () => {
  if (Object.keys(req.body).length === 0) {
    return res.status(500).json("Body fields cannot be empty.");
  }
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    const config = {
      client: {
        id: "app_F47JUr8qWSCa4mfsgK898rsQ",
        secret: "7ctU3RKqCTvjzuKz5jeS4ethTj7AKDjc4g5MDbby",
      },
      auth: {
        tokenHost: "https://api.mollie.com/oauth2/tokens",
      },
    };
    const client = new AuthorizationCode(config);
    const authCode = req.params.code;
    const accessToken = client.authorizeURL({
      grant_type: "authorization_code",
      code: authCode,
    });

    console.log(accessToken);
  } catch (err) {
    console.log(err);
  }
};

/**
 * Mollie's billingAddress shape, or null when we do not have a complete one.
 *
 * All-or-nothing on purpose: Mollie rejects a partial address rather than
 * ignoring it, so a half-filled profile must send nothing at all.
 */
const billingAddressFor = (user) => {
  if (!user) return null;
  const streetAndNumber = user.streetAndNumber || user.address;
  if (!streetAndNumber || !user.postalCode || !user.city || !user.country) {
    return null;
  }
  return {
    givenName: user.firstName || user.username || "Customer",
    familyName: user.lastName || "-",
    streetAndNumber,
    postalCode: user.postalCode,
    city: user.city,
    country: String(user.country).toUpperCase(),
    email: user.email,
  };
};

const createPayment = async (
  currency,
  value,
  description,
  redirectUrl,
  custId,
  // "first" sets up a mandate for later recurring charges and is only correct
  // for subscription packages; a one-off challenge purchase must not leave a
  // mandate behind (it used to, which is how "Billed once" became monthly).
  sequenceType = "first",
  // The buyer's billing address. Mollie never collects one for iDEAL, card or
  // SEPA — it is a field we SEND, and their guidance is to send it because it
  // improves fraud scoring and conversion. It is also what pay-later methods
  // (Klarna, in3, Riverty) require, so passing it keeps that door open.
  billingAddress = null,
) => {
  try {
    const webhookUrl = mollieWebhookUrl();
    const payment = await mollieClient.payments.create({
      amount: {
        currency: currency,
        value: value, // We enforce the correct number of decimals through strings
      },
      description: description, //Sunscription FREE or whatever
      redirectUrl: redirectUrl,
      // Lets Mollie confirm the payment even if the user never returns to the
      // site (closed the tab, lost connection) — the redirect alone is not a
      // reliable signal that a payment happened.
      ...(webhookUrl ? { webhookUrl } : {}),
      // No hardcoded method list: Mollie offers whatever the profile has
      // enabled, and filters to recurring-capable methods when sequenceType is
      // "first". The old list pinned "sofort" (removed by Mollie entirely) and
      // "banktransfer" (not activated), so enabling a method in the dashboard
      // required a code change.
      sequenceType,
      customerId: custId,
      // Omitted entirely when incomplete: a partial address is worse than none,
      // as Mollie rejects the call rather than ignoring the field.
      ...(billingAddress ? { billingAddress } : {}),
    });
    if (payment) {
      return payment;
    }
    return null;
  } catch (err) {
    console.log(err);
  }
};

//create first psyment
const createFirstPayment = async (req, res) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(500).json("Body fields cannot be empty.");
  }
  try {
    console.log("here in sub");
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    // Bypass: pretend the payment was created; the "checkout" link points
    // straight at our own redirect page, so the flow continues as if the
    // user paid and returned from Mollie.
    if (mollieBypassEnabled()) {
      console.warn(
        `[MollieBypass] Skipping payment creation for user ${req.body.id}`
      );
      return res.json({
        id: `bypass_payment_${Date.now()}`,
        customerId: `bypass_customer_${req.body.id}`,
        _links: { checkout: { href: req.body.redirectUrl } },
      });
    }

    const user = await User.findById(req.body.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const { name, email, description, redirectUrl } = req.body;
    // `description` is the customer-facing label (a challenge name for one-off
    // purchases); branch on the package id instead.
    const packageType = req.body.packageType || description;

    // Only a second *subscription* is refused. One-off challenge purchases are
    // unlimited, including for users who already hold a subscription — this
    // check used to reject every repeat purchase of any kind.
    if (isSubscriptionPackage(packageType) && user.subcriptionId) {
      return res.status(400).json({
        message:
          "Already Subcribed to Other Package. kindly revoke that subcription first.",
      });
    }

    // Reuse the Mollie customer across purchases instead of creating a new one
    // (and orphaning the old) on every checkout.
    let mollieId = user.mollieId;
    if (!mollieId) {
      const cust = await createCustomer(name, email);
      mollieId = cust && cust.id;
      if (!mollieId) {
        return res.status(400).json({ message: "Mollie API Error" });
      }
      await User.findByIdAndUpdate(
        user._id,
        { mollieId },
        { useFindAndModify: false, new: true },
      );
    }

    // Price the order from the database, never from the request. `value` and
    // the coupon discount used to be computed in the browser and posted here,
    // so a crafted request could buy anything for a cent.
    const challengeIds = Array.isArray(req.body.challengeIds)
      ? req.body.challengeIds
      : [];
    let priced;
    try {
      priced = await resolveOrderPrice({
        packageType,
        challengeIds,
        couponCode: req.body.couponCode,
        couponId: req.body.couponId,
        userId: user._id,
      });
    } catch (priceErr) {
      return res
        .status(priceErr.statusCode || 400)
        .json({ message: priceErr.message });
    }

    const currency = priced.currency;
    const value = priced.gross.toFixed(2);

    const claimed = Number(req.body.value);
    if (Number.isFinite(claimed) && Math.abs(claimed - priced.gross) > 0.005) {
      console.warn(
        `[pricing] client claimed ${claimed} for ${packageType}, charging ${value}`,
      );
    }

    const paymentInfo = await createPayment(
      currency,
      value,
      description,
      redirectUrl,
      mollieId,
      isSubscriptionPackage(packageType) ? "first" : "oneoff",
      billingAddressFor(user),
    );

    if (!paymentInfo) {
      return res.status(400).json({ message: "Mollie API Error" });
    }

    // Record what this payment is meant to buy. Fulfilment reads from here
    // after confirming the payment is paid, so the browser cannot claim a
    // different challenge — or claim one without paying at all.
    // Split the VAT now, at the rate in force on the day of sale — an invoice
    // must show the rate that applied when it was issued, not today's.
    const vat = await vatBreakdown(
      parseFloat(value),
      user.country || req.body.vatCountry,
      currency,
    );

    await PendingOrder.create({
      user: user._id,
      paymentId: paymentInfo.id,
      packageType,
      challenges: challengeIds,
      // Recorded with the order rather than the user: consent is given per
      // purchase, and the wording may change between purchases.
      consent: req.body.consent && req.body.consent.text
        ? {
            givenAt: new Date(),
            text: String(req.body.consent.text).slice(0, 1000),
            locale: req.body.consent.locale || null,
          }
        : undefined,
      // Redeemed at fulfilment, not now: applying a coupon happens before the
      // user reaches Mollie, so spending it here burned the code on every
      // abandoned checkout.
      coupon: priced.coupon ? priced.coupon._id : undefined,
      listAmount: priced.listPrice,
      amount: parseFloat(value),
      currency: toCurrencyCode(currency),
      vatCountry: vat.countryCode,
      vatRatePercent: vat.ratePercent,
      vatAmount: vat.vatAmount,
      netAmount: vat.net,
    });

    return res.json(paymentInfo);
  } catch (err) {
    console.error("createFirstPayment failed:", err);
    return res
      .status(500)
      .json({ message: "Payment could not be started.", reason: err.message });
  }
};

const createSubscription = async (req, res) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(500).json("Body fields cannot be empty.");
  }
  try {
    console.log("here in sub");
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }
    const user = await User.findById(req.body.id).populate("customerDetails");
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // `description` is the customer-facing label; the package id is what the
    // membership and every cap check are keyed on.
    const packageType = req.body.packageType || req.body.description;

    // One-off challenge purchases must never reach here: they create no
    // subscription and no membership, which is what makes them repeatable.
    if (!isSubscriptionPackage(packageType)) {
      return res.status(400).json({
        message: "One-time challenge purchases do not create a subscription.",
      });
    }

    // Only an existing *subscription* blocks a new one (skipped in bypass so
    // repeat test purchases don't dead-end on the redirect page)
    if (
      !mollieBypassEnabled() &&
      findSubscriptionMembership(user.customerDetails)
    ) {
      return res.status(400).json({
        message:
          "Already Subcribed to Other Package. kindly revoke that subcription first.",
      });
    }

    // Create customerDetails if it doesn't exist
    if (!user.customerDetails) {
      const newCustomerDetails = new CustomerDetails({});
      await newCustomerDetails.save();
      user.customerDetails = newCustomerDetails._id;
      await user.save();
      // Re-fetch user with populated customerDetails
      const updatedUser = await User.findById(req.body.id).populate(
        "customerDetails",
      );
      user.customerDetails = updatedUser.customerDetails;
    }

    {
      let subscription;
      if (mollieBypassEnabled()) {
        // Fake the Mollie subscription so membership + challenge grant
        // proceed exactly like a real purchase
        console.warn(
          `[MollieBypass] Skipping subscription creation for user ${req.body.id}`
        );
        const start = new Date();
        const next = new Date(start);
        next.setMonth(next.getMonth() + 1);
        subscription = {
          id: `bypass_sub_${Date.now()}`,
          description: req.body.description,
          status: "active",
          startDate: start.toISOString().slice(0, 10),
          nextPaymentDate: next.toISOString().slice(0, 10),
          amount: { currency: req.body.currency, value: req.body.value },
        };
      } else {
        subscription = await mollieClient.customers_subscriptions.create({
          customerId: req.body.custId,
          amount: {
            currency: req.body.currency,
            value: req.body.value,
          },
          // times: req.body.times,
          interval: req.body.interval,
          description: req.body.description,
          // webhookUrl: "https://webshop.example.org/subscriptions/webhook/",
        });
      }

      if (subscription) {
        let { id: subId } = subscription;
        if (subId) {
          console.log("Here update user", subId);
          const updatedUser = await User.findByIdAndUpdate(
            req.body.id,
            { subcriptionId: subId },
            {
              useFindAndModify: false,
              new: true,
            },
          );
          // const updatedCustDetails = new

          if (updatedUser) {
            let newMembership = new Membership({
              // Must be the package id (CHALLENGE_3 / CHALLENGE_12) — the cap
              // lookups match on it. Mollie's description is a display label.
              name: packageType,
              isValid: subscription.status,
              startTime: subscription.startDate,
              endTime: subscription.nextPaymentDate,
              price: subscription.amount.value,
              // coupons: req.body.coupons,
            });

            await newMembership.save();

            // $push, not assignment: assigning replaced the whole array, so a
            // later purchase silently destroyed the earlier membership.
            const updatedCustomerDetails =
              await CustomerDetails.findByIdAndUpdate(
                updatedUser.customerDetails, // customerDetails is already the ObjectId
                { $push: { membership: newMembership._id } },
                {
                  useFindAndModify: false,
                  new: true,
                },
              );
            // let customerDetails = new CustomerDetails({
            //   membership: newMembership,
            // });
            // await customerDetails.save();
            // updatedUser.customerDetails = await customerDetails._id;
            // await user.save();

            res.status(200).json({
              message: "Sucessfully Subcribed",
              subscription,
            });
          }
        } else {
          res.status(400).json({
            message: "Cannot be Subcribed",
          });
        }
      }
    }
  } catch (err) {
    console.log(err);
  }
};

/**
 * Adds a challenge to a user, applying every access rule in one place.
 *
 * `paid` means a payment for this challenge has been confirmed with Mollie.
 * Without it, only challenges the user is entitled to for free are granted:
 * FREE challenges, staff, the creator, or a plan that still has room. A paid
 * one-off can ONLY arrive through completeOrder — otherwise simply calling the
 * grant endpoint would hand out paid challenges.
 *
 * Returns the challenge id when granted, or null when it was already owned.
 * Throws { statusCode } for callers to surface.
 */
/**
 * How many free challenges the user already holds, counting an intensity group
 * as one — the same rule the browser applies, so the two cannot disagree.
 * Challenges being granted in this same call are excluded.
 */
const freeChallengeUnitsHeld = async (customerDetails, excludeIds = []) => {
  const owned = (customerDetails?.challenges || []).map((c) =>
    (c._id || c).toString(),
  );
  const skip = new Set(excludeIds.map(String));
  const ids = owned.filter((id) => !skip.has(id));
  if (!ids.length) return 0;

  const held = await Challenges.find({
    _id: { $in: ids },
    access: "FREE",
  }).select("intensityGroupId");

  const groups = new Set();
  let units = 0;
  for (const c of held) {
    if (c.intensityGroupId) {
      const key = c.intensityGroupId.toString();
      if (groups.has(key)) continue;
      groups.add(key);
    }
    units++;
  }
  return units;
};

const grantChallengeToUser = async (userId, challengeId, { paid = false } = {}) => {
  let user = await User.findById(userId).populate({
    path: "customerDetails",
    populate: { path: "membership" },
  });
  const challenge = await Challenges.findById(challengeId);

  if (!user) throw Object.assign(new Error("User not found."), { statusCode: 404 });
  if (!challenge)
    throw Object.assign(new Error("Challenge not found."), { statusCode: 404 });
  // Note: no `owns` here on purpose. Granting is about acquiring a challenge,
  // and an un-published one should not be newly acquirable even though existing
  // owners keep theirs. A force-deactivated one is refused outright.
  if (!canViewUnpublished(challenge, user))
    throw Object.assign(new Error("This challenge is not available."), {
      statusCode: 404,
    });

  if (!user.customerDetails) {
    const details = new CustomerDetails({});
    await details.save();
    user.customerDetails = details._id;
    await user.save();
    user = await User.findById(userId).populate({
      path: "customerDetails",
      populate: { path: "membership" },
    });
  }

  // An intensity group is bought as a unit: owning one variant owns them all.
  let challengeIdsToAdd = [challengeId];
  if (challenge.intensityGroupId) {
    const siblings = await Challenges.find({
      intensityGroupId: challenge.intensityGroupId,
    }).select("_id");
    challengeIdsToAdd = siblings.map((s) => s._id.toString());
  }

  const owned = user.customerDetails.challenges || [];
  const alreadyOwns = (id) => owned.some((c) => c.toString() === id);
  if (challengeIdsToAdd.every(alreadyOwns)) return null;

  const isFree = (challenge.access || []).includes("FREE");
  const isCreator = challenge.user && challenge.user.toString() === userId;

  // One free challenge at a time. This rule lived only in the browser, which
  // put up a "replace your free challenge?" prompt — so calling this endpoint
  // directly handed out unlimited free challenges. Swapping which one you hold
  // is done through POST /api/customerDetails/replace-free-challenge; this path
  // only ever grants a first one.
  if (isFree && !paid && !isCreator && !isStaff(user)) {
    const held = await freeChallengeUnitsHeld(user.customerDetails, challengeIdsToAdd);
    if (held > 0) {
      throw Object.assign(
        new Error(
          "You already have a free challenge. Replace it to start this one instead.",
        ),
        { statusCode: 409, code: "FREE_CHALLENGE_LIMIT" },
      );
    }
  }

  // A plan covers this challenge only while it still has unused slots.
  let subscription = null;
  if (!isFree) {
    const candidate = findSubscriptionMembership(user.customerDetails);
    if (candidate) {
      const allowed = await challengesAllowedFor(candidate.name);
      // Active-at-once, not a lifetime total: completed and lapsed challenges
      // release their slot.
      if (occupiedSlots(candidate, user.customerDetails) < allowed) {
        subscription = candidate;
      }
    }
  }

  const entitled =
    paid || isFree || isCreator || isStaff(user) || Boolean(subscription);
  if (!entitled) {
    throw Object.assign(new Error("This challenge requires payment."), {
      statusCode: 402,
    });
  }

  for (const id of challengeIdsToAdd) {
    if (!alreadyOwns(id)) owned.push(id);
  }
  await CustomerDetails.findByIdAndUpdate(
    user.customerDetails._id,
    { challenges: owned },
    { useFindAndModify: false },
  );

  // Only consume a plan slot when the plan is what granted it — a separately
  // paid one-off must not eat into the subscription's allowance.
  if (subscription && !paid) {
    await Membership.findByIdAndUpdate(
      subscription._id,
      {
        $push: {
          challenges: {
            challenge: challengeId,
            grantedAt: new Date(),
            holdUntil: holdUntilFor(challenge),
          },
        },
      },
      { useFindAndModify: false },
    );
  }

  // Nutrition access rides along with the challenge.
  //  - a paid one-off adds 30 days, stacking onto any remaining balance
  //  - a free challenge starts the once-per-account trial
  //  - a plan-covered grant changes nothing: the subscription already grants it
  if (paid && !subscription) {
    await extendNutritionAccess(user.customerDetails._id);
  } else if (isFree) {
    await grantFreeNutritionTrial(user.customerDetails._id);
  }

  await NotificationService.challengePurchased(challenge, userId);
  return challengeId;
};

/** Creates the Mollie subscription + Membership for a paid plan order. */
const startSubscriptionForOrder = async (order) => {
  const user = await User.findById(order.user);
  if (!user) throw new Error("User not found for order " + order.paymentId);

  if (!user.customerDetails) {
    const details = new CustomerDetails({});
    await details.save();
    user.customerDetails = details._id;
    await user.save();
  }

  // A customer may hold exactly one plan, and the only thing enforcing that
  // before this point is `user.subcriptionId` being set. If that pointer is
  // ever lost while a subscription is still live at Mollie — a cleared field, a
  // replacement that failed to save — the user ends up with two live
  // subscriptions and is silently billed for both. Sweep first: this is the
  // last moment we can guarantee it.
  await stopAllMollieSubscriptions(user);

  let subscription;
  if (mollieBypassEnabled()) {
    const start = new Date();
    const next = new Date(start);
    next.setMonth(next.getMonth() + 1);
    subscription = {
      id: `bypass_sub_${Date.now()}`,
      status: "active",
      startDate: start.toISOString().slice(0, 10),
      nextPaymentDate: next.toISOString().slice(0, 10),
      amount: { currency: order.currency, value: order.amount.toFixed(2) },
    };
  } else {
    const webhookUrl = mollieWebhookUrl();
    subscription = await mollieClient.customers_subscriptions.create({
      customerId: user.mollieId,
      amount: { currency: order.currency, value: order.amount.toFixed(2) },
      interval: "1 month",
      // Mollie requires this to be unique per customer, so it cannot be the
      // bare plan name: cancelling and re-subscribing to the same plan was
      // rejected with "A subscription with the same description already exists".
      description: `${order.packageType} #${order._id.toString().slice(-6)}`,
      // Each monthly charge calls this, which is the only way renewals and
      // failed renewals ever reach the app.
      ...(webhookUrl ? { webhookUrl } : {}),
    });
  }

  await User.findByIdAndUpdate(
    user._id,
    { subcriptionId: subscription.id },
    { useFindAndModify: false },
  );

  // The agreed term, in monthly charges. Read from config so the client can
  // change plan lengths without a code change.
  const config = await PackageConfig.findOne({ packageId: order.packageType });
  const commitmentMonths = (config && config.billingInterval) || 1;

  const membership = new Membership({
    name: order.packageType,
    isValid: subscription.status,
    startTime: subscription.startDate,
    endTime: subscription.nextPaymentDate,
    price: order.amount,
    currency: toCurrencyCode(order.currency),
    vatRatePercent: order.vatRatePercent,
    vatCountry: order.vatCountry,
    commitmentMonths,
    paymentsMade: 1, // the checkout payment itself
    autoRenew: true,
  });
  await membership.save();

  await CustomerDetails.findByIdAndUpdate(
    user.customerDetails,
    { $push: { membership: membership._id } },
    { useFindAndModify: false },
  );

  await emails.subscriptionStarted(user, {
    planName: membership.name,
    amount: order.amount,
    currency: order.currency,
    commitmentMonths,
    nextPaymentDate: subscription.nextPaymentDate,
  });

  return membership;
};

/** Grants the challenges recorded on a paid order, reusing the shared rules. */
const grantChallengesForOrder = async (order) => {
  const granted = [];
  for (const challengeId of order.challenges) {
    const result = await grantChallengeToUser(
      order.user.toString(),
      challengeId.toString(),
      { paid: true },
    );
    if (result) granted.push(result);
  }
  return granted;
};

/**
 * Applies a confirmed-paid order: starts the subscription if it is a plan,
 * grants the challenges, and marks the order completed.
 *
 * Shared by the return-from-Mollie path and the webhook, so whichever arrives
 * first fulfils and the other is a no-op. Callers MUST have confirmed payment.
 */
const fulfilOrder = async (order, payment = null) => {
  if (order.status === "completed") return [];

  if (order.kind === "recovery") {
    // Restores a plan the user already has: no challenges are granted, and no
    // new membership is created. The payment settled the arrears; this puts
    // billing back on its feet and lifts the lock.
    const user = await User.findById(order.user).populate({
      path: "customerDetails",
      populate: { path: "membership" },
    });
    const membership = (user?.customerDetails?.membership || [])
      .filter((m) => isSubscriptionPackage(m && m.name))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];

    if (user && membership) {
      await restoreBilling(user, membership, payment && payment.mandateId);
      await markPaymentRestored(user, membership);
      // The arrears payment counts towards the agreed term, and may be the one
      // that completes a cancellation already in flight.
      await recordSuccessfulCharge(user, membership);
    }

    order.status = "completed";
    order.completedAt = new Date();
    await order.save();
    return [];
  }

  if (isSubscriptionPackage(order.packageType)) {
    await startSubscriptionForOrder(order);
  }
  const granted = await grantChallengesForOrder(order);

  // Now that the money has moved. The update is conditional on the user not
  // already being in `couponUsers`, so the redirect and the webhook racing to
  // fulfil the same order cannot spend it twice.
  if (order.coupon) {
    await redeemCoupon(order.coupon, order.user);
  }

  order.status = "completed";
  order.completedAt = new Date();
  await order.save();

  // Receipt for the money that just moved. Sent after the order is marked
  // complete so a mail failure can never leave an unfulfilled paid order.
  const buyer = await User.findById(order.user);
  if (buyer) {
    await emails.paymentReceipt(buyer, {
      description: order.packageType,
      amount: order.amount,
      currency: order.currency,
      paidAt: order.completedAt,
    });
    // Accounting document for money that has already moved. Never throws, so a
    // failed invoice cannot undo a completed order.
    await issueInvoiceForOrder(order, buyer);
  }

  return granted;
};

/**
 * Re-syncs a membership with Mollie's own view of the subscription.
 *
 * This is the whole point of the webhook: rather than inferring health from a
 * date we computed, we ask Mollie what the subscription's status actually is
 * and mirror it. Mollie suspends a subscription after repeated failed charges,
 * so a broken card surfaces here as `suspended` and the plan stops covering
 * new challenges — without anything expiring on a timer.
 */
const syncSubscriptionFromMollie = async (subscriptionId) => {
  const user = await User.findOne({ subcriptionId: subscriptionId });
  if (!user || !user.customerDetails) {
    console.warn(`[Mollie webhook] No user for subscription ${subscriptionId}`);
    return;
  }

  const details = await CustomerDetails.findById(user.customerDetails).populate(
    "membership",
  );
  const membership = (details?.membership || [])
    .filter((m) => isSubscriptionPackage(m && m.name))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
  if (!membership) return;

  let subscription;
  try {
    subscription = await mollieClient.customers_subscriptions.get(
      subscriptionId,
      { customerId: user.mollieId },
    );
  } catch (err) {
    console.warn(
      `[Mollie webhook] Could not read subscription ${subscriptionId}: ${err.message}`,
    );
    return;
  }

  membership.isValid = subscription.status; // active | suspended | canceled | completed
  // Display only — the next billing date, never used to gate access.
  if (subscription.nextPaymentDate) {
    membership.endTime = subscription.nextPaymentDate;
  }
  await membership.save();

  console.log(
    `[Mollie webhook] subscription ${subscriptionId} → ${membership.isValid}`,
  );
  return { user, membership };
};

/**
 * A recurring charge failed. The user keeps access for the grace period while
 * Mollie retries; they are told a retry is coming rather than invited to pay
 * again, because a second payment alongside a retry can double-charge them.
 */
const markPaymentFailed = async (user, membership, { reversed = false } = {}) => {
  if (!membership) return;
  // Keep the original failure date — the clock starts at the first failure, not
  // at each retry, otherwise the grace period never ends.
  if (membership.paymentStatus === "past_due" && membership.graceUntil) return;

  const now = new Date();
  const graceUntil = new Date(now);
  graceUntil.setDate(graceUntil.getDate() + GRACE_DAYS);

  membership.paymentStatus = "past_due";
  membership.paymentFailedAt = now;
  membership.graceUntil = graceUntil;
  await membership.save();

  console.log(
    `[billing] payment failed for user ${user._id}; grace until ${graceUntil.toISOString()}`,
  );
  // A chargeback is not a retryable failure: Mollie will not try again and the
  // customer asked for the money back, so the "we'll retry, check your balance"
  // wording would be wrong.
  await (reversed ? emails.paymentReversed : emails.paymentFailed)(user, {
    amount: membership.price,
    currency: membership.currency,
    graceUntil,
  });
  try {
    await NotificationService.subscriptionNotification(
      "subscriptionExpiring",
      user._id.toString(),
      { daysLeft: GRACE_DAYS },
    );
  } catch (err) {
    console.warn("[billing] could not send payment-failed notice:", err.message);
  }
};

/** Payment came good — clear the grace state and restore access immediately. */
const markPaymentRestored = async (user, membership) => {
  if (!membership || membership.paymentStatus !== "past_due") return;
  membership.paymentStatus = "ok";
  membership.paymentFailedAt = undefined;
  membership.graceUntil = undefined;
  membership.suspensionNotifiedAt = undefined;
  await membership.save();
  console.log(`[billing] payment restored for user ${user._id}`);
  await emails.paymentRestored(user, { planName: membership.name });
};

/**
 * Counts a successful recurring charge against the plan's term.
 *
 * This is what makes the commitment real: the plan bills monthly, and once the
 * agreed number of charges is reached it rolls month to month. If the user has
 * already cancelled, this is also where billing is finally stopped — at the end
 * of the term, or after one month's notice.
 */
const recordSuccessfulCharge = async (user, membership) => {
  if (!membership) return;
  membership.paymentsMade = (membership.paymentsMade || 0) + 1;
  await membership.save();
  await finaliseCancellationIfDue(user, membership);
};

/**
 * Cancels the user's subscription at Mollie and stops future billing.
 *
 * Access is NOT withdrawn immediately: the membership keeps its `endTime`, so
 * the user retains what they paid for until the period ends and the plan then
 * lapses on its own. Challenges already granted are theirs to keep.
 *
 * Two error messages told users to "revoke that subscription first" while no
 * revoke path existed, leaving anyone who wanted to switch plans stuck.
 */
/** Cancels the subscription at Mollie, tolerating one that is already gone. */
const stopMollieSubscription = async (user) => {
  if (!user.subcriptionId || mollieBypassEnabled()) return;
  try {
    await mollieClient.customers_subscriptions.delete(user.subcriptionId, {
      customerId: user.mollieId,
    });
  } catch (err) {
    // Already absent at Mollie: carry on so our records still clear rather than
    // trapping the user in a subscription we think is live.
    if (err.statusCode !== 404 && err.status !== 404) throw err;
    console.warn(
      `[Mollie] subscription ${user.subcriptionId} already absent; clearing locally.`,
    );
  }
};

/**
 * Cancels every live subscription Mollie holds for this customer.
 *
 * `stopMollieSubscription` only stops the one `user.subcriptionId` points at.
 * When that pointer is stale — a bypass id, a replacement that never got saved
 * — the real subscription survives at Mollie, and because Mollie requires a
 * subscription description to be unique per customer, that orphan then blocks
 * every future create with "A subscription with the same description already
 * exists for this customer". Recovery failed with a 500 and no way out.
 *
 * Returns the ids it cancelled. Never throws: this runs on the path that is
 * trying to repair billing, and must not be the thing that breaks it.
 */
const stopAllMollieSubscriptions = async (user) => {
  if (!user.mollieId || mollieBypassEnabled()) return [];

  const cancelled = [];
  try {
    const page = await mollieClient.customers_subscriptions.page({
      customerId: user.mollieId,
    });
    // The client returns an array for a page; older shapes nest under _embedded.
    const subs = Array.isArray(page) ? page : page?._embedded?.subscriptions || [];

    for (const sub of subs) {
      if (!["active", "pending", "suspended"].includes(sub.status)) continue;
      try {
        await mollieClient.customers_subscriptions.delete(sub.id, {
          customerId: user.mollieId,
        });
        cancelled.push(sub.id);
      } catch (err) {
        if (err.statusCode !== 404 && err.status !== 404) {
          console.warn(`[Mollie] could not cancel ${sub.id}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.warn(`[Mollie] could not list subscriptions: ${err.message}`);
  }

  if (cancelled.length) {
    console.log(`[billing] cancelled stale subscriptions: ${cancelled.join(", ")}`);
  }
  return cancelled;
};

/**
 * A subscription description that is unique per customer, as Mollie requires,
 * while still reading sensibly on a bank statement. `membership.name` alone
 * collided with any earlier subscription on the same plan.
 */
const subscriptionDescription = (membership) =>
  `${membership.name} #${membership._id.toString().slice(-6)}`;

/**
 * Stops billing once the cancellation the user asked for has been served out —
 * the end of their committed term, or one month's notice on a rolling plan.
 * Called after each successful charge is counted.
 */
const finaliseCancellationIfDue = async (user, membership) => {
  if (!membership || membership.autoRenew !== false) return false;
  if (!membership.cancelAfterPayment) return false;
  if ((membership.paymentsMade || 0) < membership.cancelAfterPayment) return false;

  await stopMollieSubscription(user);
  await User.findByIdAndUpdate(
    user._id,
    { $unset: { subcriptionId: "" } },
    { useFindAndModify: false },
  );
  membership.isValid = "canceled";
  await membership.save();
  console.log(
    `[Mollie] subscription for user ${user._id} ended after ${membership.paymentsMade} payments`,
  );
  return true;
};

const cancelSubscription = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: "customerDetails",
      populate: { path: "membership" },
    });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const membership = findSubscriptionMembership(user.customerDetails);
    if (!user.subcriptionId && !membership) {
      return res
        .status(400)
        .json({ message: "You do not have an active subscription." });
    }
    if (membership && membership.autoRenew === false) {
      return res.status(400).json({
        message: "This subscription is already set to end.",
        endsAfterPayment: membership.cancelAfterPayment,
      });
    }

    // Cancelling never stops billing on the spot. Inside the agreed term the
    // plan runs to the end of it; once rolling monthly, one month's notice
    // applies. Either way we keep the Mollie subscription alive and stop it at
    // the right charge — see finaliseCancellationIfDue().
    const committed = membership ? membership.commitmentMonths || 0 : 0;
    const paid = membership ? membership.paymentsMade || 1 : 1;
    const inTerm = paid < committed;
    const cancelAfterPayment = inTerm ? committed : paid + 1;

    if (membership) {
      membership.autoRenew = false;
      membership.cancelAfterPayment = cancelAfterPayment;
      await membership.save();
    }

    // Nothing left to bill — stop it at Mollie now rather than waiting for a
    // charge that will never come.
    if (!membership) {
      await stopMollieSubscription(user);
      await User.findByIdAndUpdate(
        user._id,
        { $unset: { subcriptionId: "" } },
        { useFindAndModify: false },
      );
    }

    // Challenges already granted are deliberately left alone — the user keeps
    // what they unlocked; the plan simply stops covering new ones once it ends.
    if (membership) {
      await emails.subscriptionCancelled(user, {
        planName: membership.name,
        inCommittedTerm: inTerm,
        remainingPayments: Math.max(0, cancelAfterPayment - paid),
        endsOn: membership.endTime,
      });
    }

    return res.status(200).json({
      message: inTerm
        ? "Subscription will not renew. Billing continues to the end of your term."
        : "Subscription will end after one more monthly payment.",
      inCommittedTerm: inTerm,
      paymentsMade: paid,
      endsAfterPayment: cancelAfterPayment,
      remainingPayments: Math.max(0, cancelAfterPayment - paid),
    });
  } catch (err) {
    console.error("cancelSubscription failed:", err);
    return res
      .status(500)
      .json({ message: "Could not cancel subscription.", reason: err.message });
  }
};

/**
 * Mollie calls this whenever a payment changes status. It is unauthenticated by
 * design — Mollie sends only an id, and we treat that id as a lookup key, never
 * as a claim: the payment is re-read from Mollie before anything is granted.
 *
 * Always answers 200 once handled; a non-2xx makes Mollie retry.
 */
const handleWebhook = async (req, res) => {
  const paymentId = req.body && req.body.id;
  if (!paymentId) {
    return res.status(400).json({ message: "Missing payment id." });
  }

  try {
    const payment = await mollieClient.payments.get(paymentId);
    const order = await PendingOrder.findOne({ paymentId });

    if (order) {
      if (payment.isPaid()) {
        await fulfilOrder(order, payment);
      } else if (order.status !== "completed") {
        order.status = payment.status === "open" ? "pending" : "failed";
        await order.save();
      }
    }

    // A refunded payment gets a credit note; the original invoice stays put.
    if (payment.amountRefunded && Number(payment.amountRefunded.value) > 0) {
      await issueCreditNote(paymentId, {
        amount: Number(payment.amountRefunded.value),
      });
      const refunded = await User.findById(order ? order.user : null);
      if (refunded) {
        await emails.refundIssued(refunded, {
          amount: Number(payment.amountRefunded.value),
          currency: payment.amountRefunded.currency,
          description: order ? order.packageType : null,
        });
      }
    }

    // A chargeback: the payer told their bank to reverse a collected direct
    // debit, which SEPA allows for eight weeks. This is NOT a refund — the
    // payment stays `paid` and `amountRefunded` stays 0 — so checking only for
    // refunds let a reversal pass silently, leaving the customer with full
    // access and the books showing income that had gone back.
    const chargedBack =
      payment.amountChargedBack && Number(payment.amountChargedBack.value) > 0;

    if (chargedBack) {
      const amount = Number(payment.amountChargedBack.value);
      // Idempotent: a repeated webhook returns the existing note rather than
      // crediting twice.
      await issueCreditNote(paymentId, {
        amount,
        reason: `Chargeback for payment ${paymentId}`,
      });

      // Money has left the account, so this must always leave a trace even when
      // we cannot tie it to anything — an unattributable chargeback is exactly
      // the case someone needs to look at by hand.
      console.warn(
        `[billing] CHARGEBACK ${amount} ${payment.amountChargedBack.currency} on ${paymentId}` +
          (payment.subscriptionId ? ` (subscription ${payment.subscriptionId})` : " (no subscription)"),
      );

      // The order is the best link, but a renewal has no order — fall back to
      // the Mollie customer, which every recurring collection carries.
      let owner = order ? await User.findById(order.user).catch(() => null) : null;
      if (!owner && payment.customerId) {
        owner = await User.findOne({ mollieId: payment.customerId }).catch(() => null);
      }

      if (payment.subscriptionId) {
        // Treat it as a failed payment: same grace clock, so a reversal made by
        // mistake can be put right, and an intentional one still ends in a lock.
        const synced = await syncSubscriptionFromMollie(payment.subscriptionId);
        if (synced) {
          await markPaymentFailed(synced.user, synced.membership, { reversed: true });
        }
      } else if (owner) {
        // No subscription on the payment. If the user holds a plan, treat it as
        // a failed payment for that plan; otherwise this was a one-off, which is
        // permanent by design — revoking it is a bigger call than this webhook
        // should make unprompted, so it is flagged for a human instead.
        const holder = await User.findById(owner._id).populate({
          path: "customerDetails",
          populate: { path: "membership" },
        });
        const membership = findSubscriptionMembership(holder && holder.customerDetails);

        if (membership) {
          await markPaymentFailed(holder, membership, { reversed: true });
        } else {
          console.warn(
            `[billing] chargeback on a one-off purchase by user ${owner._id} — ` +
              "access left in place, needs review",
          );
        }
      } else {
        console.warn(
          `[billing] chargeback ${paymentId} could not be attributed to a user — needs review`,
        );
      }
    }

    // Any payment tied to a subscription — the first charge or a later renewal
    // — is a chance to re-check that the subscription is still healthy.
    if (payment.subscriptionId) {
      const synced = await syncSubscriptionFromMollie(payment.subscriptionId);
      // Only a recurring charge advances the term. The very first payment is
      // already counted when the membership is created.
      if (synced && payment.sequenceType === "recurring") {
        // `isPaid()` is still true for a charged-back payment — the money went
        // out and then came back. Without this guard the reversal handled above
        // would be undone here, restoring the very access it just withdrew.
        if (payment.isPaid() && !chargedBack) {
          await markPaymentRestored(synced.user, synced.membership);
          await recordSuccessfulCharge(synced.user, synced.membership);
        } else if (["failed", "expired", "canceled"].includes(payment.status)) {
          await markPaymentFailed(synced.user, synced.membership);
          // A later retry failing may be the one that takes them past grace.
          await notifySuspensionIfDue(synced.user, synced.membership);
        }
      }
    }

    return res.status(200).send("OK");
  } catch (err) {
    // 500 asks Mollie to retry, which is what we want for a transient failure.
    console.error(`[Mollie webhook] ${paymentId} failed:`, err);
    return res.status(500).send("error");
  }
};

/** The customer's currently valid mandate at Mollie, or null. */
const findValidMandate = async (user) => {
  // Bypass stands in for a healthy Mollie: pretend the mandate is fine so the
  // rest of the recovery path can be exercised without network calls.
  if (mollieBypassEnabled()) return { id: `bypass_mandate_${user._id}` };
  if (!user.mollieId) return null;
  try {
    const result = await mollieClient.customers_mandates.page({
      customerId: user.mollieId,
    });
    // The client returns a plain array here, not the raw `_embedded` envelope
    // the REST API uses. Handle both so a client upgrade cannot silently empty
    // this list and push every recovery down the re-authorisation path.
    const mandates = Array.isArray(result)
      ? result
      : (result && result._embedded && result._embedded.mandates) || [];
    return mandates.find((m) => m.status === "valid") || null;
  } catch (err) {
    console.warn(`[Mollie] could not list mandates: ${err.message}`);
    return null;
  }
};

/** Mollie's current view of the user's subscription, or null if it is gone. */
const fetchSubscription = async (user) => {
  if (!user.subcriptionId || mollieBypassEnabled()) return null;
  try {
    return await mollieClient.customers_subscriptions.get(user.subcriptionId, {
      customerId: user.mollieId,
    });
  } catch (err) {
    return null;
  }
};

/**
 * Puts billing back on its feet after a failure, using whichever route the
 * subscription's state allows.
 *
 * A cancelled Mollie subscription cannot be resumed, and attaching a mandate to
 * a suspended one is not documented to reactivate it — so we try the cheap route
 * first, read the status back, and fall through to a replacement rather than
 * assuming. The replacement carries the original amount and interval, and starts
 * one interval out: the payment that triggered this recovery has already settled
 * what was owed, so charging again immediately would double-charge.
 */
const restoreBilling = async (user, membership, mandateId) => {
  const existing = await fetchSubscription(user);

  if (existing && existing.status === "suspended" && mandateId) {
    try {
      await mollieClient.customers_subscriptions.update(user.subcriptionId, {
        customerId: user.mollieId,
        mandateId,
      });
      const after = await fetchSubscription(user);
      if (after && after.status === "active") {
        console.log(`[billing] subscription ${user.subcriptionId} reactivated`);
        return { mode: "reactivated", subscriptionId: user.subcriptionId };
      }
    } catch (err) {
      console.warn(`[Mollie] could not attach mandate: ${err.message}`);
    }
  }

  if (existing && existing.status === "active") {
    return { mode: "already-active", subscriptionId: user.subcriptionId };
  }

  // Replacement. Every live subscription at Mollie is stopped first — not just
  // the one we have an id for — so the customer cannot end up with two, and so
  // an orphan we lost track of cannot block the create on its description.
  await stopMollieSubscription(user);
  await stopAllMollieSubscriptions(user);

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() + 1);

  let created;
  if (mollieBypassEnabled()) {
    created = { id: `bypass_sub_${Date.now()}`, status: "active" };
  } else {
    created = await mollieClient.customers_subscriptions.create({
      customerId: user.mollieId,
      amount: {
        currency: membership.currency || "EUR",
        value: Number(membership.price).toFixed(2),
      },
      interval: "1 month",
      description: subscriptionDescription(membership),
      startDate: startDate.toISOString().slice(0, 10),
      ...(mandateId ? { mandateId } : {}),
      ...(mollieWebhookUrl() ? { webhookUrl: mollieWebhookUrl() } : {}),
    });
  }

  await User.findByIdAndUpdate(
    user._id,
    { subcriptionId: created.id },
    { useFindAndModify: false },
  );
  console.log(`[billing] replacement subscription ${created.id} for user ${user._id}`);
  return { mode: "replaced", subscriptionId: created.id };
};

/**
 * Tells a user their access is on hold, once the grace period has lapsed.
 *
 * Only safe at this point: while Mollie was still retrying, inviting a payment
 * could have charged them twice. Sent at most once per failure — `graceUntil` is
 * cleared when payment is restored, so a new failure starts a fresh cycle.
 */
const notifySuspensionIfDue = async (user, membership) => {
  if (!isPaymentLocked(membership) || membership.suspensionNotifiedAt) return;
  membership.suspensionNotifiedAt = new Date();
  await membership.save();
  await emails.accessSuspended(user, {
    recoveryUrl: process.env.FRONTEND_ADD
      ? `${process.env.FRONTEND_ADD}/user/settings`
      : null,
  });
};

/**
 * Starts recovery for a user whose subscription payment has failed.
 *
 * Deliberately refuses while Mollie is still retrying: a manual payment
 * alongside an automatic retry can charge the customer twice. The user is only
 * offered this once the grace period has expired or Mollie has given up.
 */
const recoverSubscription = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: "customerDetails",
      populate: { path: "membership" },
    });
    if (!user) return res.status(404).json({ message: "User not found." });

    const membership = (user.customerDetails?.membership || [])
      .filter((m) => isSubscriptionPackage(m && m.name))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];

    if (!membership) {
      return res.status(400).json({ message: "You have no subscription to restore." });
    }

    // Only treat Mollie as having given up if we actually saw a dead
    // subscription. A null here means "could not read it" — under bypass, or a
    // transient API failure — and must not be read as licence to start
    // recovery for someone whose billing is fine.
    const subscription = await fetchSubscription(user);
    const mollieGaveUp = Boolean(
      subscription && ["suspended", "canceled"].includes(subscription.status),
    );

    if (membership.paymentStatus !== "past_due" && !mollieGaveUp) {
      return res.status(400).json({ message: "Your subscription is not in arrears." });
    }
    if (isInGrace(membership) && !mollieGaveUp) {
      return res.status(409).json({
        message:
          "A retry is still in progress. Please make sure your account has funds — we will try again automatically.",
        retryInProgress: true,
        graceUntil: membership.graceUntil,
      });
    }

    // Cancelled but the mandate survived: no need to trouble the user at all.
    const mandate = await findValidMandate(user);
    if (mandate) {
      const result = await restoreBilling(user, membership, mandate.id);
      await markPaymentRestored(user, membership);
      return res.status(200).json({ restored: true, ...result });
    }

    // No usable mandate — the user must re-authorise with a first payment.
    const payment = await createPayment(
      membership.currency || "EUR",
      Number(membership.price).toFixed(2),
      membership.name,
      req.body.redirectUrl,
      user.mollieId,
      "first",
      billingAddressFor(user),
    );
    if (!payment) {
      return res.status(400).json({ message: "Could not start the payment." });
    }

    await PendingOrder.create({
      user: user._id,
      paymentId: payment.id,
      packageType: membership.name,
      kind: "recovery",
      challenges: [],
      amount: membership.price,
      currency: membership.currency || "EUR",
    });

    return res.status(200).json({
      restored: false,
      requiresAuthorisation: true,
      checkoutUrl: payment._links.checkout.href,
      paymentId: payment.id,
    });
  } catch (err) {
    console.error("recoverSubscription failed:", err);
    return res
      .status(500)
      .json({ message: "Could not restore the subscription.", reason: err.message });
  }
};

// A just-started challenge can be swapped or dropped, but only briefly: the
// rule is that people commit to a programme rather than hop between them.
// Configurable so the window can be tuned without a code change.
const SWAP_WINDOW_HOURS = Number(process.env.CHALLENGE_SWAP_WINDOW_HOURS || 24);
const SWAP_MAX_WORKOUTS = Number(process.env.CHALLENGE_SWAP_MAX_WORKOUTS || 1);

/** Workouts the user has completed in a given challenge. */
const workoutsCompletedIn = (customerDetails, challengeId) => {
  const entry = (customerDetails?.trackChallenges || []).find(
    (t) => t && t.challenge && t.challenge.toString() === challengeId.toString(),
  );
  return entry ? (entry.completedWorkouts || []).length : 0;
};

/**
 * Whether a plan-granted challenge is still inside its swap window.
 *
 * Both conditions must hold: recently taken, and barely started. Someone who has
 * worked through the programme has committed to it, however recently they began.
 */
const swapEligibility = (membership, customerDetails, challengeId) => {
  const entry = (membership?.challenges || []).find(
    (e) => e && e.challenge && e.challenge.toString() === challengeId.toString(),
  );
  if (!entry) {
    return { eligible: false, reason: "This challenge did not come from your plan." };
  }

  const grantedAt = entry.grantedAt ? new Date(entry.grantedAt) : null;
  const hoursSince = grantedAt ? (Date.now() - grantedAt.getTime()) / 3600000 : Infinity;
  if (hoursSince > SWAP_WINDOW_HOURS) {
    return {
      eligible: false,
      reason:
        "Challenges can only be changed within " +
        SWAP_WINDOW_HOURS +
        " hours of starting them.",
    };
  }

  const done = workoutsCompletedIn(customerDetails, challengeId);
  if (done > SWAP_MAX_WORKOUTS) {
    return { eligible: false, reason: "You have already started this challenge." };
  }

  return { eligible: true, entry, hoursSince, workoutsCompleted: done };
};

/**
 * Removes a challenge from the user and frees its plan slot.
 *
 * Progress is deliberately left intact — history is never wiped, so if the
 * challenge is taken up again later it resumes where it left off.
 */
const releaseChallenge = async (user, membership, challengeId) => {
  await CustomerDetails.updateOne(
    { _id: user.customerDetails._id },
    { $pull: { challenges: challengeId } },
  );
  await Membership.updateOne(
    { _id: membership._id },
    { $pull: { challenges: { challenge: challengeId } } },
  );
};

/** Loads the user with everything the swap rules need to look at. */
const loadUserForSwap = async (userId) =>
  User.findById(userId).populate({
    path: "customerDetails",
    populate: { path: "membership" },
  });

/**
 * Drops a just-started challenge and frees the slot.
 * POST { challengeId }
 */
/**
 * Admin: takes a challenge away from one customer.
 *
 * The counterpart to a refund. Refunds are issued by hand in the Mollie
 * dashboard and a credit note is raised automatically from the webhook, but
 * nothing removed the customer's access — so a refunded customer kept the
 * product. This is that missing half.
 *
 * Deliberately NOT the same as the customer-facing cancel: there is no 24-hour
 * window and no workout limit, because an admin acting on a refund is not
 * bound by the swap rules. It frees the plan slot if the challenge came from
 * one, and simply removes ownership if it was a one-off purchase.
 */
const adminRevokeChallengeAccess = async (req, res) => {
  try {
    const { userId, challengeId } = req.body;
    if (!userId || !challengeId) {
      return res
        .status(400)
        .json({ message: "userId and challengeId are required." });
    }

    const user = await User.findById(userId).populate({
      path: "customerDetails",
      populate: { path: "membership" },
    });
    if (!user || !user.customerDetails) {
      return res.status(404).json({ message: "Customer not found." });
    }

    const owned = (user.customerDetails.challenges || []).map((c) =>
      (c._id || c).toString(),
    );
    if (!owned.includes(challengeId.toString())) {
      return res
        .status(404)
        .json({ message: "This customer does not own that challenge." });
    }

    await CustomerDetails.updateOne(
      { _id: user.customerDetails._id },
      { $pull: { challenges: challengeId } },
    );

    // If it came from a plan, give the slot back rather than leaving it burnt.
    const membership = findSubscriptionMembership(user.customerDetails);
    let slotFreed = false;
    if (membership) {
      const before = (membership.challenges || []).length;
      await Membership.updateOne(
        { _id: membership._id },
        { $pull: { challenges: { challenge: challengeId } } },
      );
      const after = await Membership.findById(membership._id).select("challenges");
      slotFreed = (after?.challenges || []).length < before;
    }

    const challenge = await Challenges.findById(challengeId).select("challengeName");
    console.log(
      `[admin] ${req.user._id} revoked "${challenge?.challengeName}" from user ${userId}` +
        (slotFreed ? " (plan slot freed)" : ""),
    );

    return res.status(200).json({
      revoked: true,
      challengeId,
      challengeName: challenge?.challengeName || null,
      slotFreed,
    });
  } catch (err) {
    console.error("adminRevokeChallengeAccess failed:", err);
    return res
      .status(500)
      .json({ message: "Could not revoke access.", reason: err.message });
  }
};

const cancelChallenge = async (req, res) => {
  try {
    const { challengeId } = req.body;
    if (!challengeId) {
      return res.status(400).json({ message: "challengeId is required." });
    }

    const user = await loadUserForSwap(req.user._id);
    const membership = findSubscriptionMembership(user && user.customerDetails);
    if (!membership) {
      return res.status(400).json({ message: "You have no active plan." });
    }

    const check = swapEligibility(membership, user.customerDetails, challengeId);
    if (!check.eligible) {
      return res.status(409).json({ message: check.reason });
    }

    await releaseChallenge(user, membership, challengeId);
    return res.status(200).json({ released: true, challengeId });
  } catch (err) {
    console.error("cancelChallenge failed:", err);
    return res
      .status(500)
      .json({ message: "Could not cancel the challenge.", reason: err.message });
  }
};

/**
 * Exchanges a just-started challenge for a different one.
 * POST { fromChallengeId, toChallengeId }
 *
 * The slot is freed first so the incoming grant has room. If that grant fails —
 * unpublished, already owned, whatever — the original is put back, so a failed
 * swap leaves the user where they started rather than with neither challenge.
 */
const swapChallenge = async (req, res) => {
  try {
    const { fromChallengeId, toChallengeId } = req.body;
    if (!fromChallengeId || !toChallengeId) {
      return res
        .status(400)
        .json({ message: "fromChallengeId and toChallengeId are required." });
    }
    if (fromChallengeId === toChallengeId) {
      return res.status(400).json({ message: "Those are the same challenge." });
    }

    const user = await loadUserForSwap(req.user._id);
    const membership = findSubscriptionMembership(user && user.customerDetails);
    if (!membership) {
      return res.status(400).json({ message: "You have no active plan." });
    }

    const check = swapEligibility(membership, user.customerDetails, fromChallengeId);
    if (!check.eligible) {
      return res.status(409).json({ message: check.reason });
    }

    await releaseChallenge(user, membership, fromChallengeId);
    try {
      await grantChallengeToUser(req.user._id.toString(), toChallengeId);
    } catch (err) {
      await CustomerDetails.updateOne(
        { _id: user.customerDetails._id },
        { $addToSet: { challenges: fromChallengeId } },
      );
      await Membership.updateOne(
        { _id: membership._id },
        { $push: { challenges: check.entry } },
      );
      return res.status(err.statusCode || 400).json({
        message: "Could not swap - your original challenge has been kept.",
        reason: err.message,
      });
    }

    return res
      .status(200)
      .json({ swapped: true, from: fromChallengeId, to: toChallengeId });
  } catch (err) {
    console.error("swapChallenge failed:", err);
    return res
      .status(500)
      .json({ message: "Could not swap the challenge.", reason: err.message });
  }
};

/**
 * Whether a challenge can still be changed, so the UI can show or hide the
 * option rather than only finding out when the user tries.
 * GET ?challengeId=...
 */
const getSwapEligibility = async (req, res) => {
  try {
    const { challengeId } = req.query;
    if (!challengeId) {
      return res.status(400).json({ message: "challengeId is required." });
    }
    const user = await loadUserForSwap(req.user._id);
    const membership = findSubscriptionMembership(user && user.customerDetails);
    if (!membership) return res.json({ eligible: false, reason: "No active plan." });

    const check = swapEligibility(membership, user.customerDetails, challengeId);
    return res.json({
      eligible: check.eligible,
      reason: check.reason || null,
      windowHours: SWAP_WINDOW_HOURS,
      hoursRemaining: check.eligible
        ? Math.max(0, SWAP_WINDOW_HOURS - check.hoursSince)
        : 0,
    });
  } catch (err) {
    console.error("getSwapEligibility failed:", err);
    return res.status(500).json({ message: "Could not check." });
  }
};

/**
 * Fulfils a checkout after verifying with Mollie that it was actually paid.
 * This is the ONLY way a paid challenge or a subscription is granted.
 *
 * Returning from Mollie means nothing on its own: the redirect fires for
 * cancelled, failed and expired payments, and for the "Previous page" button.
 * So we ignore what the browser says and re-read the payment from Mollie.
 */
const completeOrder = async (req, res) => {
  try {
    const { paymentId } = req.body;
    if (!paymentId) {
      return res.status(400).json({ message: "paymentId is required." });
    }

    const order = await PendingOrder.findOne({ paymentId });
    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not your order." });
    }

    // Idempotent: a refreshed or replayed redirect must not grant twice.
    if (order.status === "completed") {
      return res.status(200).json({ status: "completed", alreadyApplied: true });
    }

    // Read the payment once: it both proves the payment happened and carries
    // the mandate a recovery needs.
    let payment = null;
    if (!mollieBypassEnabled()) {
      payment = await mollieClient.payments.get(paymentId);
      if (!payment || !payment.isPaid()) {
        const status = payment ? payment.status : "unknown";
        order.status = status === "open" ? "pending" : "failed";
        await order.save();
        return res
          .status(402)
          .json({ message: "Payment not completed.", status });
      }
    }

    const granted = await fulfilOrder(order, payment);
    return res.status(200).json({ status: "completed", granted });
  } catch (err) {
    console.error("completeOrder failed:", err);
    return res
      .status(500)
      .json({ message: "Could not complete order.", reason: err.message });
  }
};

const updateChallengeOnSubscription = async (req, res) => {
  console.log("updateChallengeOnSubscription", req.body);
  if (Object.keys(req.body).length === 0) {
    return res.status(500).json("Body fields cannot be empty.");
  }
  try {
    console.log("in try");
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }
    // Identity comes from the verified token. Trusting req.body.userId let any
    // caller grant challenges to any account.
    const userId = req.user._id.toString();

    // No `paid` flag here: this endpoint only ever hands out what the user is
    // already entitled to (free, plan-covered, staff, creator). Anything that
    // has to be bought goes through completeOrder after Mollie confirms it.
    await grantChallengeToUser(userId, req.body.challengeId);

    const customerDetails = await CustomerDetails.findById(
      (await User.findById(userId)).customerDetails,
    );
    return res.status(200).json(customerDetails);
  } catch (err) {
    console.error("updateChallengeOnSubscription failed:", err);
    res.status(err.statusCode || 400).json({
      message: err.statusCode === 402 ? err.message : "Cannot be Subcribed",
      reason: err.message,
    });
  }
};

const getPaymentStatus = async (req, res) => {
  // if (Object.keys(req.body).length === 0) {
  //   return res.status(500).json("Body fields cannot be empty.");
  // }
  try {
    // console.log("here in sub");
    // const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    // if (!errors.isEmpty()) {
    //   res.status(422).json({ errors: errors.array() });
    //   return;
    // }

    const payment = await mollieClient.payments.get("tr_zxRyCM6R8T");
    if (payment) {
      return res.status(200).json({
        messgae: "Payment status fetched successfully!",
        payment,
      });
    } else {
      return res.status(200).json({
        messgae: "Payment status cannot be fetched!",
      });
    }
  } catch (err) {
    console.log(err);
  }
};
const listSubscriptionPayments = async (req, res) => {
  const { subId, custId } = req.body;
  const payment = await mollieClient.customers_subscriptions(subId, {
    customerId: custId,
  });
  if (payment) {
    return res.status(200).json({
      messgae: "Sunscription Payment fetched successfully!",
      payment,
    });
  } else {
    return res.status(200).json({
      messgae: "Payment status cannot be fetched!",
    });
  }
};

const getCustomerSubscribtionInformation = async (req, res) => {
  const { customerId } = req.params;
  const requestOptions = {
    method: "GET",
    uri: `https://api.mollie.com/v2/customers/${customerId}/subscriptions`,
    headers: {
      Accepts: "application/json",
      Authorization: `Bearer ${mollieApiKey}`,
    },
  };

  const response = await rp(requestOptions);
  if (response) {
    return res.status(200).json({
      response,
    });
  } else {
    return res.status(200).json({
      messgae: "Unable to get user information",
    });
  }
};

const destroy = asyncHandler(async (req, res, next) => {
  try {
    await Membership.deleteMany({});

    console.log("deletesd");
    res.status(200).send({
      status: "Successfully removed all Membership files",
    });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

module.exports = {
  // Pure rule helpers, exported so they can be unit-tested without a database.
  isActiveMembership,
  isInGrace,
  isPaymentLocked,
  isSubscriptionPackage,
  findSubscriptionMembership,
  holdUntilFor,
  completedChallengeIds,
  occupiedSlots,
  swapEligibility,
  workoutsCompletedIn,
  // getAuthCode,
  authorizeApp,
  createCustomer,
  getAccessToken,
  getAuthCode,
  createPayment,
  createFirstPayment,
  createSubscription,
  completeOrder,
  handleWebhook,
  cancelSubscription,
  recoverSubscription,
  cancelChallenge,
  swapChallenge,
  adminRevokeChallengeAccess,
  getSwapEligibility,
  getPaymentStatus,
  listSubscriptionPayments,
  updateChallengeOnSubscription,
  getCustomerSubscribtionInformation,
  destroy,
};
