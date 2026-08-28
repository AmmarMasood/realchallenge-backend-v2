const mongoose = require("mongoose");

/**
 * VAT rate per country, so rates can be changed without a deploy.
 *
 * Consumer prices are stored and displayed VAT-INCLUSIVE. The rate here is used
 * to split a gross price into net + VAT for invoices and accounting; it never
 * changes what the customer is charged.
 *
 * v1 sells only to NL at 21%. The table exists so selling into other EU
 * countries later is a data change rather than a schema migration — EU B2C
 * digital services are taxed at the customer's local rate.
 */
const vatRateSchema = mongoose.Schema(
  {
    // ISO 3166-1 alpha-2, uppercase. "NL", "DE", "BE".
    countryCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    ratePercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    // Used when a customer's country is unknown.
    isDefault: {
      type: Boolean,
      default: false,
    },
    label: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

exports.VatRate = mongoose.model("VatRate", vatRateSchema);
