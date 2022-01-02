const mongoose = require("mongoose");

const reviewSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
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
// recipe comment Schema
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

const recipeSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    description: {
      type: String,
    },
    image: {
      type: String,
      // required: true,
    },
    prepTime: {
      type: Number,
      // required: true,
    },
    kCalPerPerson: {
      type: Number,
      // required: true,
    },
    saturationIndex: {
      type: Number,
    },
    persons: {
      type: Number,
    },
    protein: {
      type: Number,
      // required: true,
    },
    carbohydrate: {
      type: Number,
      // required: true,
    },
    fat: {
      type: Number,
      // required: true,
    },
    fiber: {
      type: Number,
    },
    mealTypes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MealType",
      },
    ],
    foodTypes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "FoodType",
      },
    ],
    diet: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Diet",
      },
    ],
    ingredients: [
      {
        name: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Ingredient",
        },
        weight: { type: Number },
        volume: { type: Number },
        pieces: { type: Number },
        method: { type: String },
        other: { type: String },
      },
    ],
    cookingProcess: [
      {
        type: String,
      },
    ],
    notes: {
      type: String,
    },
    tips: {
      type: String,
    },
    comments: [commentSchema],
    reviews: [reviewSchema],
    rating: {
      type: Number,
      required: true,
      default: 0,
    },
    adminApproved: {
      type: Boolean,
      default: false,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    allowReviews: {
      type: Boolean,
      default: false,
    },
    allowComments: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

exports.Recipe = mongoose.model("Recipe", recipeSchema);
