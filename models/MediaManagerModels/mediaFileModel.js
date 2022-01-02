const mongoose = require("mongoose");
// const userRole = require("../models/userRoles");

const mediaFileSchema = mongoose.Schema({
  user: {
    // in this way each bootcamp is realated to each user
    type: mongoose.Schema.ObjectId,
    ref: "User",
    require: true,
  },
  foldername: {
    type: String,
    required: true,
  },
  filename: {
    type: String,
    required: true,
  },
  filelink: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});
module.exports = mongoose.model("MediaFiles", mediaFileSchema);
