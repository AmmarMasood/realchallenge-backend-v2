/**
 * Who may use the Nutrition tab.
 *
 * Three tiers, per the client's rules:
 *  - active subscriber   -> unlimited access while the plan is being paid for
 *  - one-off buyer       -> 30 days per paid challenge, stacking
 *  - free-challenge user -> a single 30-day trial, once per account, ever
 *
 * Workout stats, weight tracking and the rest of the platform are open to every
 * registered user and are NOT gated here.
 */
const { User } = require("../models/UserModels/userModel");
const { CustomerDetails } = require("../models/UserModels/customerDetailsModel");

// Days added per paid single-challenge purchase, and the length of the free
// trial. Configurable so the client can tune it without a code change.
const NUTRITION_DAYS_PER_PURCHASE = Number(
  process.env.NUTRITION_DAYS_PER_PURCHASE || 30,
);

const SUBSCRIPTION_PACKAGES = ["CHALLENGE_3", "CHALLENGE_12"];

/**
 * A plan grants the Nutrition tab while it is active AND actually being paid
 * for — the same two conditions that govern challenge access, so a subscriber
 * in arrears loses nutrition at the same moment they lose everything else.
 */
const hasActivePlan = (customerDetails) =>
  (customerDetails?.membership || []).some((m) => {
    if (!m || !SUBSCRIPTION_PACKAGES.includes(m.name)) return false;
    if (m.isValid !== "active") return false;
    const lockedOut =
      m.paymentStatus === "past_due" &&
      m.graceUntil &&
      Date.now() >= new Date(m.graceUntil).getTime();
    return !lockedOut;
  });

/** Days bought via one-off purchases or the free trial, if any remain. */
const hasBalance = (customerDetails) =>
  Boolean(
    customerDetails?.nutritionAccessUntil &&
      Date.now() < new Date(customerDetails.nutritionAccessUntil).getTime(),
  );

/**
 * Full access state, shaped for the UI so it can show the right upgrade prompt
 * rather than a bare yes/no.
 */
const nutritionAccessFor = (customerDetails) => {
  const viaPlan = hasActivePlan(customerDetails);
  const until = customerDetails?.nutritionAccessUntil || null;
  const viaBalance = hasBalance(customerDetails);
  return {
    allowed: viaPlan || viaBalance,
    source: viaPlan ? "subscription" : viaBalance ? "purchase" : null,
    // Meaningless for subscribers — their access has no end date.
    accessUntil: viaPlan ? null : until,
    daysLeft:
      !viaPlan && viaBalance
        ? Math.ceil((new Date(until).getTime() - Date.now()) / 86400000)
        : null,
    freeTrialUsed: Boolean(customerDetails?.freeNutritionTrialUsed),
  };
};

/**
 * Adds days to the balance, stacking onto whatever is left.
 *
 * Stacking from the later of "now" and the current expiry is what stops a user
 * losing unused days when they buy again mid-balance — 10 days left plus a new
 * purchase becomes 40, not 30.
 */
const extendNutritionAccess = async (
  customerDetailsId,
  days = NUTRITION_DAYS_PER_PURCHASE,
) => {
  const details = await CustomerDetails.findById(customerDetailsId);
  if (!details) return null;

  const now = new Date();
  const from =
    details.nutritionAccessUntil && details.nutritionAccessUntil > now
      ? new Date(details.nutritionAccessUntil)
      : now;
  from.setDate(from.getDate() + days);

  details.nutritionAccessUntil = from;
  await details.save();
  return from;
};

/**
 * Grants the one-off free trial, if this account has never had it. Returns the
 * new expiry, or null when the trial was already spent.
 */
const grantFreeNutritionTrial = async (customerDetailsId) => {
  const details = await CustomerDetails.findById(customerDetailsId);
  if (!details || details.freeNutritionTrialUsed) return null;

  const until = await extendNutritionAccess(customerDetailsId);
  await CustomerDetails.updateOne(
    { _id: customerDetailsId },
    { $set: { freeNutritionTrialUsed: true } },
  );
  return until;
};

/**
 * Express guard for Nutrition endpoints. Answers 402 rather than 403 so the
 * client can tell "you need to buy something" apart from "you may not do this".
 */
const requireNutritionAccess = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: "Not authorized." });

    const user = await User.findById(userId).populate({
      path: "customerDetails",
      populate: { path: "membership" },
    });
    const access = nutritionAccessFor(user && user.customerDetails);

    if (!access.allowed) {
      return res.status(402).json({
        message:
          "Your nutrition access has ended. Subscribe to a plan for unlimited access, or buy a challenge to add 30 days.",
        nutritionAccess: access,
      });
    }

    req.nutritionAccess = access;
    return next();
  } catch (err) {
    console.error("requireNutritionAccess failed:", err);
    return res.status(500).json({ message: "Could not check nutrition access." });
  }
};

module.exports = {
  NUTRITION_DAYS_PER_PURCHASE,
  nutritionAccessFor,
  extendNutritionAccess,
  grantFreeNutritionTrial,
  requireNutritionAccess,
};
