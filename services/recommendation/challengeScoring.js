/**
 * Pure scoring functions for challenge recommendations.
 *
 * Deliberately free of Mongoose and I/O so the ranking can be unit-tested
 * without a database. The controller does the querying and hands plain objects
 * in here.
 *
 * Design notes:
 *
 * - Hard filters (language, isPublic/adminApproved, goal, already-owned) are
 *   applied in the query, NOT here. Scoring only orders what already qualifies.
 *
 * - A customer has exactly one goal (three fixed values, see utils/goals.js),
 *   so goal cannot rank anything — it is a filter. The primary ranking signal
 *   is discipline overlap: customerDetails.fitnessInterests and
 *   challenge.trainersFitnessInterest both reference TrainerGoal by ObjectId.
 *
 * - Only signals with data contribute, and the total is normalised by the sum
 *   of the weights that actually applied. A customer who has not set a
 *   preferred intensity is therefore not penalised — the remaining signals
 *   simply carry more. This is what lets new signals be added later without
 *   re-tuning the existing ones.
 */

const WEIGHTS = {
  disciplines: 40,
  intensity: 20,
  rating: 15,
  trainerAffinity: 10,
  bodyFocus: 10,
  freshness: 5,
};

// Subtracted from the final 0..1 score for results that only qualified via the
// off-goal fallback, so they always sort below genuine goal matches.
const OFF_GOAL_PENALTY = 0.15;

// A rating needs a few reviews before it counts for full value, otherwise a
// single 5-star review outranks a well-reviewed 4.6.
const RATING_CONFIDENCE_REVIEWS = 5;

const INTENSITY_ORDER = ["Easy", "Medium", "Hard"];

const idSet = (arr) =>
  new Set((arr || []).filter(Boolean).map((v) => String(v._id || v)));

