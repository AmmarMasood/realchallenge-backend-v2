const mongoose = require("mongoose");

const workoutSchema = mongoose.Schema(
  {
    title: {
      type: String,
    },
    subtitle: {
      type: String,
    },
    infoTitle: {
      type: String,
    },
    infoFile: {
      type: String,
    },
    relatedEquipments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Equipment",
      },
    ],
    relatedProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    introVideoLink: {
      type: String,
    },
    introVideoThumbnailLink: {
      type: String,
    },
    introVideoLength: {
      type: Number,
    },
    // selectedRelatedEquipments: [
    //   {
    //     type: mongoose.Schema.Types.ObjectId,
    //     ref: "Equipment",
    //   },
    // ],
    isRendered: {
      type: Boolean,
    },
    // Workout kind. Older documents don't have this — derive from isRendered
    // (true → "exercise", false → "video"). "audio" is the meditation/
    // breathing type: one audio track + a static image OR looping bg video.
    workoutType: {
      type: String,
      enum: ["exercise", "video", "audio"],
    },
    audioLink: {
      type: String,
    },
    backgroundImageLink: {
      type: String,
    },
    backgroundVideoLink: {
      type: String,
    },
    exercises: [
      {
        exerciseId: { type: mongoose.Schema.Types.ObjectId, ref: "Exercise" },
        exerciseLength: { type: String },
        break: { type: Number },
        groupName: { type: String },
        renderedWorkoutExerciseName: { type: String },
        renderedWorkoutExerciseVideo: { type: String },
      },
    ],
  },
  { timestamps: true }
);

exports.Workout = mongoose.model("Workout", workoutSchema);
