const asyncHandler = require("express-async-handler");
const {
  uploadFile,
  deleteFile,
  deleteFolderFromS3,
} = require("../../config/s3");
const fs = require("fs");
const path = require("path");

const MediaFiles = require("../../models/MediaManagerModels/mediaFileModel");
const MediaFolder = require("../../models/MediaManagerModels/mediaFolderModel");
const { User } = require("../../models/UserModels/userModel"); // Assuming you have a User model

const unLinkFile = async (filename) => {
  const filePath = path.join(__dirname, "../../uploads/", filename);
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    console.error("Error deleting file:", err);
  }
};

// @desc    test route
// @route   get /api/media/test
// @access  private
const testMediaRoute = asyncHandler(async (req, res, next) => {
  console.log(req.user);
  res.status(200).json({ message: "test success" });
});

// @desc    Create media folder with hierarchy support
// @route   POST /api/media/folder
// @access  private
const createMediaFolder = asyncHandler(async (req, res, next) => {
  const { name, mediaType, parentId, forUser } = req.body;
  const user = req.user;

  // If admin and forUser is provided, create folder for that user
  if (user.role === "admin" && forUser) {
    const targetUser = await User.findById(forUser);
    if (!targetUser) {
      return res.status(404).json({ message: "Target user not found" });
    }
    user._id = targetUser._id; // Switch context to target user
  }

  if (!name || !mediaType) {
    return res.status(400).json({ message: "Name and mediaType are required" });
  }

  console.log("Creating folder with parentId:", parentId, "for user:", user);
  // Check if parent exists and validate depth
  let depth = 0;
  if (parentId) {
    const parent = await MediaFolder.findById(parentId);
    console.log("Parent folder:", parent);
    if (!parent) {
      return res.status(404).json({ message: "Parent folder not found" });
    }
    if (
      parent.user.toString() !== user._id.toString() &&
      user.role !== "admin"
    ) {
      return res
        .status(403)
        .json({ message: "Access denied to parent folder" });
    }
    if (parent.depth >= 2) {
      return res
        .status(400)
        .json({ message: "Maximum folder depth exceeded (3 levels max)" });
    }
    depth = parent.depth + 1;
  }

  // Check for unique name within parent
  const existingFolder = await MediaFolder.findOne({
    user: user._id,
    parentId: parentId || null,
    name,
  });

  if (existingFolder) {
    return res.status(400).json({
      message: "A folder with this name already exists in this location",
    });
  }

  const folder = await MediaFolder.create({
    user: user._id,
    name,
    mediaType,
    parentId: parentId || null,
    depth,
  });

  res.status(201).json({ folder, message: "Folder created successfully" });
});

// @desc    Get media folder with children
// @route   GET /api/media/folder/:id
// @access  private
const getMediaFolder = asyncHandler(async (req, res, next) => {
  const folder = await MediaFolder.findById(req.params.id);
  if (!folder) {
    return res.status(404).json({ message: "Folder not found" });
  }

  // Get child folders
  const childFolders = await MediaFolder.find({ parentId: req.params.id });

  res.status(200).json({ folder, childFolders });
});

// @desc    Delete media folder and all contents
// @route   DELETE /api/media/folder/:id
// @access  private
const deleteMediaFolder = asyncHandler(async (req, res, next) => {
  const folder = await MediaFolder.findById(req.params.id);
  if (!folder) {
    return res.status(404).json({ message: "Folder not found" });
  }

  if (folder.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: "Access denied" });
  }

  await folder.remove();
  await deleteFolderFromS3(req.params.id);
  res.status(200).json({ message: "Folder and associated media deleted" });
});

// @desc    Update media folder
// @route   PUT /api/media/folder/:id
// @access  private
const updateMediaFolder = asyncHandler(async (req, res, next) => {
  const { name, mediaType } = req.body;
  const folder = await MediaFolder.findById(req.params.id);

  if (!folder) {
    return res.status(404).json({ message: "Folder not found" });
  }

  if (folder.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: "Access denied" });
  }

  // Check for unique name if name is being changed
  if (name && name !== folder.name) {
    const existingFolder = await MediaFolder.findOne({
      user: req.user._id,
      parentId: folder.parentId,
      name,
      _id: { $ne: folder._id },
    });

    if (existingFolder) {
      return res.status(400).json({
        message: "A folder with this name already exists in this location",
      });
    }
    folder.name = name;
  }

  if (mediaType) folder.mediaType = mediaType;
  await folder.save();
  res.status(200).json({ folder, message: "Folder updated successfully" });
});

