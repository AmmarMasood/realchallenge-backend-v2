/**
 * Invoices and credit notes, via Mollie's Sales Invoices API.
 *
 * Issued only after Mollie confirms a payment is paid, and always with
 * `status: "paid"` and `paymentDetails.source: "manual"` — the money has already
 * been collected, so the invoice documents it rather than requesting it.
 *
 * `vatMode: "inclusive"` because consumer prices already include VAT.
 *
 * The installed @mollie/api-client (3.7.0) has no sales-invoice binder, so this
 * calls the REST endpoint directly.
 *
 * Nothing here throws: an accounting document failing must never roll back a
 * payment that already succeeded. Failures are recorded on the Invoice row with
 * a reason, so they can be found and reissued.
 */
const rp = require("request-promise");
const { Invoice } = require("../models/PaymentModel/invoiceModel");
const { vatBreakdown, toCurrencyCode } = require("./pricing");

const MOLLIE_API = "https://api.mollie.com/v2";
const apiKey = () => process.env.MOLLIE_API_KEY;

const invoicingEnabled = () =>
  process.env.ENABLE_INVOICING === "true" && Boolean(apiKey());

/**
 * Mollie requires a postal address on the recipient, and a VAT invoice is not
 * valid without one. We do not collect billing addresses yet, so this reports
 * what is missing rather than sending a request that will fail.
 */
const missingRecipientFields = (user) => {
  const missing = [];
  if (!user.email) missing.push("email");
  if (!user.streetAndNumber && !user.address) missing.push("streetAndNumber");
  if (!user.postalCode) missing.push("postalCode");
  if (!user.city) missing.push("city");
  if (!user.country) missing.push("country");
  return missing;
};

const buildRecipient = (user, vatCountry) => ({
  type: "consumer",
  email: user.email,
  givenName: user.firstName || user.username || "Customer",
  familyName: user.lastName || "-",
  streetAndNumber: user.streetAndNumber || user.address,
  postalCode: user.postalCode,
  city: user.city,
  country: (user.country || vatCountry || "NL").toUpperCase(),
  locale: user.language === "dutch" ? "nl_NL" : "en_GB",
});

const postSalesInvoice = async (body) =>
  rp({
    method: "POST",
    uri: `${MOLLIE_API}/sales-invoices`,
    headers: { Authorization: `Bearer ${apiKey()}` },
    body,
    json: true,
  });

/**
 * Issues an invoice for a paid order. Safe to call repeatedly — the unique
 * index on (paymentId, kind) means a replayed webhook cannot double-issue.
 */
const issueInvoiceForOrder = async (order, user) => {
  const existing = await Invoice.findOne({
    paymentId: order.paymentId,
    kind: "invoice",
  });
  if (existing) return existing;

  // Prefer the split recorded at the time of sale; fall back for older orders.
  const vat =
    order.vatRatePercent !== undefined && order.netAmount !== undefined
      ? {
          gross: order.amount,
          net: order.netAmount,
          vatAmount: order.vatAmount,
          ratePercent: order.vatRatePercent,
          countryCode: order.vatCountry,
          currency: toCurrencyCode(order.currency),
        }
      : await vatBreakdown(order.amount, user.country, order.currency);

  const record = {
    user: user._id,
    paymentId: order.paymentId,
    kind: "invoice",
    description: order.packageType,
    grossAmount: vat.gross,
    netAmount: vat.net,
    vatAmount: vat.vatAmount,
    vatRatePercent: vat.ratePercent,
    vatCountry: vat.countryCode,
    currency: vat.currency,
  };

  if (!invoicingEnabled()) {
    return Invoice.create({
      ...record,
      status: "skipped",
      failureReason: "Invoicing disabled (set ENABLE_INVOICING=true).",
    });
  }

  const missing = missingRecipientFields(user);
  if (missing.length) {
    console.warn(
      `[invoicing] cannot invoice payment ${order.paymentId} — missing ${missing.join(", ")}`,
    );
    return Invoice.create({
      ...record,
      status: "failed",
      failureReason: `Missing billing details: ${missing.join(", ")}`,
    });
  }

  try {
    const created = await postSalesInvoice({
      status: "paid",
      vatMode: "inclusive",
      currency: vat.currency,
      recipient: buildRecipient(user, vat.countryCode),
      lines: [
        {
          description: order.packageType,
          quantity: 1,
          vatRate: Number(vat.ratePercent).toFixed(2),
          unitPrice: {
            currency: vat.currency,
            value: Number(vat.gross).toFixed(2),
          },
        },
      ],
      // The money arrived through a Mollie payment, not through this invoice.
      paymentDetails: { source: "manual" },
    });

    return Invoice.create({
      ...record,
      status: "issued",
      mollieInvoiceId: created.id,
      invoiceNumber: created.invoiceNumber || created.number,
      issuedAt: new Date(),
    });
  } catch (err) {
    const reason = (err.error && err.error.detail) || err.message;
    console.error(`[invoicing] failed for ${order.paymentId}: ${reason}`);
    return Invoice.create({ ...record, status: "failed", failureReason: reason });
  }
};

/**
 * Records a refund as a credit note. The original invoice is never edited or
 * deleted — accounting requires the reversal to be its own document.
 */
const issueCreditNote = async (paymentId, { amount, reason } = {}) => {
  const original = await Invoice.findOne({ paymentId, kind: "invoice" });
  if (!original) {
    console.warn(`[invoicing] no invoice found for ${paymentId}; cannot credit`);
    return null;
  }

  const existing = await Invoice.findOne({ paymentId, kind: "credit_note" });
  if (existing) return existing;

  const gross = amount !== undefined ? Number(amount) : original.grossAmount;
  // Split the refund at the rate on the original invoice, not today's.
  const rate = original.vatRatePercent || 0;
  const net = Math.round((gross / (1 + rate / 100)) * 100) / 100;

  return Invoice.create({
    user: original.user,
    paymentId,
    kind: "credit_note",
    creditNoteFor: original._id,
    description: reason || `Refund for ${original.description}`,
    grossAmount: gross,
    netAmount: net,
    vatAmount: Math.round((gross - net) * 100) / 100,
    vatRatePercent: rate,
    vatCountry: original.vatCountry,
    currency: original.currency,
    status: "issued",
    issuedAt: new Date(),
  });
};

module.exports = {
  invoicingEnabled,
  missingRecipientFields,
  issueInvoiceForOrder,
  issueCreditNote,
};
