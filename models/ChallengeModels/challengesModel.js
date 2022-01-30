const mongoose = require("mongoose");

// Challenge Review Schema
const reviewSchema = mongoose.Schema(
  {
    rating: { type: Number, required: true },
    comment: { type: String, required: true },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Challenge comment Schema
const commentSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    text: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

const challengesSchema = mongoose.Schema(
  {
    language: {
      type: String,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    challengeName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    points: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      required: true,
    },
    thumbnailLink: {
      type: String,
      required: true,
    },
    videoThumbnailLink: {
      type: String,
      required: true,
    },
    videoLink: {
      type: String,
      required: true,
    },
    //TODO: membership
    access: [
      {
        type: String,
      },
    ],
    difficulty: {
      type: String,
    },
    trainers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    challengeGoals: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ChallengeGoals",
        required: true,
      },
    ],
    tags: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tags",
      },
    ],
    body: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Body",
      },
    ],

    duration: {
      type: Number,
      required: true,
    },

    weeks: [
      {
        weekName: {
          type: String,
          required: true,
        },
        weekSubtitle: {
          type: String,
        },
        workouts: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Workout",
            required: true,
          },
        ],
      },
    ],
    additionalProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    music: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Music",
      },
    ],
    results: {
      type: String,
    },
    informationList: [
      {
        info: {
          type: String,
        },
        icon: { type: String },
      },
    ],
    allowComments: {
      type: Boolean,
      default: false,
    },
    allowReviews: {
      type: Boolean,
      default: false,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    createPost: {
      type: Boolean,
      default: false,
    },
    adminApproved: {
      type: Boolean,
      default: false,
    },
    trainersFitnessInterest: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TrainerGoal",
      },
    ],
    reviews: [reviewSchema],
    comments: [commentSchema],
    rating: {
      type: Number,
      required: true,
      default: 0,
    },
  },

  { timestamps: true }
);

exports.Challenges = mongoose.model("Challenges", challengesSchema);
