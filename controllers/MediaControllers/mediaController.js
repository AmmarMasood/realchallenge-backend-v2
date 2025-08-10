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

const createMediaFolder = asyncHandler(async (req, res, next) => {
  const { name, mediaType } = req.body;
  const user = req.user;
  if (!name || !mediaType) {
    return res.status(400).json({ message: "Name and mediaType are required" });
  }
  const folder = await MediaFolder.create({
    user: user._id,
    name,
    mediaType,
  });
  res.status(201).json({ folder, message: "Folder created successfully" });
});

const getMediaFolder = asyncHandler(async (req, res, next) => {
  const folder = await MediaFolder.findById(req.params.id);
  if (!folder) {
    return res.status(404).json({ message: "Folder not found" });
  }
  res.status(200).json({ folder });
});

const deleteMediaFolder = asyncHandler(async (req, res, next) => {
  const folder = await MediaFolder.findById(req.params.id);
  if (!folder) {
    return res.status(404).json({ message: "Folder not found" });
  }
  await folder.remove();
  await deleteFolderFromS3(req.params.id);
  res.status(200).json({ message: "Folder and associated media deleted" });
});

const updateMediaFolder = asyncHandler(async (req, res, next) => {
  const { name, mediaType } = req.body;
  const folder = await MediaFolder.findById(req.params.id);
  if (!folder) {
    return res.status(404).json({ message: "Folder not found" });
  }
  if (name) folder.name = name;
  if (mediaType) folder.mediaType = mediaType;
  await folder.save();
  res.status(200).json({ folder, message: "Folder updated successfully" });
});

const getAllMediaFolders = asyncHandler(async (req, res, next) => {
  const folders = await MediaFolder.find({});
  res.status(200).json({ folders });
});

const getUserMediaFolders = asyncHandler(async (req, res, next) => {
  const folders = await MediaFolder.find({ user: req.user._id });
  res.status(200).json({ folders });
});

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

  const { Location } = await uploadFile(file, folderId);

  await unLinkFile(file.filename);
  const filelink = Location;

  const mediaFile = await MediaFiles.create({
    user: user._id,
    folderId: folderId,
    filename: file.filename,
    originalName: file.originalname,
    filelink: filelink,
    mediaType: folder.mediaType, // or detect from file.mimetype
  });

  res.status(201).json({ mediaFile, message: "File uploaded successfully" });
});

const getMediaFolderFiles = asyncHandler(async (req, res, next) => {
  const folderId = req.params.folderId;
  const files = await MediaFiles.find({ folderId });
  res.status(200).json({ files });
});

const deleteMediaFile = asyncHandler(async (req, res, next) => {
  const { folderId, fileId } = req.params;
  const file = await MediaFiles.findOne({ _id: fileId, folderId });
  if (!file) {
    return res.status(404).json({ message: "File not found" });
  }

  await deleteFile(folderId, file.filename);

  await file.remove();
  res.status(200).json({ message: "File deleted successfully" });
});

// const destroy = asyncHandler(async (req, res, next) => {
//   try {
//     await MediaFiles.deleteMany({});
//     res
//       .status(200)
//       .send({ status: "Successfully removed all documents from media files" });
//   } catch (err) {
//     console.log(err);
//     next(err);
//   }
// });

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
};