/** Jaccard similarity — intersection over union. */
function jaccard(a, b) {
  const setA = idSet(a);
  const setB = idSet(b);
  if (setA.size === 0 || setB.size === 0) return null; // no data → skip signal
  let intersection = 0;
  for (const v of setA) if (setB.has(v)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? null : intersection / union;
}

/**
 * Names of the overlapping members, for the "reasons" payload.
 *
 * `named` must be the side that is POPULATED (documents with a .name); `ids`
 * may be raw ObjectIds. Callers pass the challenge's disciplines as `named`,
 * since the customer's fitnessInterests are stored unpopulated — reading names
 * off the id side yields nothing and makes the reason text claim there was no
 * overlap even when the score says otherwise.
 */
function overlapNames(named, ids, nameOf = (x) => x && x.name) {
  const idsSet = idSet(ids);
  return (named || [])
    .filter((x) => x && idsSet.has(String(x._id || x)))
    .map(nameOf)
    .filter(Boolean);
}

/**
 * Exact intensity match scores 1, an adjacent step scores 0.5, anything
 * further scores 0. Returns null when either side is unset so the signal is
 * skipped rather than counted as a zero.
 */
function intensityFit(preferred, challengeIntensity) {
  if (!challengeIntensity) return null;
  const wanted = (Array.isArray(preferred) ? preferred : [preferred]).filter(
    (p) => INTENSITY_ORDER.includes(p)
  );
  if (wanted.length === 0) return null;

  const actual = INTENSITY_ORDER.indexOf(challengeIntensity);
  if (actual === -1) return null;

  let best = 0;
  for (const w of wanted) {
    const distance = Math.abs(INTENSITY_ORDER.indexOf(w) - actual);
    best = Math.max(best, distance === 0 ? 1 : distance === 1 ? 0.5 : 0);
  }
  return best;
}

/** rating/5, scaled down while the review count is still low. */
function ratingScore(rating, reviewCount) {
  if (!rating || rating <= 0) return null;
  const confidence = Math.min(1, (reviewCount || 0) / RATING_CONFIDENCE_REVIEWS);
  return (rating / 5) * confidence;
}

/** 1.0 for brand new, decaying to 0 over roughly a year. */
function freshnessScore(createdAt) {
  if (!createdAt) return null;
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86400000;
  if (!Number.isFinite(ageDays) || ageDays < 0) return null;
  return Math.max(0, 1 - Math.log10(1 + ageDays) / Math.log10(366));
}

/**
 * Score a single challenge against a customer profile.
 *
 * @param challenge  plain challenge object (lean or hydrated)
 * @param profile    { fitnessInterests, preferredIntensity, trainerIds, bodyIds }
 *                   where trainerIds/bodyIds are aggregated from the challenges
 *                   the customer already owns
 * @param opts       { offGoal: boolean }
 * @returns { score, reasons: [{ signal, detail, contribution }] }
 */
function scoreChallenge(challenge, profile, opts = {}) {
  const parts = [];

  const disciplines = jaccard(
    profile.fitnessInterests,
    challenge.trainersFitnessInterest
  );
  if (disciplines !== null) {
    // Names come from the challenge side, which the query populates.
    const names = overlapNames(
      challenge.trainersFitnessInterest,
      profile.fitnessInterests
    );
    parts.push({
      signal: "disciplines",
      value: disciplines,
      weight: WEIGHTS.disciplines,
      detail: names.length
        ? `Matches your interest in ${names.join(", ")}`
        : disciplines > 0
        ? "Shares disciplines with your interests"
        : "No shared disciplines",
    });
  }

  const intensity = intensityFit(profile.preferredIntensity, challenge.intensity);
  if (intensity !== null) {
    parts.push({
      signal: "intensity",
      value: intensity,
      weight: WEIGHTS.intensity,
      detail:
        intensity === 1
          ? `${challenge.intensity} — matches your preferred intensity`
          : `${challenge.intensity} — close to your preferred intensity`,
    });
  }

  const rating = ratingScore(
    challenge.rating,
    (challenge.reviews || []).length
  );
  if (rating !== null) {
    parts.push({
      signal: "rating",
      value: rating,
      weight: WEIGHTS.rating,
      detail: `Rated ${challenge.rating.toFixed(1)} by ${
        (challenge.reviews || []).length
      } members`,
    });
  }

  const affinity = jaccard(profile.trainerIds, challenge.trainers);
  if (affinity !== null) {
    parts.push({
      signal: "trainerAffinity",
      value: affinity > 0 ? 1 : 0, // binary: you have trained with them or not
      weight: WEIGHTS.trainerAffinity,
      detail:
        affinity > 0
          ? "From a trainer you have trained with before"
          : "New trainer for you",
    });
  }

  const bodyFocus = jaccard(profile.bodyIds, challenge.body);
  if (bodyFocus !== null) {
    parts.push({
      signal: "bodyFocus",
      value: bodyFocus,
      weight: WEIGHTS.bodyFocus,
      detail: "Similar body focus to challenges you have done",
    });
  }

  const freshness = freshnessScore(challenge.createdAt);
  if (freshness !== null) {
    parts.push({
      signal: "freshness",
      value: freshness,
      weight: WEIGHTS.freshness,
      detail: "Recently added",
    });
  }

  const totalWeight = parts.reduce((acc, p) => acc + p.weight, 0);
  let score =
    totalWeight === 0
      ? 0
      : parts.reduce((acc, p) => acc + p.value * p.weight, 0) / totalWeight;

  if (opts.offGoal) score = Math.max(0, score - OFF_GOAL_PENALTY);

  // Only surface signals that actually contributed something, strongest first.
  const reasons = parts
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value * b.weight - a.value * a.weight)
    .map((p) => ({
      signal: p.signal,
      detail: p.detail,
      contribution:
        totalWeight === 0
          ? 0
          : Math.round((p.value * p.weight * 1000) / totalWeight) / 1000,
    }));

  return { score, reasons };
}

/**
 * Challenges are stored one document per language and grouped by
 * translationKey. Keep one per key so the same challenge cannot appear twice
 * when content exists in more than one language.
 */
function dedupeByTranslationKey(challenges) {
  const seen = new Set();
  const out = [];
  for (const c of challenges) {
    const key = c.translationKey || String(c._id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Score, sort descending, and cap the list. */
function rankChallenges(challenges, profile, opts = {}) {
  return dedupeByTranslationKey(challenges)
    .map((challenge) => {
      const { score, reasons } = scoreChallenge(challenge, profile, opts);
      return { challenge, score, offGoal: !!opts.offGoal, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

module.exports = {
  WEIGHTS,
  OFF_GOAL_PENALTY,
  RATING_CONFIDENCE_REVIEWS,
  INTENSITY_ORDER,
  jaccard,
  intensityFit,
  ratingScore,
  freshnessScore,
  scoreChallenge,
  dedupeByTranslationKey,
  rankChallenges,
};
