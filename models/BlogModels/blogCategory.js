const mongoose = require("mongoose");

const blogCategory = mongoose.Schema(
  {
    name: {
      type: String,
    },
    language: {
      type: String,
    },
  },
  { timestamps: true }
);

exports.BlogCategory = mongoose.model("BlogCategory", blogCategory);
