const mongoose = require("mongoose");

const mediaFolderSchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  mediaType: {
    type: String,
    enum: ["video", "audio", "picture", "document", "other"],
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

mediaFolderSchema.pre("remove", async function (next) {
  const MediaFiles = mongoose.model("MediaFiles");
  await MediaFiles.deleteMany({ folderId: this._id });
  next();
});

module.exports = mongoose.model("MediaFolder", mediaFolderSchema);
