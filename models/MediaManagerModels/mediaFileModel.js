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
  // Immutable location of the bytes in S3. Set once at upload time and never
  // rewritten — in particular a folder move does NOT change it, because the
  // object is not relocated and `filelink` must keep resolving. Legacy records
  // created before this field exists fall back to parsing `filelink`; see
  // utils/mediaStorage.js. Never rebuild this from `folderId`.
  s3Key: {
    type: String,
    required: false,
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
