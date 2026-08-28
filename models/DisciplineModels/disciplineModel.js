const mongoose = require("mongoose");
const { SUPPORTED_LANGUAGES } = require("../../utils/language");

/**
 * A training discipline — Boxing, Strength, HIIT, Yoga…
 *
 * This is the canonical vocabulary that customers pick as interests and that
 * challenges are tagged with. Both sides reference it by ObjectId, which is
 * what makes the recommender's discipline signal a real join.
 *
 * WHY THIS EXISTS
 * ---------------
 * Disciplines used to live in `TrainerGoal`, which has a REQUIRED `trainerId`.
 * That meant "Boxing" existed once per trainer, so the ObjectId join between
 * `customerDetails.fitnessInterests` and `challenge.trainersFitnessInterest`
 * only held because both pickers happened to read the same de-duplicated list
 * and got whichever document sorted first. Two trainers defining "Boxing" —
 * entirely normal — silently split the taxonomy in two, and a customer tagged
 * with one would never match a challenge tagged with the other.
 *
 * TrainerGoal is now a join table (trainer -> discipline) and no longer owns
 * the vocabulary.
 *
 * TRANSLATIONS ARE EMBEDDED, NOT ONE DOC PER LANGUAGE
 * ---------------------------------------------------
 * Challenge / Recipe / Blog use one document per language, grouped by
 * translationKey — correct for content, where each language really is a
 * separate item. A discipline is a taxonomy used as a JOIN KEY. With one
 * document per language a Dutch customer picking "Boksen" could never match a
 * challenge tagged with English "Boxing" — the same bug one layer down. One
 * document per concept keeps the join language-independent; `translations`
 * only affects display.
 */
const disciplineSchema = mongoose.Schema(
  {
    // Stable, language-independent identity. e.g. "boxing"
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    // Canonical (English) label. Kept as a flat field so `populate(…, "name")`
    // works everywhere — including the recommender's score explanations, which
    // run under .lean() where virtuals are unavailable.
    name: {
      type: String,
      required: true,
      trim: true,
    },
    translations: [
      {
        language: { type: String, enum: SUPPORTED_LANGUAGES, required: true },
        name: { type: String, required: true, trim: true },
        _id: false,
      },
    ],
    icon: { type: String, default: "" },
    // Soft delete: inactive disciplines stay so existing references keep
    // resolving, but are hidden from pickers.
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/** Display name for a language, falling back to the canonical `name`. */
function localisedName(discipline, language) {
  if (!discipline) return "";
  const hit = (discipline.translations || []).find(
    (t) => t && t.language === language
  );
  return (hit && hit.name) || discipline.name || "";
}

/** Shape a discipline the way the pickers expect: { _id, name, icon }. */
function toPickerShape(discipline, language) {
  return {
    _id: discipline._id,
    slug: discipline.slug,
    name: localisedName(discipline, language),
    icon: discipline.icon || "",
  };
}

exports.Discipline = mongoose.model("Discipline", disciplineSchema);
exports.localisedName = localisedName;
exports.toPickerShape = toPickerShape;
