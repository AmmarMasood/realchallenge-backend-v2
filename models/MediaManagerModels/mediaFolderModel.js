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
  parentId: {
    type: mongoose.Schema.ObjectId,
    ref: "MediaFolder",
    required: false,
    default: null,
  },
  depth: {
    type: Number,
    default: 0,
    min: 0,
    max: 2, // 0=root, 1=level1, 2=level2 (max 3 levels)
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Ensure unique names per parent folder per user
mediaFolderSchema.index({ user: 1, parentId: 1, name: 1 }, { unique: true });

// Validate depth before saving
mediaFolderSchema.pre("save", async function (next) {
  if (this.parentId) {
    const parent = await mongoose.model("MediaFolder").findById(this.parentId);
    if (!parent) {
      return next(new Error("Parent folder not found"));
    }
    if (parent.depth >= 2) {
      return next(new Error("Maximum folder depth exceeded (3 levels max)"));
    }
    this.depth = parent.depth + 1;
  } else {
    this.depth = 0;
  }
  next();
});

// Cascade delete - remove all child folders and files
mediaFolderSchema.pre("remove", async function (next) {
  const MediaFiles = mongoose.model("MediaFiles");
  const MediaFolder = mongoose.model("MediaFolder");

  // Delete all files in this folder
  await MediaFiles.deleteMany({ folderId: this._id });

  // Find and delete all child folders recursively
  const childFolders = await MediaFolder.find({ parentId: this._id });
  for (const childFolder of childFolders) {
    await childFolder.remove();
  }

  next();
});

module.exports = mongoose.model("MediaFolder", mediaFolderSchema);
