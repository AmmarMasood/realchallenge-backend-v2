/**
 * Seeds VAT rates. NL is the launch market; the others are here so selling into
 * neighbouring countries later is a data change, not a code change.
 *
 * Idempotent - existing rows are left alone, so a rate changed by an admin is
 * never overwritten by a redeploy.
 *
 *   node scripts/seedVatRates.js
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

const RATES = [
  { countryCode: "NL", ratePercent: 21, isDefault: true, label: "Netherlands" },
  { countryCode: "BE", ratePercent: 21, label: "Belgium" },
  { countryCode: "DE", ratePercent: 19, label: "Germany" },
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
    dbName: "realChallengeProduction",
  });
  const { VatRate } = require("../models/PaymentModel/vatRateModel");

  let created = 0;
  let kept = 0;
  for (const rate of RATES) {
    const existing = await VatRate.findOne({ countryCode: rate.countryCode });
    if (existing) {
      kept += 1;
      console.log(`kept    ${rate.countryCode} at ${existing.ratePercent}%`);
      continue;
    }
    await VatRate.create(rate);
    created += 1;
    console.log(`created ${rate.countryCode} at ${rate.ratePercent}%`);
  }
  console.log(`\ncreated: ${created}, already present: ${kept}`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
