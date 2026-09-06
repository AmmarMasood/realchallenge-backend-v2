/**
 * Who may see a challenge's *playable* content.
 *
 * The catalogue and challenge-detail endpoints populate weeks -> workouts ->
 * exercises in full and returned the lot to anyone, so a single unauthenticated
 * `GET /api/challenges/` handed back every video URL on the platform. The paid
 * product was free to anyone who called the API directly.
 *
 * The fix is not to hide challenges — the sales page legitimately needs to show
 * what a programme contains. It is to strip the things that make content
 * *playable* (media URLs, downloadable files) unless the caller is entitled,
 * while leaving the structure — week names, workout titles, counts, durations —
 * which is exactly the marketing pitch.
 */
const { CustomerDetails } = require("../models/UserModels/customerDetailsModel");

// Roles that may see everything, for support and content review.
const STAFF_ROLES = ["admin", "trainer", "nutrist", "blogger", "shopmanager"];

const isStaffUser = (user) =>
  Boolean(user) &&
  Array.isArray(user.roles) &&
  user.roles.some((r) => STAFF_ROLES.includes(r));

/**
 * The set of challenge ids this user owns, as strings. One query, cached on the
 * request by the caller when it needs to check several challenges.
 */
const ownedChallengeIds = async (user) => {
  if (!user || !user.customerDetails) return new Set();
  const id = user.customerDetails._id || user.customerDetails;
  const details = await CustomerDetails.findById(id).select("challenges").lean();
  return new Set((details?.challenges || []).filter(Boolean).map(String));
};

/** Whether this user may play the given challenge. */
const canPlayChallenge = (challenge, user, ownedIds) => {
  if (!challenge) return false;
  if (isStaffUser(user)) return true;
  // A trainer who authored it can always review their own work.
  if (user && challenge.user && challenge.user.toString() === user._id.toString()) {
    return true;
  }
  // A free challenge is still *claimed* before it is played, so ownership is
  // what counts here, not price.
  return ownedIds ? ownedIds.has(challenge._id.toString()) : false;
};

// Fields that make something playable or downloadable. Titles, durations and
// counts are deliberately NOT here — they are the sales pitch.
const MEDIA_FIELDS = [
  "introVideoLink",
  "introVideoThumbnailLink",
  "audioLink",
  "backgroundVideoLink",
  "videoLink",
  "videoThumbnailLink",
  "infoFile",
  "musicLink",
];

const stripMedia = (doc) => {
  if (!doc || typeof doc !== "object") return doc;
  for (const f of MEDIA_FIELDS) {
    if (doc[f] !== undefined) doc[f] = null;
  }
  return doc;
};

/**
 * Removes playable media from a challenge's weeks for a caller who does not own
 * it. Mutates and returns a plain object — call `.toObject()`/`.lean()` first.
 *
 * `locked: true` is set on each week so the client can render "buy to unlock"
 * rather than guessing why a link is missing.
 */
const redactUnownedContent = (challenge) => {
  if (!challenge) return challenge;

  // The challenge's own trailer stays: it is the advert.
  for (const week of challenge.weeks || []) {
    week.locked = true;
    for (const workout of week.workouts || []) {
      stripMedia(workout);
      for (const ex of workout.exercises || []) {
        stripMedia(ex);
        // exercises may be { exerciseId: {...} } after population
        if (ex && ex.exerciseId) stripMedia(ex.exerciseId);
      }
    }
  }
  return challenge;
};

/** Applies redaction to one challenge unless the caller may play it. */
const applyContentAccess = (challenge, user, ownedIds) => {
  if (!challenge) return challenge;
  const plain =
    typeof challenge.toObject === "function" ? challenge.toObject() : challenge;
  if (canPlayChallenge(plain, user, ownedIds)) return plain;
  return redactUnownedContent(plain);
};

/** Same, for a list. Resolves ownership once rather than per challenge. */
const applyContentAccessToList = async (challenges, user) => {
  const ownedIds = await ownedChallengeIds(user);
  return (challenges || []).map((c) => applyContentAccess(c, user, ownedIds));
};

module.exports = {
  isStaffUser,
  ownedChallengeIds,
  canPlayChallenge,
  redactUnownedContent,
  applyContentAccess,
  applyContentAccessToList,
};
