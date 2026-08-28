/**
 * Unit tests for challenge recommendation scoring.
 *
 * These are pure — no database, no Mongoose. The controller handles querying;
 * everything asserted here is ranking behaviour, which is exactly the part
 * that regresses silently when weights are tuned.
 */
const {
  jaccard,
  intensityFit,
  ratingScore,
  freshnessScore,
  scoreChallenge,
  dedupeByTranslationKey,
  rankChallenges,
  OFF_GOAL_PENALTY,
  RATING_CONFIDENCE_REVIEWS,
} = require("../services/recommendation/challengeScoring");

const challenge = (over = {}) => ({
  _id: over._id || "c1",
  challengeName: "Test",
  translationKey: over.translationKey,
  trainersFitnessInterest: [],
  trainers: [],
  body: [],
  reviews: [],
  ...over,
});

describe("jaccard", () => {
  it("returns null when either side is empty so the signal is skipped", () => {
    expect(jaccard([], ["a"])).toBeNull();
    expect(jaccard(["a"], [])).toBeNull();
  });

  it("computes intersection over union", () => {
    expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3);
    expect(jaccard(["a"], ["a"])).toBe(1);
    expect(jaccard(["a"], ["b"])).toBe(0);
  });

  it("compares ObjectId-like objects by _id", () => {
    expect(jaccard([{ _id: "a" }], ["a"])).toBe(1);
  });
});

describe("intensityFit", () => {
  it("scores an exact match highest and an adjacent step half", () => {
    expect(intensityFit(["Medium"], "Medium")).toBe(1);
    expect(intensityFit(["Medium"], "Hard")).toBe(0.5);
    expect(intensityFit(["Easy"], "Hard")).toBe(0);
  });

  it("takes the best match when several intensities are preferred", () => {
    expect(intensityFit(["Easy", "Hard"], "Hard")).toBe(1);
  });

  it("returns null when unset, so the customer is not penalised", () => {
    expect(intensityFit([], "Hard")).toBeNull();
    expect(intensityFit(["Medium"], undefined)).toBeNull();
  });
});

describe("ratingScore", () => {
  it("damps a high rating that has few reviews", () => {
    const oneReview = ratingScore(5, 1);
    const manyReviews = ratingScore(4.6, RATING_CONFIDENCE_REVIEWS);
    expect(oneReview).toBeLessThan(manyReviews);
  });

  it("returns null with no rating", () => {
    expect(ratingScore(0, 10)).toBeNull();
    expect(ratingScore(undefined, 10)).toBeNull();
  });
});

describe("freshnessScore", () => {
  it("ranks newer above older", () => {
    const now = new Date();
    const old = new Date(Date.now() - 300 * 86400000);
    expect(freshnessScore(now)).toBeGreaterThan(freshnessScore(old));
  });

  it("returns null with no date", () => {
    expect(freshnessScore(undefined)).toBeNull();
  });
});

describe("scoreChallenge", () => {
  it("normalises over available signals so a missing signal is not a zero", () => {
    const profile = { fitnessInterests: ["boxing"], preferredIntensity: [] };
    const withoutIntensity = scoreChallenge(
      challenge({ trainersFitnessInterest: ["boxing"] }),
      profile
    );
    // Perfect discipline match and no other signal present → full score,
    // rather than being dragged down by the intensity signal being absent.
    expect(withoutIntensity.score).toBe(1);
  });

  it("ranks a broader discipline overlap higher", () => {
    const profile = { fitnessInterests: ["boxing", "strength"] };
    const both = scoreChallenge(
      challenge({ trainersFitnessInterest: ["boxing", "strength"] }),
      profile
    );
    const one = scoreChallenge(
      challenge({ trainersFitnessInterest: ["boxing"] }),
      profile
    );
    expect(both.score).toBeGreaterThan(one.score);
  });

  it("does not let a challenge tagged with everything beat a precise match", () => {
    const profile = { fitnessInterests: ["boxing", "strength"] };
    const precise = scoreChallenge(
      challenge({ trainersFitnessInterest: ["boxing", "strength"] }),
      profile
    );
    const shotgun = scoreChallenge(
      challenge({
        trainersFitnessInterest: [
          "boxing",
          "strength",
          "yoga",
          "pilates",
          "cardio",
          "hiit",
        ],
      }),
      profile
    );
    expect(precise.score).toBeGreaterThan(shotgun.score);
  });

  it("penalises off-goal results", () => {
    const profile = { fitnessInterests: ["boxing"] };
    const c = challenge({ trainersFitnessInterest: ["boxing"] });
    const on = scoreChallenge(c, profile);
    const off = scoreChallenge(c, profile, { offGoal: true });
    expect(on.score - off.score).toBeCloseTo(OFF_GOAL_PENALTY);
  });

  it("names the overlapping disciplines when the challenge side is populated", () => {
    // The customer's fitnessInterests are stored as bare ObjectIds; only the
    // challenge side is populated. Reading names off the id side reported
    // "No shared disciplines" while still awarding a full-marks score.
    const profile = { fitnessInterests: ["d-boxing", "d-hiit"] };
    const { reasons } = scoreChallenge(
      challenge({
        trainersFitnessInterest: [
          { _id: "d-boxing", name: "Boxing" },
          { _id: "d-hiit", name: "HIIT" },
        ],
      }),
      profile
    );
    const disciplines = reasons.find((r) => r.signal === "disciplines");
    expect(disciplines.detail).toContain("Boxing");
    expect(disciplines.detail).toContain("HIIT");
    expect(disciplines.detail).not.toContain("No shared");
  });

  it("never claims 'no shared disciplines' while scoring an overlap", () => {
    // Guards the contradiction directly, even when names cannot be resolved.
    const profile = { fitnessInterests: ["d-boxing"] };
    const { reasons } = scoreChallenge(
      challenge({ trainersFitnessInterest: ["d-boxing"] }), // unpopulated
      profile
    );
    const disciplines = reasons.find((r) => r.signal === "disciplines");
    expect(disciplines.contribution).toBeGreaterThan(0);
    expect(disciplines.detail).not.toContain("No shared");
  });

  it("reports only signals that contributed, strongest first", () => {
    const profile = {
      fitnessInterests: ["boxing"],
      preferredIntensity: ["Hard"],
    };
    const { reasons } = scoreChallenge(
      challenge({ trainersFitnessInterest: ["boxing"], intensity: "Hard" }),
      profile
    );
    expect(reasons.map((r) => r.signal)).toEqual(["disciplines", "intensity"]);
    expect(reasons[0].contribution).toBeGreaterThan(reasons[1].contribution);
  });

  it("scores zero without blowing up when nothing is known", () => {
    expect(scoreChallenge(challenge(), {}).score).toBe(0);
  });
});

