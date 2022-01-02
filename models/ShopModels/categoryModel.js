const mongoose = require("mongoose");

const categorySchema = mongoose.Schema(
  {
    name: {
      type: String,
    },
  },
  { timestamps: true }
);

exports.Category = mongoose.model("Category", categorySchema);