// @desc    Get all media folders organized by users (admin only)
// @route   GET /api/media/folders/admin
// @access  private/admin
const getAllMediaFoldersGroupedByUser = asyncHandler(async (req, res, next) => {
  const isAdmin = req.user && req.user.role === "admin";
  // Check if user is admin
  if (!isAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }

  // Get all users who have media folders
  const usersWithFolders = await User.aggregate([
    {
      $lookup: {
        from: "mediafolders", // Collection name in MongoDB (lowercase + plural)
        localField: "_id",
        foreignField: "user",
        as: "folders",
      },
    },
    {
      $match: {
        "folders.0": { $exists: true }, // Only users who have at least one folder
      },
    },
    {
      $project: {
        _id: 1,
        name: 1,
        email: 1,
        folders: {
          $map: {
            input: "$folders",
            as: "folder",
            in: {
              _id: "$$folder._id",
              name: "$$folder.name",
              mediaType: "$$folder.mediaType",
              parentId: "$$folder.parentId",
              depth: "$$folder.depth",
              createdAt: "$$folder.createdAt",
            },
          },
        },
      },
    },
    {
      $sort: { name: 1 },
    },
  ]);

  // Transform the data to organize folders hierarchically for each user
  const transformedData = usersWithFolders.map((user) => {
    // Organize folders in hierarchical structure
    const folderMap = {};
    const rootFolders = [];

    // First pass: create folder map
    user.folders.forEach((folder) => {
      folderMap[folder._id] = { ...folder, children: [] };
    });

    // Second pass: organize hierarchy
    user.folders.forEach((folder) => {
      if (folder.parentId && folderMap[folder.parentId]) {
        folderMap[folder.parentId].children.push(folderMap[folder._id]);
      } else {
        rootFolders.push(folderMap[folder._id]);
      }
    });

    return {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
      },
      folders: rootFolders,
      totalFolders: user.folders.length,
    };
  });

  res.status(200).json({
    users: transformedData,
    totalUsers: transformedData.length,
  });
});

// @desc    Get all media folders (admin only) - Original function kept for backward compatibility
// @route   GET /api/media/folders
// @access  private/admin
const getAllMediaFolders = asyncHandler(async (req, res, next) => {
  const folders = await MediaFolder.find({}).populate("user", "name email");
  res.status(200).json({ folders });
});

// @desc    Get user's media folders with hierarchy
// @route   GET /api/media/folders/user
// @access  private
const getUserMediaFolders = asyncHandler(async (req, res, next) => {
  const folders = await MediaFolder.find({ user: req.user._id }).sort({
    depth: 1,
    name: 1,
  });
  res.status(200).json({ folders });
});

// @desc    Get specific user's folders (admin only)
// @route   GET /api/media/folders/user/:userId
// @access  private/admin
const getSpecificUserFolders = asyncHandler(async (req, res, next) => {
  const isAdmin = req.user && req.user.role === "admin";
  // Check if user is admin
  if (!isAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }

  const { userId } = req.params;

  // Check if the user exists
  const userExists = await User.findById(userId);
  if (!userExists) {
    return res.status(404).json({ message: "User not found" });
  }

  // Get folders for the specific user
  const folders = await MediaFolder.find({ user: userId })
    .populate("user", "name email")
    .sort({ depth: 1, name: 1 });

  // Organize folders in hierarchical structure
  const folderMap = {};
  const rootFolders = [];

  // First pass: create folder map
  folders.forEach((folder) => {
    folderMap[folder._id] = {
      ...folder.toObject(),
      children: [],
    };
  });

  // Second pass: organize hierarchy
  folders.forEach((folder) => {
    if (folder.parentId && folderMap[folder.parentId]) {
      folderMap[folder.parentId].children.push(folderMap[folder._id]);
    } else {
      rootFolders.push(folderMap[folder._id]);
    }
  });

  res.status(200).json({
    user: {
      _id: userExists._id,
      name: userExists.name,
      email: userExists.email,
    },
    folders: rootFolders,
    totalFolders: folders.length,
  });
});

