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
  const { name, mediaType, parentId } = req.body;
  const user = req.user;

  if (!name || !mediaType) {
    return res.status(400).json({ message: "Name and mediaType are required" });
  }

  // Check if parent exists and validate depth
  let depth = 0;
  if (parentId) {
    const parent = await MediaFolder.findById(parentId);
    if (!parent) {
      return res.status(404).json({ message: "Parent folder not found" });
    }
    if (parent.user.toString() !== user._id.toString()) {
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

// @desc    Get all media folders (admin only)
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

// @desc    Upload file to folder
// @route   POST /api/media/folders/:folderId
// @access  private
const uploadMediaFile = asyncHandler(async (req, res, next) => {
  const folderId = req.params.folderId;
  const user = req.user;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const folder = await MediaFolder.findById(folderId);
  if (!folder) {
    return res.status(404).json({ message: "Folder not found" });
  }

  if (folder.user.toString() !== user._id.toString()) {
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
    user: user._id,
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

  // Verify folder access
  const folder = await MediaFolder.findById(folderId);
  if (!folder) {
    return res.status(404).json({ message: "Folder not found" });
  }

  if (folder.user.toString() !== req.user._id.toString()) {
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
  const file = await MediaFiles.findOne({ _id: fileId, folderId });

  if (!file) {
    return res.status(404).json({ message: "File not found" });
  }

  if (file.user.toString() !== req.user._id.toString()) {
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

  const file = await MediaFiles.findOne({ _id: fileId, folderId });
  if (!file) {
    return res.status(404).json({ message: "File not found" });
  }

  if (file.user.toString() !== req.user._id.toString()) {
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

  // Find the file
  const file = await MediaFiles.findOne({ _id: fileId, folderId });
  if (!file) {
    return res.status(404).json({ message: "File not found" });
  }

  // Check user ownership
  if (file.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: "Access denied" });
  }

  // Verify destination folder exists and user has access
  const destinationFolder = await MediaFolder.findById(newFolderId);
  if (!destinationFolder) {
    return res.status(404).json({ message: "Destination folder not found" });
  }

  if (destinationFolder.user.toString() !== req.user._id.toString()) {
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
  getUserMediaFolders,
  uploadMediaFile,
  getMediaFolderFiles,
  deleteMediaFile,
  updateMediaFile,
  moveMediaFile,
};
