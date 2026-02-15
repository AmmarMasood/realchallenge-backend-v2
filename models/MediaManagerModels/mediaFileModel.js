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
  size: {
    type: Number,
    required: false,
  },
  thumbnailUrl: {
    type: String,
    required: false,
  },
  processingStatus: {
    type: String,
    enum: ["none", "processing", "completed", "failed"],
    default: "none",
  },
  mediaConvertJobId: {
    type: String,
    default: null,
  },
  originalSize: {
    type: Number,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Ensure unique filenames per folder
mediaFileSchema.index({ folderId: 1, originalName: 1 }, { unique: true });

module.exports = mongoose.model("MediaFiles", mediaFileSchema);
