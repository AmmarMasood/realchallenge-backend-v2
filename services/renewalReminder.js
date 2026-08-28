/**
 * Warns subscribers before a committed term ends and rolls to monthly.
 *
 * The client's transparency rule: nobody should be surprised by a renewal.
 * 30 days' notice on the 12-month plan, 14 on the 3-month.
 *
 * Same setInterval pattern as mealPlanScheduler — no cron dependency.
 */
const { Membership } = require("../models/MembershipModel/membershipModel");
const { CustomerDetails } = require("../models/UserModels/customerDetailsModel");
const { User } = require("../models/UserModels/userModel");
const { emails } = require("./transactionalEmail");

const DAY_MS = 24 * 60 * 60 * 1000;

// Days of notice before the term ends, per plan.
const NOTICE_DAYS = {
  CHALLENGE_12: Number(process.env.RENEWAL_NOTICE_DAYS_12 || 30),
  CHALLENGE_3: Number(process.env.RENEWAL_NOTICE_DAYS_3 || 14),
};

/**
 * When the agreed term runs out: the start plus the number of monthly payments
 * committed to. Billing is monthly, so the term is a count of charges rather
 * than a stored end date.
 */
const termEndsOn = (membership) => {
  if (!membership.commitmentMonths || !membership.startTime) return null;
  const end = new Date(membership.startTime);
  end.setMonth(end.getMonth() + membership.commitmentMonths);
  return end;
};

/** One sweep. Exported so it can be run manually or from a test. */
const sendDueRenewalReminders = async (now = new Date()) => {
  const result = { checked: 0, sent: 0, errors: 0 };

  const candidates = await Membership.find({
    isValid: "active",
    autoRenew: true,
    termReminderSentAt: { $exists: false },
    commitmentMonths: { $gt: 0 },
  });

  for (const membership of candidates) {
    result.checked += 1;
    try {
      const endsOn = termEndsOn(membership);
      if (!endsOn) continue;

      const notice = NOTICE_DAYS[membership.name];
      if (!notice) continue;

      const daysLeft = Math.ceil((endsOn.getTime() - now.getTime()) / DAY_MS);
      // Not yet due, or the term has already passed — a reminder after the fact
      // is worse than none.
      if (daysLeft > notice || daysLeft < 0) continue;

      const details = await CustomerDetails.findOne({ membership: membership._id });
      if (!details) continue;
      const user = await User.findOne({ customerDetails: details._id });
      if (!user) continue;

      await emails.termEndingReminder(user, {
        planName: membership.name,
        endsOn,
        rollsToAmount: membership.price,
        currency: membership.currency,
        daysLeft,
      });

      // Marked whatever the mail did, so a broken mailbox cannot cause the same
      // reminder to be retried every hour forever.
      membership.termReminderSentAt = now;
      await membership.save();
      result.sent += 1;
    } catch (err) {
      result.errors += 1;
      console.error(
        `[renewalReminder] membership ${membership._id} failed:`,
        err.message,
      );
    }
  }

  return result;
};

function startRenewalReminderScheduler() {
  if (process.env.ENABLE_RENEWAL_REMINDERS === "false") {
    console.log("[renewalReminder] disabled");
    return null;
  }
  console.log("[renewalReminder] enabled — sweeping daily for ending terms");
  return setInterval(async () => {
    try {
      const r = await sendDueRenewalReminders(new Date());
      if (r.sent || r.errors) console.log("[renewalReminder] tick", r);
    } catch (e) {
      console.error("[renewalReminder] tick failed:", e.message);
    }
  }, DAY_MS);
}

module.exports = { sendDueRenewalReminders, termEndsOn, startRenewalReminderScheduler };
