// Central goal configuration for the entire application.
//
// A customer picks exactly ONE goal (single-select in the signup wizard and the
// profile page) and it is stored on `customerDetails.goals` as a one-element
// array of the slug below. Challenges are tagged with the same slugs on
// `challenge.challengeGoals`, which is what makes the recommender's goal filter
// a real join rather than a string coincidence.
//
// These are product-defined values, not admin content — deliberately constants
// rather than a collection. The old `ChallengeGoals` collection is no longer a
// source of goal options; anything picked from there stored Mongo ObjectIds
// while customers stored slugs, which silently broke the join.
//
// The frontend keeps its own copy in src/constants/goals.js because it also
// needs the icon and translation key for rendering. The SLUGS MUST MATCH.
// To add a goal: add it here, in src/constants/goals.js, and add the
// translation key to every file in src/locales/.

const GOALS = [
  { slug: "get-fit", translationKey: "goals.get_fit" },
  { slug: "lose-weight", translationKey: "goals.lose_weight" },
  { slug: "gain-muscle", translationKey: "goals.gain_muscle" },
];

const GOAL_SLUGS = GOALS.map((g) => g.slug);

module.exports = {
  GOALS,
  GOAL_SLUGS,

  // Helper to validate a goal slug
  isValidGoal: (slug) => GOAL_SLUGS.includes(slug),

  // Customers store goals as an array but may only pick one. Returns the first
  // recognised slug, or null when the customer has not set a goal yet.
  // Tolerates legacy rows that stored a display name or a stale ObjectId by
  // simply not matching — callers treat null as "no goal set".
  resolveCustomerGoal: (goals) => {
    if (!Array.isArray(goals)) return null;
    return goals.find((g) => GOAL_SLUGS.includes(g)) || null;
  },
};
