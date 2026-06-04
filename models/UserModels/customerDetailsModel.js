const mongoose = require("mongoose");

const customerDetailsSchema = mongoose.Schema(
  {
    goals: [
      {
        type: String,
      },
    ],
    currentFitnessLevel: [
      {
        type: String,
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
        challengeReview: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Challenges.reviews",
        },
      },
    ],
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

    // Selected trainer-goal interests (Bootcamp, Boxing, Strength, …).
    // Originally captured in the signup wizard and previously dropped by
    // Mongoose strict-mode because the field wasn't on the schema.
    fitnessInterests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TrainerGoal",
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
