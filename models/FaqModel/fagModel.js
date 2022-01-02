const mongoose = require("mongoose");

const faqSchema = mongoose.Schema(
  {
    question: {
      type: String,
      required: true,
    },
    answer: {
      type: String,
      required: true,
    },
    category: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "FaqCategory",
        required: true,
      },
    ],
    isPublic: {
      type: Boolean,
      default: true,
    },
  },

  {
    timestamps: true,
  }
);

exports.Faq = mongoose.model("Faq", faqSchema);
