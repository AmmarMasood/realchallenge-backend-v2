const mongoose = require("mongoose");

const goalsSchema = mongoose.Schema(
  {
    name: {
      type: String,
    },
  },
  { timestamps: true }
);

exports.Goals = mongoose.model("Goals", goalsSchema);
