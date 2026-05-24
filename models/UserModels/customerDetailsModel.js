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
    groceryList: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ingredient",
      },
    ],
    shoulderSize: {
      type: Number,
    },

    waistSize: {
      type: Number,
    },
    hipSize: {
      type: Number,
    },
    chestSize: {
      type: Number,
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
