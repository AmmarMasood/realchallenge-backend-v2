const mongoose = require("mongoose");

const bodySchema = mongoose.Schema(
  {
    name: {
      type: String,
    },
  },
  { timestamps: true }
);

exports.Body = mongoose.model("Body", bodySchema);
