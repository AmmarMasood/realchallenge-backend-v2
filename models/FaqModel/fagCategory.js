const mongoose = require("mongoose");

const faqCategory = mongoose.Schema(
  {
    name: {
      type: String,
    },
  },
  { timestamps: true }
);

exports.FaqCategory = mongoose.model("FaqCategory", faqCategory);
