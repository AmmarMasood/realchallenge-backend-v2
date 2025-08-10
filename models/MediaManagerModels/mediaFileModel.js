const mongoose = require("mongoose");

const mediaFileSchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
    required: true,
  },
  folderId: {
    type: mongoose.Schema.ObjectId,
    ref: "MediaFolder",
    required: true,
  },
  filename: {
    type: String,
    required: true,
  },
  originalName: {
    type: String,
    required: false,
  },
  filelink: {
    type: String,
    required: true,
  },
  mediaType: {
    type: String,
    enum: ["video", "audio", "picture", "document", "other"],
    required: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("MediaFiles", mediaFileSchema);
