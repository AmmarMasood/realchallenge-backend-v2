/**
 * One-time migration: convert scalar shoulderSize / waistSize / hipSize /
 * chestSize fields on CustomerDetails to 12-slot monthly arrays (matching
 * the existing `weight` shape).
 *
 * Behavior per document:
 *   - If the field is already an array, leave it alone (idempotent).
 *   - If the field is a Number, create [0]*12 and place the value in the
 *     current month's slot (so the chart immediately has a data point).
 *   - If the field is missing/null, set [0]*12.
 *
 * Dry-run by default (prints what would change, no writes).
 * Apply for real:  node scripts/migrateBodyMeasurementArrays.js --apply
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const {
  CustomerDetails,
} = require("../models/UserModels/customerDetailsModel");

const APPLY = process.argv.includes("--apply");
const FIELDS = ["shoulderSize", "waistSize", "hipSize", "chestSize"];

function emptyMonths() {
  return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
}

async function main() {
  await connectDB();
  const currentMonth = new Date().getMonth();

  // Read raw documents so we can see the actual stored type for each field
  // (Mongoose-defined defaults could mask a missing value).
  const docs = await CustomerDetails.collection
    .find({}, { projection: { _id: 1, ...Object.fromEntries(FIELDS.map((f) => [f, 1])) } })
    .toArray();

  let converted = 0;
  let alreadyArr = 0;
  let unchanged = 0;
  const updates = [];

  for (const d of docs) {
    const patch = {};
    let needsPatch = false;
    for (const f of FIELDS) {
      const v = d[f];
      if (Array.isArray(v)) {
        // already migrated
        continue;
      }
      const arr = emptyMonths();
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        arr[currentMonth] = v;
      }
      patch[f] = arr;
      needsPatch = true;
    }
    if (needsPatch) {
      updates.push({ _id: d._id, patch });
      converted++;
    } else {
      const allArrays = FIELDS.every((f) => Array.isArray(d[f]));
      if (allArrays) alreadyArr++;
      else unchanged++;
    }
  }

  console.log(
    `[migrate] mode=${APPLY ? "APPLY" : "DRY-RUN"}  docs=${docs.length}  ` +
      `to_convert=${converted}  already_arrays=${alreadyArr}  ` +
      `unchanged=${unchanged}`,
  );

  if (!APPLY) {
    if (updates.length > 0) {
      console.log("[migrate] sample of first 3 updates:");
      updates.slice(0, 3).forEach((u) => console.log("  ", u._id, u.patch));
    }
    await mongoose.disconnect();
    return;
  }

  let written = 0;
  for (const u of updates) {
    await CustomerDetails.updateOne({ _id: u._id }, { $set: u.patch });
    written++;
  }
  console.log(`[migrate] done. written=${written}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
