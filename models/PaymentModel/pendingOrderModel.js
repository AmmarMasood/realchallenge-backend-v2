const mongoose = require("mongoose");

// A purchase recorded server-side at checkout, before the user is sent to
// Mollie. Access is granted from THIS record after the payment is confirmed
// paid — never from data the browser hands back on return.
//
// Previously the intended purchase lived only in localStorage and the redirect
// page granted it unconditionally, so cancelling on Mollie (or simply hitting
// its "Previous page" button) delivered the challenge for free.
const pendingOrderSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Mollie payment id (tr_...). Unique so completion is idempotent.
    paymentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // CHALLENGE_1 | CHALLENGE_3 | CHALLENGE_12
    packageType: {
      type: String,
      required: true,
    },
    // "purchase" buys something. "recovery" settles a failed subscription
    // payment and re-authorises billing — it grants no challenges, it restores
    // the plan the user already has.
    kind: {
      type: String,
      enum: ["purchase", "recovery"],
      default: "purchase",
    },
    // What the user gets when this payment is confirmed. Empty for a plan
    // bought without picking a challenge.
    challenges: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Challenges",
      },
    ],
    // Held until the payment is confirmed, then redeemed. Validating a coupon
    // must not spend it — the customer may never finish the checkout.
    coupon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupons",
    },
    // Undiscounted price, kept so an invoice can show what the discount was.
    listAmount: {
      type: Number,
    },
    // What is actually charged, after any coupon.
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "EUR",
      uppercase: true,
      trim: true,
    },
    // Country the VAT rate was taken from. EU B2C digital services are taxed at
    // the customer's local rate, so this is captured per order rather than
    // assumed from the seller.
    vatCountry: {
      type: String,
      uppercase: true,
      trim: true,
    },
    vatRatePercent: {
      type: Number,
    },
    vatAmount: {
      type: Number,
    },
    netAmount: {
      type: Number,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    // Set once fulfilled, so a replayed redirect cannot grant twice.
    completedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

exports.PendingOrder = mongoose.model("PendingOrder", pendingOrderSchema);
