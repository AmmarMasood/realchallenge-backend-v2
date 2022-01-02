const mongoose = require("mongoose");

const musicSchema = mongoose.Schema(
  {
    name: {
      type: String,
    },
    url: {
      type: String,
    },
  },
  { timestamps: true }
);

exports.Music = mongoose.model("Music", musicSchema);