// @desc    Upload file to folder
// @route   POST /api/media/folders/:folderId
// @access  private
const uploadMediaFile = asyncHandler(async (req, res, next) => {
  const folderId = req.params.folderId;
  const user = req.user;
  const file = req.file;

  const isAdmin = req.user && req.user.role === "admin";

  console.log("Uploaded file:", file);

  if (!file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const folder = await MediaFolder.findById(folderId);
  if (!folder) {
    return res.status(404).json({ message: "Folder not found" });
  }

  // Allow admin to upload to any folder, regular users only to their own
  if (!isAdmin && folder.user.toString() !== user._id.toString()) {
    return res.status(403).json({ message: "Access denied to folder" });
  }

  // Check for unique filename
  const existingFile = await MediaFiles.findOne({
    folderId,
    originalName: file.originalname,
  });

  if (existingFile) {
    await unLinkFile(file.filename);
    return res
      .status(400)
      .json({ message: "A file with this name already exists in this folder" });
  }

  const { Location } = await uploadFile(file, folderId);
  await unLinkFile(file.filename);

  const mediaFile = await MediaFiles.create({
    user: folder.user, // Use folder owner as file owner
    folderId: folderId,
    filename: file.filename,
    originalName: file.originalname,
    filelink: Location,
    mediaType: folder.mediaType,
    size: file.size,
  });

  res.status(201).json({ mediaFile, message: "File uploaded successfully" });
});

// @desc    Get files in folder
// @route   GET /api/media/folders/:folderId/files
// @access  private
const getMediaFolderFiles = asyncHandler(async (req, res, next) => {
  const folderId = req.params.folderId;
  const isAdmin = req.user && req.user.role === "admin";

  // Verify folder access
  const folder = await MediaFolder.findById(folderId);
  if (!folder) {
    return res.status(404).json({ message: "Folder not found" });
  }

  // Allow admin to view any folder, regular users only their own
  if (!isAdmin && folder.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: "Access denied" });
  }

  const files = await MediaFiles.find({ folderId }).sort({ originalName: 1 });
  res.status(200).json({ files });
});

// @desc    Delete file
// @route   DELETE /api/media/folders/:folderId/files/:fileId
// @access  private
const deleteMediaFile = asyncHandler(async (req, res, next) => {
  const { folderId, fileId } = req.params;
  const isAdmin = req.user && req.user.role === "admin";
  const file = await MediaFiles.findOne({ _id: fileId, folderId });

  if (!file) {
    return res.status(404).json({ message: "File not found" });
  }

  // Allow admin to delete any file, regular users only their own
  if (!isAdmin && file.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: "Access denied" });
  }

  await deleteFile(folderId, file.filename);
  await file.remove();
  res.status(200).json({ message: "File deleted successfully" });
});

// @desc    Update file (rename)
// @route   PUT /api/media/folders/:folderId/files/:fileId
// @access  private
const updateMediaFile = asyncHandler(async (req, res, next) => {
  const { folderId, fileId } = req.params;
  const { originalName } = req.body;
  const isAdmin = req.user && req.user.role === "admin";

  const file = await MediaFiles.findOne({ _id: fileId, folderId });
  if (!file) {
    return res.status(404).json({ message: "File not found" });
  }

  // Allow admin to update any file, regular users only their own
  if (!isAdmin && file.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: "Access denied" });
  }

  if (originalName && originalName !== file.originalName) {
    // Check for unique name
    const existingFile = await MediaFiles.findOne({
      folderId,
      originalName,
      _id: { $ne: fileId },
    });

    if (existingFile) {
      return res.status(400).json({
        message: "A file with this name already exists in this folder",
      });
    }

    file.originalName = originalName;
    await file.save();
  }

  res.status(200).json({ file, message: "File updated successfully" });
});

const moveMediaFile = asyncHandler(async (req, res, next) => {
  const { folderId, fileId } = req.params;
  const { newFolderId } = req.body;
  const isAdmin = req.user && req.user.role === "admin";

  // Find the file
  const file = await MediaFiles.findOne({ _id: fileId, folderId });
  if (!file) {
    return res.status(404).json({ message: "File not found" });
  }

  // Allow admin to move any file, regular users only their own
  if (!isAdmin && file.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: "Access denied" });
  }

  // Verify destination folder exists and user has access
  const destinationFolder = await MediaFolder.findById(newFolderId);
  if (!destinationFolder) {
    return res.status(404).json({ message: "Destination folder not found" });
  }

  // Allow admin to move to any folder, regular users only to their own
  if (
    !isAdmin &&
    destinationFolder.user.toString() !== req.user._id.toString()
  ) {
    return res
      .status(403)
      .json({ message: "Access denied to destination folder" });
  }

  // Check for name conflicts in destination folder
  const existingFile = await MediaFiles.findOne({
    folderId: newFolderId,
    originalName: file.originalName,
  });

  if (existingFile) {
    return res.status(400).json({
      message: "A file with this name already exists in the destination folder",
    });
  }

  // Update the file's folder
  file.folderId = newFolderId;
  file.mediaType = destinationFolder.mediaType; // Update media type to match folder
  await file.save();

  res.status(200).json({
    file,
    message: "File moved successfully",
    oldFolderId: folderId,
    newFolderId: newFolderId,
  });
});

module.exports = {
  testMediaRoute,
  createMediaFolder,
  getMediaFolder,
  deleteMediaFolder,
  updateMediaFolder,
  getAllMediaFolders,
  getAllMediaFoldersGroupedByUser, // New function for admin
  getSpecificUserFolders, // New function for admin
  getUserMediaFolders,
  uploadMediaFile,
  getMediaFolderFiles,
  deleteMediaFile,
  updateMediaFile,
  moveMediaFile,
};
