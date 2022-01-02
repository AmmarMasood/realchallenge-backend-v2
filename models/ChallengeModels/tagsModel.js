const mongoose = require("mongoose");

const tagsSchema = mongoose.Schema(
  {
    name: {
      type: String,
    },
  },
  { timestamps: true }
);

exports.Tags = mongoose.model("Tags", tagsSchema);