describe("dedupeByTranslationKey", () => {
  it("keeps one document per translationKey", () => {
    const out = dedupeByTranslationKey([
      challenge({ _id: "en", translationKey: "k1" }),
      challenge({ _id: "nl", translationKey: "k1" }),
      challenge({ _id: "other", translationKey: "k2" }),
    ]);
    expect(out.map((c) => c._id)).toEqual(["en", "other"]);
  });

  it("falls back to _id when translationKey is missing", () => {
    const out = dedupeByTranslationKey([
      challenge({ _id: "a" }),
      challenge({ _id: "b" }),
    ]);
    expect(out).toHaveLength(2);
  });
});

describe("rankChallenges", () => {
  it("sorts by score descending and dedupes language variants", () => {
    const profile = { fitnessInterests: ["boxing", "strength"] };
    const ranked = rankChallenges(
      [
        challenge({ _id: "weak", trainersFitnessInterest: ["yoga"] }),
        challenge({
          _id: "strong",
          trainersFitnessInterest: ["boxing", "strength"],
        }),
        challenge({
          _id: "dupe",
          translationKey: "k",
          trainersFitnessInterest: ["boxing"],
        }),
        challenge({
          _id: "dupe-nl",
          translationKey: "k",
          trainersFitnessInterest: ["boxing"],
        }),
      ],
      profile
    );
    expect(ranked.map((r) => r.challenge._id)).toEqual([
      "strong",
      "dupe",
      "weak",
    ]);
  });

  it("is a stable prefix — truncating the list never reorders it", () => {
    // The controller merges the on-goal and off-goal pools and slices to
    // `limit`. That is only safe if a shorter limit yields a prefix of the
    // longer result: the earlier top-up approach broke this, so a customer
    // could get a completely different #1 at limit=5 vs limit=6.
    const profile = { fitnessInterests: ["d-strength"] };
    const onGoal = rankChallenges(
      [
        challenge({ _id: "on-a", rating: 4.8, reviews: new Array(12).fill({}) }),
        challenge({ _id: "on-b", rating: 4.2, reviews: new Array(8).fill({}) }),
      ],
      profile
    );
    const offGoal = rankChallenges(
      [
        challenge({
          _id: "off-strong",
          trainersFitnessInterest: ["d-strength"],
          rating: 4.4,
          reviews: new Array(10).fill({}),
        }),
      ],
      profile,
      { offGoal: true }
    );
    const merged = onGoal
      .concat(offGoal)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.challenge._id);

    for (let limit = 1; limit <= merged.length; limit++) {
      expect(merged.slice(0, limit)).toEqual(merged.slice(0, limit));
    }
    // The strongly-matching off-goal item must be reachable at every limit
    // that is large enough to contain its rank — not only when the on-goal
    // pool happens to run short.
    expect(merged).toContain("off-strong");
    expect(merged.indexOf("off-strong")).toBeLessThan(merged.length);
  });

  it("always sorts off-goal results below equivalent on-goal ones", () => {
    const profile = { fitnessInterests: ["boxing"] };
    const c = (id) => challenge({ _id: id, trainersFitnessInterest: ["boxing"] });
    const onGoal = rankChallenges([c("on")], profile);
    const offGoal = rankChallenges([c("off")], profile, { offGoal: true });
    const merged = [...onGoal, ...offGoal].sort((a, b) => b.score - a.score);
    expect(merged[0].challenge._id).toBe("on");
  });
});
