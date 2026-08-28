/**
 * Read-only diagnostic: print the challenge recommendations for a customer,
 * with the full score breakdown behind each one.
 *
 * Built for before/after diffing — capture the output, change the scoring or
 * the weights, run it again, and diff. Also the fastest way to answer "why did
 * this customer get this challenge?" without attaching a debugger.
 *
 * Mutates nothing.
 *
 *   node scripts/recommend-dump.js <customerUserId>
 *   node scripts/recommend-dump.js <customerUserId> --language=dutch --limit=20
 *   node scripts/recommend-dump.js --list        # print some customer ids to try
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { User } = require("../models/UserModels/userModel");
// Required for its side effect: registers the CustomerDetails schema so the
// populate() calls below resolve. server.js gets this transitively via the
// controllers; a standalone script has to ask for it explicitly.
require("../models/UserModels/customerDetailsModel");
// Same reason: populate("trainersFitnessInterest") resolves to Discipline.
require("../models/DisciplineModels/disciplineModel");
require("../models/UserModels/trainerGoalModel");
const { Challenges } = require("../models/ChallengeModels/challengesModel");
const { DEFAULT_LANGUAGE } = require("../utils/language");
const { resolveCustomerGoal, GOAL_SLUGS } = require("../utils/goals");
const {
  rankChallenges,
  WEIGHTS,
} = require("../services/recommendation/challengeScoring");

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

async function listCustomers() {
  const users = await User.find({})
    .select("_id username email customerDetails")
    .populate({ path: "customerDetails", select: "goals fitnessInterests" })
    .limit(15)
    .lean();

  console.log("\nCustomers (first 15):\n");
  for (const u of users) {
    const goals = (u.customerDetails && u.customerDetails.goals) || [];
    const interests =
      (u.customerDetails && u.customerDetails.fitnessInterests) || [];
    console.log(
      `  ${u._id}  ${(u.username || u.email || "").padEnd(28)} ` +
        `goal=${goals.join(",") || "-"}  interests=${interests.length}`
    );
  }
  console.log(`\nValid goal slugs: ${GOAL_SLUGS.join(", ")}\n`);
}

async function dump(customerId) {
  const language = readArg("language", DEFAULT_LANGUAGE);
  const limit = parseInt(readArg("limit", "10"), 10);

  const customer = await User.findById(customerId)
    .select("-passwordHash")
    .populate("customerDetails");

  if (!customer || !customer.customerDetails) {
    console.log(`\n  Customer ${customerId} not found (or has no details).\n`);
    return;
  }

  const details = customer.customerDetails;
  const goal = resolveCustomerGoal(details.goals);

  console.log(`\n${"=".repeat(78)}`);
  console.log(`Customer : ${customer.username || customer.email} (${customerId})`);
  console.log(`Language : ${language}`);
  console.log(`Goal     : ${goal || "(none set — API returns reason=no_goal)"}`);
  console.log(`  raw goals field: ${JSON.stringify(details.goals)}`);
  console.log(`Interests: ${(details.fitnessInterests || []).length} discipline(s)`);
  console.log(
    `Intensity: ${JSON.stringify(details.preferredIntensity || []) || "[]"}` +
      `${(details.preferredIntensity || []).length ? "" : "  (signal skipped)"}`
  );
  console.log(`Owned    : ${(details.challenges || []).length} challenge(s)`);
  console.log(`Weights  : ${JSON.stringify(WEIGHTS)}`);
  console.log("=".repeat(78));

  if (!goal) return;

  const ownedIds = (details.challenges || []).map((c) => c._id || c);
  const owned = ownedIds.length
    ? await Challenges.find({ _id: { $in: ownedIds } })
        .select("trainers body")
        .lean()
    : [];

  const profile = {
    fitnessInterests: details.fitnessInterests || [],
    preferredIntensity: details.preferredIntensity || [],
    trainerIds: owned.flatMap((c) => c.trainers || []),
    bodyIds: owned.flatMap((c) => c.body || []),
  };

  const baseFilter = {
    isPublic: true,
    adminApproved: true,
    language,
    _id: { $nin: ownedIds },
  };

  // Mirrors the controller: disciplines populated so reasons can name them.
  const withDisciplines = (q) =>
    q.populate("trainersFitnessInterest", "name").lean();

  // Both pools always scored and merged — mirrors the controller.
  const [onGoal, offGoal] = await Promise.all([
    withDisciplines(Challenges.find({ ...baseFilter, challengeGoals: goal })),
    withDisciplines(
      Challenges.find({ ...baseFilter, challengeGoals: { $ne: goal } })
    ),
  ]);
  console.log(
    `\nCandidates after hard filters: ${onGoal.length} on-goal, ` +
      `${offGoal.length} off-goal (penalised)`
  );

  const ranked = rankChallenges(onGoal, profile)
    .concat(rankChallenges(offGoal, profile, { offGoal: true }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (ranked.length === 0) {
    console.log("\n  No recommendations (API returns reason=no_matches).\n");
    return;
  }

  console.log(`\nRanked (${ranked.length}):\n`);
  ranked.forEach((r, i) => {
    const flag = r.offGoal ? " [off-goal]" : "";
    console.log(
      `  ${String(i + 1).padStart(2)}. ${r.score.toFixed(3)}  ` +
        `${r.challenge.challengeName}${flag}`
    );
    console.log(
      `      intensity=${r.challenge.intensity || "-"} ` +
        `rating=${r.challenge.rating || 0} ` +
        `reviews=${(r.challenge.reviews || []).length} ` +
        `goals=${JSON.stringify(r.challenge.challengeGoals || [])}`
    );
    if (r.reasons.length === 0) {
      console.log("      (no signal contributed)");
    }
    for (const reason of r.reasons) {
      console.log(
        `      +${reason.contribution.toFixed(3)} ${reason.signal.padEnd(16)} ${reason.detail}`
      );
    }
    console.log("");
  });
}

(async () => {
  await connectDB();
  try {
    if (process.argv.includes("--list")) {
      await listCustomers();
    } else {
      const id = process.argv[2];
      if (!id || id.startsWith("--")) {
        console.log(
          "\n  Usage: node scripts/recommend-dump.js <customerUserId> [--language=english] [--limit=10]" +
            "\n         node scripts/recommend-dump.js --list\n"
        );
      } else {
        await dump(id);
      }
    }
  } catch (err) {
    console.error("\n  Failed:", err.message, "\n");
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
})();
