const mongoose = require("mongoose");

// Tracks MediaConvert transcode jobs for user-uploaded videos (community posts,
// before/after photos flow). These uploads have no MediaFiles record — the S3
// key is the only identity, and the transcoded output is copied over it in
// place so the CloudFront URL stored on the post never changes.
const userVideoJobSchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
    required: true,
  },
  s3Key: {
    type: String,
    required: true,
  },
  mediaConvertJobId: {
    type: String,
    default: null,
  },
  status: {
    type: String,
    enum: ["processing", "completed", "failed"],
    default: "processing",
  },
  originalSize: {
    type: Number,
    default: null,
  },
  optimizedSize: {
    type: Number,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

userVideoJobSchema.index({ status: 1 });

module.exports = mongoose.model("UserVideoJob", userVideoJobSchema);
