const mongoose = require("mongoose");

const membershipSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    isValid: {
      type: String,
    },
    startTime: {
      type: Date,
    },
    endTime: {
      type: Date,
    },
    price: {
      type: Number,
    },
    // ISO 4217. Stored alongside the price so a plan's currency is never
    // inferred, and so adding USD/AED later needs no schema change.
    currency: {
      type: String,
      default: "EUR",
      uppercase: true,
      trim: true,
    },
    // VAT split at the time of sale. Kept per membership because rates change,
    // and an invoice must reflect the rate that applied when it was issued.
    vatRatePercent: {
      type: Number,
    },
    vatCountry: {
      type: String,
      uppercase: true,
      trim: true,
    },
    // Length of the agreed term, in monthly payments (3 or 12). The plan bills
    // monthly but is committed for this many charges, then rolls month to month.
    commitmentMonths: {
      type: Number,
    },
    // Successful charges so far, including the first. Advanced by the webhook,
    // and what tells us whether the term is still running.
    paymentsMade: {
      type: Number,
      default: 1,
    },
    autoRenew: {
      type: Boolean,
      default: true,
    },
    // Our own view of whether the plan is being paid for, separate from Mollie's
    // subscription status. Mollie usually keeps a subscription `active` while it
    // retries a failed charge, so it cannot tell us on its own when to withhold
    // access.
    paymentStatus: {
      type: String,
      enum: ["ok", "past_due"],
      default: "ok",
    },
    paymentFailedAt: {
      type: Date,
    },
    // End of the grace period. While this is in the future the user keeps access
    // and sees a warning; once it passes access is withheld until they pay.
    // Derived state, never a stored "locked" flag, so nothing has to run on a
    // timer to flip it.
    graceUntil: {
      type: Date,
    },
    // Stops the "access on hold" email repeating on every webhook once grace has
    // lapsed. Cleared when payment is restored, so a later failure mails again.
    suspensionNotifiedAt: {
      type: Date,
    },
    // When the term-ending reminder went out, so it is sent once and not on
    // every sweep.
    termReminderSentAt: {
      type: Date,
    },
    // Set when the user cancels: the payment number after which billing stops.
    // Cancelling never stops billing immediately — inside the term it runs to
    // the end of the term, and on rolling monthly it honours one month's notice.
    cancelAfterPayment: {
      type: Number,
      default: null,
    },
    // Challenges this plan has granted. The plan's cap is a limit on how many
    // are active AT ONCE, not a lifetime total, so each entry records when the
    // slot was taken and when it frees up again.
    //
    // A slot is released when the challenge is completed, or when `holdUntil`
    // passes — whichever comes first. That stops someone abandoning a programme
    // halfway and blocking a slot forever, without letting them hop between
    // programmes freely.
    //
    // One-time purchases are unlimited and never appear here.
    challenges: [
      {
        challenge: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Challenges",
        },
        grantedAt: {
          type: Date,
          default: Date.now,
        },
        // grantedAt + the programme's own length. Computed once at grant time
        // so counting active slots needs no extra challenge lookups.
        holdUntil: {
          type: Date,
        },
      },
    ],
    coupons: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Coupons",
        required: true,
      },
    ],
  },
  {
    timestamps: true,
  }
);

exports.Membership = mongoose.model("Membership", membershipSchema);
