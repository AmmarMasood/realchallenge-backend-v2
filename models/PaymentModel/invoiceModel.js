const mongoose = require("mongoose");

/**
 * Local record of an invoice or credit note issued at Mollie.
 *
 * Kept on our side as well so the accounting trail survives independently of
 * Mollie, and so a refund can find the invoice it relates to.
 *
 * Invoices are never edited or deleted. A refund produces a separate
 * `credit_note` document referencing the original, which is what the client
 * asked for and what accounting rules require.
 */
const invoiceSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // The payment this documents. Unique per kind, so a replayed webhook cannot
    // issue the same invoice twice.
    paymentId: {
      type: String,
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: ["invoice", "credit_note"],
      default: "invoice",
    },
    // Mollie's id and human-readable number, once issued.
    mollieInvoiceId: { type: String },
    invoiceNumber: { type: String },

    description: { type: String },
    // Gross is what the customer paid; net and VAT are the split of it.
    grossAmount: { type: Number, required: true },
    netAmount: { type: Number },
    vatAmount: { type: Number },
    vatRatePercent: { type: Number },
    vatCountry: { type: String, uppercase: true },
    currency: { type: String, default: "EUR", uppercase: true },

    // A credit note points back at what it reverses.
    creditNoteFor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
    },

    status: {
      type: String,
      enum: ["issued", "failed", "skipped"],
      default: "issued",
    },
    // Why an invoice could not be issued — most often a missing billing address.
    failureReason: { type: String },
    issuedAt: { type: Date },
  },
  { timestamps: true },
);

// One invoice and one credit note per payment.
invoiceSchema.index({ paymentId: 1, kind: 1 }, { unique: true });

exports.Invoice = mongoose.model("Invoice", invoiceSchema);
