/**
 * Transactional email.
 *
 * These are service messages — receipts, payment failures, cancellations — and
 * are deliberately NOT gated on any marketing opt-in. A customer who has turned
 * off marketing must still be told their payment failed.
 *
 * Sends through SES, the same transport the app already uses.
 */
const aws = require("aws-sdk");

const ses = new aws.SES({
  accessKeyId: process.env.AWS_SES_KEY,
  secretAccessKey: process.env.AWS_SES_SECRET,
  region: process.env.AWS_SES_REGION,
});

const FROM = process.env.EMAIL_FROM || process.env.NODE_MAILER_EMAIL;

// In dev, point every message at one inbox rather than emailing real customers.
// Explicit and env-gated: unset, real recipients are used.
const REDIRECT_TO = process.env.EMAIL_REDIRECT_TO || null;

const money = (amount, currency = "EUR") => {
  const symbol = { EUR: "€", USD: "$" }[currency] || currency + " ";
  return symbol + Number(amount || 0).toFixed(2);
};

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";

/**
 * Sends one message. Never throws: a failed receipt must not roll back a
 * payment that already succeeded, so problems are logged and swallowed.
 */
const send = async (to, subject, lines) => {
  const recipient = REDIRECT_TO || to;
  if (!recipient || !FROM) {
    console.warn(
      `[email] skipped "${subject}" — ${!FROM ? "EMAIL_FROM not configured" : "no recipient"}`,
    );
    return false;
  }

  const text = lines.filter(Boolean).join("\n\n");
  const html =
    "<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1b1f24\">" +
    lines.filter(Boolean).map((l) => "<p>" + l + "</p>").join("") +
    "</div>";

  try {
    await ses
      .sendEmail({
        Destination: { ToAddresses: [recipient] },
        Message: {
          Subject: { Data: subject },
          Body: { Text: { Data: text }, Html: { Data: html } },
        },
        Source: FROM,
      })
      .promise();
    console.log(
      `[email] sent "${subject}" to ${recipient}${REDIRECT_TO ? " (redirected)" : ""}`,
    );
    return true;
  } catch (err) {
    console.error(`[email] failed "${subject}" to ${recipient}:`, err.message);
    return false;
  }
};

const greeting = (user) => "Hi " + (user.firstName || user.username || "there") + ",";

const emails = {
  /** A plan has started. */
  subscriptionStarted: (user, { planName, amount, currency, commitmentMonths, nextPaymentDate }) =>
    send(user.email, "Your Real Challenge subscription is active", [
      greeting(user),
      `Your ${planName} subscription is now active.`,
      `You'll be charged ${money(amount, currency)} per month` +
        (commitmentMonths ? ` for ${commitmentMonths} months` : "") +
        (nextPaymentDate ? `. Your next payment is on ${formatDate(nextPaymentDate)}.` : "."),
      "You can manage your subscription any time from your account settings.",
    ]),

  /** Receipt for any successful payment. */
  paymentReceipt: (user, { description, amount, currency, paidAt }) =>
    send(user.email, "Your Real Challenge receipt", [
      greeting(user),
      `We've received your payment of ${money(amount, currency)} for ${description}.`,
      paidAt ? `Paid on ${formatDate(paidAt)}.` : null,
      "Thanks for training with us.",
    ]),

  /**
   * A charge failed. Deliberately does NOT offer a payment link: while Mollie is
   * retrying, a manual payment can go through alongside a retry and charge the
   * customer twice.
   */
  paymentFailed: (user, { amount, currency, graceUntil }) =>
    send(user.email, "We couldn't take your payment", [
      greeting(user),
      `Your payment of ${money(amount, currency)} didn't go through.`,
      "We'll try again automatically over the next few days — please make sure your account or card has funds available. There's nothing else you need to do right now.",
      graceUntil
        ? `You'll keep full access until ${formatDate(graceUntil)}.`
        : null,
    ]),

  /** Grace has run out — now it is safe to ask them to pay, retries have stopped. */
  accessSuspended: (user, { recoveryUrl }) =>
    send(user.email, "Your Real Challenge access is on hold", [
      greeting(user),
      "We weren't able to take your payment, so your plan is on hold and no longer includes new challenges.",
      recoveryUrl
        ? `You can set your payment up again here: ${recoveryUrl}`
        : "You can set your payment up again from your account settings.",
      "Anything you've already unlocked stays yours.",
    ]),

  paymentRestored: (user, { planName }) =>
    send(user.email, "Your subscription is active again", [
      greeting(user),
      `Thanks — your payment went through and your ${planName || "subscription"} is active again.`,
      "Everything is back to normal.",
    ]),

  /** Cancellation, stating exactly when access ends. */
  subscriptionCancelled: (user, { planName, inCommittedTerm, remainingPayments, endsOn }) =>
    send(user.email, "Your subscription has been cancelled", [
      greeting(user),
      `Your ${planName} subscription won't renew.`,
      inCommittedTerm
        ? `You're partway through your agreed term, so billing continues for ${remainingPayments} more monthly payment${remainingPayments === 1 ? "" : "s"}.`
        : "You'll be charged once more, then billing stops.",
      endsOn ? `Your access continues until ${formatDate(endsOn)}.` : null,
      "The challenges you've already unlocked stay yours.",
    ]),

  /** Sent ahead of a committed term ending, so renewal is never a surprise. */
  termEndingReminder: (user, { planName, endsOn, rollsToAmount, currency, daysLeft }) =>
    send(user.email, "Your subscription term is ending soon", [
      greeting(user),
      `Your ${planName} term ends on ${formatDate(endsOn)}, in ${daysLeft} days.`,
      `After that it continues month to month at ${money(rollsToAmount, currency)} per month, and you can cancel any time with one month's notice.`,
      "If you'd rather it didn't continue, you can cancel from your account settings before then.",
    ]),

  refundIssued: (user, { amount, currency, description }) =>
    send(user.email, "Your refund has been processed", [
      greeting(user),
      `We've refunded ${money(amount, currency)}${description ? ` for ${description}` : ""}.`,
      "It usually takes a few working days to appear, depending on your bank.",
    ]),
};

module.exports = { send, emails, money, formatDate };
