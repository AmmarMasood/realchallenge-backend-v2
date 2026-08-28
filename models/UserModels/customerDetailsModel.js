const mongoose = require("mongoose");

const customerDetailsSchema = mongoose.Schema(
  {
    // Exactly one canonical goal slug — see utils/goals.js. Stored as an array
    // for historical reasons; the signup wizard and profile page are both
    // single-select.
    goals: [
      {
        type: String,
      },
    ],
    // Activity level used to derive daily calories (calculateCalories(BMR, …)).
    // NOT a training-difficulty rating — do not use it to match challenge
    // intensity; preferredIntensity below is the field for that.
    currentFitnessLevel: [
      {
        type: String,
      },
    ],
    // Optional. Feeds the challenge recommender's intensity signal; when unset
    // the signal is skipped rather than guessed at.
    preferredIntensity: [
      {
        type: String,
        enum: ["Easy", "Medium", "Hard"],
      },
    ],
    age: {
      type: Number,
    },
    height: {
      type: Number,
    },
    weight: {
      type: Array,
      default: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    measureSystem: {
      type: String,
      default: "metrics",
      enum: ["metrics", "imperial"],
    },

    bmi: {
      type: Number,
    },
    bmir: {
      type: Number,
    },
    caloriesPerDay: {
      type: Number,
    },
    challenges: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Challenges",
      },
    ],
    // Most recently played challenge — set on every progress update so the
    // dashboard can offer a "Continue" entry point
    lastPlayedChallenge: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Challenges",
      default: null,
    },
    trackChallenges: [
      {
        currentWorkout: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Workout",
        },
        currentExercise: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Exercise",
        },
        currentWorkoutCompletionRate: {
          type: Number,
        },
        challenge: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Challenges",
        },
        completedWorkouts: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Workout",
          },
        ],
        challengeCompleted: {
          type: Boolean,
          default: false,
        },
        challengePointGained: {
          type: Boolean,
          default: false,
        },
        challengeCompletionRate: {
          type: Number,
        },
        // When the user last finished a workout in this challenge — drives the
        // dashboard card's "Completed Today" state
        lastWorkoutCompletedAt: {
          type: Date,
          default: null,
        },
        challengeReview: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Challenges.reviews",
        },
      },
    ],
    // Nutrition tab access for users without a subscription.
    //
    // Subscribers are not governed by this at all — an active plan grants the
    // Nutrition tab outright. This is the balance bought by one-off purchases:
    // each paid single challenge adds 30 days, stacking onto whatever is left so
    // nobody loses days they paid for.
    nutritionAccessUntil: {
      type: Date,
    },
    // Free accounts get one 30-day taste of the Nutrition tab, ever. Starting
    // another free challenge later does not grant a second one.
    freeNutritionTrialUsed: {
      type: Boolean,
      default: false,
    },
    completedChallenges: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Challenges",
      },
    ],
    amountOfProtein: {
      type: Number,
    },
    amountOfFat: {
      type: Number,
    },
    amountOfCarbohydrate: {
      type: Number,
    },
    currentCondition: {
      type: String,
    },
    // Late Meal is its own meal-structure setting and coexists with any
    // supplement mode (client 2026-05-16). Read by the planner generator.
    lateMeal: {
      type: Boolean,
      default: false,
    },
    supplementIntake: {
      // Mutually exclusive: none | during-the-day (Fuel Moment) |
      // extra-meal. Fuel Moment & extra-meal cannot coexist.
      supplementOption: {
        type: String,
      },
      recipes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Recipe" }],
      // Fuel Moment replaces a snack the USER chooses — not hardcoded.
      fuelMomentSlot: {
        type: String,
        enum: ["morningSnack", "afternoonSnack", null],
        default: null,
      },
      // Per-supplement day scheduling (NOT one global set).
      schedule: [
        {
          recipe: { type: mongoose.Schema.Types.ObjectId, ref: "Recipe" },
          everyDay: { type: Boolean, default: true },
          days: [{ type: String }], // weekday keys when !everyDay
        },
      ],
    },

    myDiet: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Diet",
      },
    ],
    // The user's allergies / food exclusions, set in onboarding/settings
    // (spec §11: owned by settings, highest-priority filter §12). Recipes
    // whose `allergens` intersect this list are excluded from generation
    // and swap, and pins referencing them are invalidated (§13).
    allergies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Allergen",
      },
    ],
    groceryList: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ingredient",
      },
    ],
    // Body measurements track the user's progress month-by-month, same
    // shape as `weight` above (12 slots, indexed 0=Jan … 11=Dec). The
    // current-month slot is written on each Update Values save. Empty
    // months stay at 0 so chart code can decide whether to plot them.
    shoulderSize: {
      type: Array,
      default: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    waistSize: {
      type: Array,
      default: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    hipSize: {
      type: Array,
      default: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    chestSize: {
      type: Array,
      default: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    beforeImageLink:
      //TODO
      {
        type: String,
      },

    afterImageLink:
      //TODO
      {
        type: String,
      },

    // Hides the user's before/after photos from the public challenges page.
    // Default false to preserve current behavior for existing accounts.
    hideMyShape: {
      type: Boolean,
      default: false,
    },

    // Disciplines the customer is interested in (Boxing, Strength, HIIT, …).
    // Captured in the signup wizard and editable in the profile.
    //
    // This is the PRIMARY signal of the challenge recommender (weight 40): it
    // is matched against `challenge.trainersFitnessInterest`. Both sides now
    // reference the canonical `Discipline` collection — they used to point at
    // `TrainerGoal`, which is trainer-scoped, so the same discipline existed
    // once per trainer and the join broke as soon as two trainers named the
    // same thing. Field name kept for compatibility with existing callers.
    fitnessInterests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Discipline",
      },
    ],

    membership: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Membership",
      },
    ],
    favouriteRecipes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Recipe",
        // unique: true,
      },
    ],
    // User-bookmarked challenges (parallel to favouriteRecipes). Independent
    // of `challenges` (which tracks joined/owned challenges).
    favouriteChallenges: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Challenges",
      },
    ],
    shoppingCart: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Recipe",
      },
    ],
  },
  {
    timestamps: true,
  }
);

exports.CustomerDetails = mongoose.model(
  "CustomerDetails",
  customerDetailsSchema
);
