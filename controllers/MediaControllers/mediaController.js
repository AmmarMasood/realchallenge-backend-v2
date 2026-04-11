const asyncHandler = require("express-async-handler");
const {
  uploadFile,
  deleteFile,
  deleteFolderFromS3,
  deleteThumbnailFile,
  getCloudFrontUrl,
  getPresignedPutUrl,
  headObject,
} = require("../../config/s3");
const fs = require("fs");
const path = require("path");
const ThumbnailService = require("../../services/thumbnailService");
const VideoOptimizationService = require("../../services/videoOptimizationService");
const mediaConvertService = require("../../services/mediaConvertService");
const imageOptimizationService = require("../../services/imageOptimizationService");
const {
  sendProgressUpdate,
  sendUploadComplete,
  sendUploadError,
} = require("./progressController");
const { hasRole } = require("../../middlewares/authMiddleware");

const { v4: uuidv4 } = require("uuid");
const MediaFiles = require("../../models/MediaManagerModels/mediaFileModel");
const MediaFolder = require("../../models/MediaManagerModels/mediaFolderModel");
const { User } = require("../../models/UserModels/userModel"); // Assuming you have a User model

// Maximum file size: 150MB in bytes
const MAX_FILE_SIZE = 400 * 1024 * 1024; // 400MB

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
  if (hasRole(user, "admin") && forUser) {
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
      !hasRole(user, "admin")
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
  const isAdmin = hasRole(req.user, "admin");
  const folder = await MediaFolder.findById(req.params.id);
  if (!folder) {
    return res.status(404).json({ message: "Folder not found" });
  }

  // Allow if owner OR admin
  if (folder.user.toString() !== req.user._id.toString() && !isAdmin) {
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
  const isAdmin = hasRole(req.user, "admin");
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
        firstName: 1,
        lastName: 1,
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
        firstName: user.firstName,
        lastName: user.lastName,
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
  const isAdmin = hasRole(req.user, "admin");
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

  // Get folders for the specific user - return flat array like regular user endpoint
  const folders = await MediaFolder.find({ user: userId })
    .populate("user", "name email")
    .sort({ depth: 1, name: 1 });

  res.status(200).json({
    user: {
      _id: userExists._id,
      name: userExists.name,
      email: userExists.email,
    },
    folders: folders, // Return exactly like getUserMediaFolders - keep mongoose documents
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

  const isAdmin = hasRole(req.user, "admin");

  console.log("Uploaded file:", file);

  if (!file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    await unLinkFile(file.filename);
    return res.status(400).json({
      message: `File size exceeds the maximum limit of ${Math.round(
        MAX_FILE_SIZE / (1024 * 1024)
      )}MB`,
      fileSize: file.size,
      maxSize: MAX_FILE_SIZE,
    });
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

  let finalFile = file;
  let uploadResult;

  // VIDEO OPTIMIZATION DISABLED - To prevent EC2 instance crashes on t3.micro
  // If you upgrade to t3.small or higher, you can re-enable this
  // if (VideoOptimizationService.isVideoFile(file.mimetype)) {
  //   try {
  //     console.log("Optimizing video for streaming:", file.originalname);
  //     const optimizedResult =
  //       await VideoOptimizationService.processVideoForStreaming(
  //         file,
  //         path.dirname(file.path)
  //       );
  //
  //     // Create a new file object for the optimized video
  //     finalFile = {
  //       ...file,
  //       path: optimizedResult.optimizedPath,
  //       filename: optimizedResult.optimizedFilename,
  //       size: fs.statSync(optimizedResult.optimizedPath).size,
  //     };
  //
  //     console.log("Video optimization completed");
  //   } catch (optimizationError) {
  //     console.error(
  //       "Video optimization failed, using original:",
  //       optimizationError
  //     );
  //     // Continue with original file if optimization fails
  //   }
  // }

  console.log(
    "Uploading original file (optimization disabled):",
    file.originalname
  );
  uploadResult = await uploadFile(finalFile, folderId);

  // Convert S3 URL to CloudFront URL for better performance
  const s3Key = `${folderId}/${finalFile.filename}`;
  const cloudFrontUrl = getCloudFrontUrl(s3Key);

  // Initialize thumbnail URL
  let thumbnailUrl = null;

  // Generate thumbnail for video files BEFORE unlinking
  if (ThumbnailService.isVideoFile(file.mimetype)) {
    try {
      console.log("Generating thumbnail for video file:", file.originalname);
      const thumbnailS3Url = await ThumbnailService.generateVideoThumbnail(
        file,
        folderId
      );

      // Convert thumbnail S3 URL to CloudFront URL if possible
      if (thumbnailS3Url) {
        const thumbnailFilename = ThumbnailService.getThumbnailFilename(
          file.filename
        );
        const thumbnailS3Key = `${folderId}/${thumbnailFilename}`;
        thumbnailUrl = getCloudFrontUrl(thumbnailS3Key);
      }
      console.log("Thumbnail generated successfully:", thumbnailUrl);
    } catch (thumbnailError) {
      console.error("Error generating thumbnail:", thumbnailError);
      // Continue with file upload even if thumbnail generation fails
    }
  }

  // Clean up temporary files
  await unLinkFile(file.filename);
  if (finalFile.path !== file.path) {
    await unLinkFile(finalFile.filename);
  }

  const mediaFile = await MediaFiles.create({
    user: folder.user, // Use folder owner as file owner
    folderId: folderId,
    filename: finalFile.filename,
    originalName: file.originalname,
    filelink: cloudFrontUrl, // Use CloudFront URL instead of S3 URL
    mediaType: folder.mediaType,
    size: finalFile.size,
    thumbnailUrl: thumbnailUrl,
  });

  res.status(201).json({ mediaFile, message: "File uploaded successfully" });

  // Fire-and-forget: start MediaConvert optimization for video files
  if (ThumbnailService.isVideoFile(file.mimetype)) {
    const s3Key = `${folderId}/${finalFile.filename}`;
    (async () => {
      try {
        const jobId = await mediaConvertService.createTranscodeJob(
          s3Key,
          folderId,
          mediaFile._id.toString()
        );
        mediaFile.processingStatus = "processing";
        mediaFile.mediaConvertJobId = jobId;
        mediaFile.originalSize = finalFile.size;
        await mediaFile.save();
        console.log(`[MediaConvert] Started job ${jobId} for ${file.originalname}`);
      } catch (err) {
        console.error("[MediaConvert] Failed to create job:", err.message);
        mediaFile.processingStatus = "failed";
        await mediaFile.save();
      }
    })();
  } else if (imageOptimizationService.isOptimizableImage(file.mimetype)) {
    // Fire-and-forget: sharp-based image optimization (in-place overwrite, same URL)
    const s3Key = `${folderId}/${finalFile.filename}`;
    imageOptimizationService
      .optimizeImageInPlace({
        s3Key,
        fileId: mediaFile._id.toString(),
        mimetype: file.mimetype,
      })
      .catch((err) =>
        console.error("[ImageOpt] Unhandled error:", err.message)
      );
  }
});

// @desc    Upload file to folder with progress tracking
// @route   POST /api/media/folders/:folderId/with-progress
// @access  private
const uploadMediaFileWithProgress = asyncHandler(async (req, res, next) => {
  const folderId = req.params.folderId;
  const user = req.user;
  const file = req.file;
  const uploadId = req.body.uploadId || req.headers["x-upload-id"];

  const isAdmin = hasRole(req.user, "admin");

  console.log("Uploaded file with progress tracking:", file);
  console.log("Upload ID:", uploadId);

  if (!uploadId) {
    return res
      .status(400)
      .json({ message: "Upload ID is required for progress tracking" });
  }

  if (!file) {
    sendUploadError(user._id, uploadId, new Error("No file uploaded"));
    return res.status(400).json({ message: "No file uploaded" });
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    await unLinkFile(file.filename);
    const error = new Error(
      `File size exceeds the maximum limit of ${Math.round(
        MAX_FILE_SIZE / (1024 * 1024)
      )}MB`
    );
    sendUploadError(user._id, uploadId, error);
    return res.status(400).json({
      message: error.message,
      fileSize: file.size,
      maxSize: MAX_FILE_SIZE,
    });
  }

  try {
    // Step 1: Validate folder (5%)
    sendProgressUpdate(user._id, uploadId, {
      stage: "validating",
      progress: 5,
      message: "Validating folder...",
    });

    const folder = await MediaFolder.findById(folderId);
    if (!folder) {
      sendUploadError(user._id, uploadId, new Error("Folder not found"));
      return res.status(404).json({ message: "Folder not found" });
    }

    // Allow admin to upload to any folder, regular users only to their own
    if (!isAdmin && folder.user.toString() !== user._id.toString()) {
      sendUploadError(user._id, uploadId, new Error("Access denied to folder"));
      return res.status(403).json({ message: "Access denied to folder" });
    }

    // Step 2: Check for unique filename (10%)
    sendProgressUpdate(user._id, uploadId, {
      stage: "checking_duplicates",
      progress: 10,
      message: "Checking for duplicate files...",
    });

    const existingFile = await MediaFiles.findOne({
      folderId,
      originalName: file.originalname,
    });

    if (existingFile) {
      await unLinkFile(file.filename);
      sendUploadError(
        user._id,
        uploadId,
        new Error("A file with this name already exists in this folder")
      );
      return res
        .status(400)
        .json({
          message: "A file with this name already exists in this folder",
        });
    }

    let finalFile = file;
    let uploadResult;

    // Step 3: Video optimization DISABLED - To prevent EC2 instance crashes on t3.micro
    // If you upgrade to t3.small or higher, you can re-enable this
    // if (VideoOptimizationService.isVideoFile(file.mimetype)) {
    //   sendProgressUpdate(user._id, uploadId, {
    //     stage: "optimizing_video",
    //     progress: 15,
    //     message: "Optimizing video for streaming..."
    //   });
    //
    //   try {
    //     console.log("Optimizing video for streaming:", file.originalname);
    //     const optimizedResult = await VideoOptimizationService.processVideoForStreaming(
    //       file,
    //       path.dirname(file.path)
    //     );
    //
    //     sendProgressUpdate(user._id, uploadId, {
    //       stage: "optimizing_video",
    //       progress: 45,
    //       message: "Video optimization completed"
    //     });
    //
    //     // Create a new file object for the optimized video
    //     finalFile = {
    //       ...file,
    //       path: optimizedResult.optimizedPath,
    //       filename: optimizedResult.optimizedFilename,
    //       size: fs.statSync(optimizedResult.optimizedPath).size,
    //     };
    //
    //     console.log("Video optimization completed");
    //   } catch (optimizationError) {
    //     console.error("Video optimization failed, using original:", optimizationError);
    //     sendProgressUpdate(user._id, uploadId, {
    //       stage: "optimizing_video",
    //       progress: 45,
    //       message: "Video optimization failed, using original file"
    //     });
    //   }
    // } else {
    //   sendProgressUpdate(user._id, uploadId, {
    //     stage: "processing",
    //     progress: 45,
    //     message: "Processing file..."
    //   });
    // }

    // Skip optimization, proceed directly to upload
    console.log(
      "Uploading original file (optimization disabled):",
      file.originalname
    );
    sendProgressUpdate(user._id, uploadId, {
      stage: "processing",
      progress: 45,
      message: "Processing file (optimization disabled)...",
    });

    // Step 4: Upload to S3 (50% - 70%)
    sendProgressUpdate(user._id, uploadId, {
      stage: "uploading_to_s3",
      progress: 50,
      message: "Uploading to cloud storage...",
    });

    uploadResult = await uploadFile(finalFile, folderId);

    sendProgressUpdate(user._id, uploadId, {
      stage: "uploading_to_s3",
      progress: 70,
      message: "Cloud upload completed",
    });

    // Convert S3 URL to CloudFront URL for better performance
    const s3Key = `${folderId}/${finalFile.filename}`;
    const cloudFrontUrl = getCloudFrontUrl(s3Key);

    // Initialize thumbnail URL
    let thumbnailUrl = null;

    // Step 5: Generate thumbnail for video files (70% - 85%)
    if (ThumbnailService.isVideoFile(file.mimetype)) {
      sendProgressUpdate(user._id, uploadId, {
        stage: "generating_thumbnail",
        progress: 75,
        message: "Generating video thumbnail...",
      });

      try {
        console.log("Generating thumbnail for video file:", file.originalname);
        const thumbnailS3Url = await ThumbnailService.generateVideoThumbnail(
          file,
          folderId
        );

        // Convert thumbnail S3 URL to CloudFront URL if possible
        if (thumbnailS3Url) {
          const thumbnailFilename = ThumbnailService.getThumbnailFilename(
            file.filename
          );
          const thumbnailS3Key = `${folderId}/${thumbnailFilename}`;
          thumbnailUrl = getCloudFrontUrl(thumbnailS3Key);
        }

        sendProgressUpdate(user._id, uploadId, {
          stage: "generating_thumbnail",
          progress: 85,
          message: "Thumbnail generated successfully",
        });

        console.log("Thumbnail generated successfully:", thumbnailUrl);
      } catch (thumbnailError) {
        console.error("Error generating thumbnail:", thumbnailError);
        sendProgressUpdate(user._id, uploadId, {
          stage: "generating_thumbnail",
          progress: 85,
          message: "Thumbnail generation failed, continuing...",
        });
      }
    } else {
      sendProgressUpdate(user._id, uploadId, {
        stage: "processing",
        progress: 85,
        message: "Processing completed",
      });
    }

    // Step 6: Save to database (85% - 95%)
    sendProgressUpdate(user._id, uploadId, {
      stage: "saving_to_database",
      progress: 90,
      message: "Saving file information...",
    });

    // Clean up temporary files
    await unLinkFile(file.filename);
    if (finalFile.path !== file.path) {
      await unLinkFile(finalFile.filename);
    }

    const mediaFile = await MediaFiles.create({
      user: folder.user, // Use folder owner as file owner
      folderId: folderId,
      filename: finalFile.filename,
      originalName: file.originalname,
      filelink: cloudFrontUrl, // Use CloudFront URL instead of S3 URL
      mediaType: folder.mediaType,
      size: finalFile.size,
      thumbnailUrl: thumbnailUrl,
    });

    // Step 7: Complete (100%)
    sendProgressUpdate(user._id, uploadId, {
      stage: "completed",
      progress: 100,
      message: "Upload completed successfully!",
    });

    // Send completion signal
    sendUploadComplete(user._id, uploadId, {
      mediaFile,
      message: "File uploaded successfully",
    });

    res.status(201).json({ mediaFile, message: "File uploaded successfully" });

    // Fire-and-forget: start MediaConvert optimization for video files
    if (ThumbnailService.isVideoFile(file.mimetype)) {
      const s3KeyForMC = `${folderId}/${finalFile.filename}`;
      (async () => {
        try {
          const jobId = await mediaConvertService.createTranscodeJob(
            s3KeyForMC,
            folderId,
            mediaFile._id.toString()
          );
          mediaFile.processingStatus = "processing";
          mediaFile.mediaConvertJobId = jobId;
          mediaFile.originalSize = finalFile.size;
          await mediaFile.save();
          console.log(`[MediaConvert] Started job ${jobId} for ${file.originalname}`);
        } catch (err) {
          console.error("[MediaConvert] Failed to create job:", err.message);
          mediaFile.processingStatus = "failed";
          await mediaFile.save();
        }
      })();
    } else if (imageOptimizationService.isOptimizableImage(file.mimetype)) {
      const s3KeyForImg = `${folderId}/${finalFile.filename}`;
      imageOptimizationService
        .optimizeImageInPlace({
          s3Key: s3KeyForImg,
          fileId: mediaFile._id.toString(),
          mimetype: file.mimetype,
        })
        .catch((err) =>
          console.error("[ImageOpt] Unhandled error:", err.message)
        );
    }
  } catch (error) {
    console.error("Upload error:", error);
    sendUploadError(user._id, uploadId, error);
    res.status(500).json({ message: error.message || "Upload failed" });
  }
});

// @desc    Get files in folder
// @route   GET /api/media/folders/:folderId/files
// @access  private
const getMediaFolderFiles = asyncHandler(async (req, res, next) => {
  const folderId = req.params.folderId;
  const isAdmin = hasRole(req.user, "admin");

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
  const isAdmin = hasRole(req.user, "admin");
  const file = await MediaFiles.findOne({ _id: fileId, folderId });

  if (!file) {
    return res.status(404).json({ message: "File not found" });
  }

  // Allow admin to delete any file, regular users only their own
  if (!isAdmin && file.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: "Access denied" });
  }

  // Delete the main file from S3
  await deleteFile(folderId, file.filename);

  // Delete thumbnail if it exists
  if (file.thumbnailUrl && file.mediaType === "video") {
    try {
      const thumbnailFilename = ThumbnailService.getThumbnailFilename(
        file.filename
      );
      await deleteThumbnailFile(folderId, thumbnailFilename);
      console.log("Thumbnail deleted successfully");
    } catch (thumbnailError) {
      console.error("Error deleting thumbnail:", thumbnailError);
      // Continue with file deletion even if thumbnail deletion fails
    }
  }

  await file.remove();
  res.status(200).json({ message: "File deleted successfully" });
});

// @desc    Update file (rename)
// @route   PUT /api/media/folders/:folderId/files/:fileId
// @access  private
const updateMediaFile = asyncHandler(async (req, res, next) => {
  const { folderId, fileId } = req.params;
  const { originalName } = req.body;
  const isAdmin = hasRole(req.user, "admin");

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
  const isAdmin = hasRole(req.user, "admin");

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

// @desc    Debug CloudFront performance
// @route   POST /api/media/debug/cloudfront
// @access  private
const debugCloudFrontPerformance = asyncHandler(async (req, res, next) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ message: "URL required for testing" });
  }

  console.log(`Testing CloudFront performance for: ${url}`);
  const startTime = Date.now();

  try {
    // Test with fetch (Node.js 18+ or install node-fetch)
    // const fetch = require("node-fetch"); // You might need to install: npm install node-fetch

    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        Range: "bytes=0-1023", // Test range request support
        "User-Agent": "CloudFront-Debug-Tool/1.0",
      },
    });

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    // Get all response headers
    const headers = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    res.json({
      url: url,
      responseTime: responseTime + "ms",
      status: response.status,
      statusText: response.statusText,
      importantHeaders: {
        "x-amz-cf-pop": headers["x-amz-cf-pop"] || "Not found",
        "x-cache": headers["x-cache"] || "Not found",
        "x-amz-cf-id": headers["x-amz-cf-id"] || "Not found",
        age: headers["age"] || "Not found",
        "cache-control": headers["cache-control"] || "Not found",
        "accept-ranges": headers["accept-ranges"] || "Not found",
        "content-type": headers["content-type"] || "Not found",
        "content-length": headers["content-length"] || "Not found",
        "last-modified": headers["last-modified"] || "Not found",
        etag: headers["etag"] || "Not found",
      },
      allHeaders: headers,
      edgeLocation: headers["x-amz-cf-pop"] || "Unknown",
      cacheStatus: headers["x-cache"] || "Unknown",
      performance: {
        responseTime,
        isGoodPerformance: responseTime < 500,
        recommendation:
          responseTime > 1000
            ? "Very slow - check configuration"
            : responseTime > 500
            ? "Slow - could be improved"
            : "Good performance",
      },
    });
  } catch (error) {
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    res.status(500).json({
      error: error.message,
      responseTime: responseTime + "ms",
      url: url,
      recommendation: "Request failed - check URL or network connectivity",
    });
  }
});

const compareS3vsCloudFront = asyncHandler(async (req, res, next) => {
  const { fileId } = req.body;

  if (!fileId) {
    return res.status(400).json({ message: "File ID required for comparison" });
  }

  const file = await MediaFiles.findById(fileId);
  if (!file) {
    return res.status(404).json({ message: "File not found" });
  }

  // Generate S3 direct URL (you'll need to modify this based on your S3 setup)
  const s3DirectUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_BUCKET_REGION}.amazonaws.com/${file.folderId}/${file.filename}`;
  const cloudFrontUrl = file.filelink;

  const fetch = require("node-fetch");

  try {
    // Test S3 direct
    const s3StartTime = Date.now();
    const s3Response = await fetch(s3DirectUrl, { method: "HEAD" });
    const s3EndTime = Date.now();
    const s3ResponseTime = s3EndTime - s3StartTime;

    // Test CloudFront
    const cfStartTime = Date.now();
    const cfResponse = await fetch(cloudFrontUrl, { method: "HEAD" });
    const cfEndTime = Date.now();
    const cfResponseTime = cfEndTime - cfStartTime;

    // Get CloudFront headers
    const cfHeaders = {};
    cfResponse.headers.forEach((value, key) => {
      cfHeaders[key] = value;
    });

    res.json({
      fileInfo: {
        id: file._id,
        filename: file.filename,
        originalName: file.originalName,
        size: file.size,
        mediaType: file.mediaType,
      },
      s3Direct: {
        url: s3DirectUrl,
        responseTime: s3ResponseTime + "ms",
        status: s3Response.status,
      },
      cloudFront: {
        url: cloudFrontUrl,
        responseTime: cfResponseTime + "ms",
        status: cfResponse.status,
        edgeLocation: cfHeaders["x-amz-cf-pop"] || "Unknown",
        cacheStatus: cfHeaders["x-cache"] || "Unknown",
        cacheAge: cfHeaders["age"] || "Unknown",
      },
      comparison: {
        s3Faster: s3ResponseTime < cfResponseTime,
        difference: Math.abs(s3ResponseTime - cfResponseTime) + "ms",
        recommendation:
          s3ResponseTime < cfResponseTime
            ? "S3 is faster - CloudFront needs optimization"
            : "CloudFront is faster - working as expected",
      },
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      message: "Failed to compare performance",
    });
  }
});

// @desc    Search media files and folders by filename and user (admin only)
// @route   GET /api/media/search
// @access  private/admin
const searchMediaFiles = asyncHandler(async (req, res, next) => {
  const isAdmin = hasRole(req.user, "admin");

  // Check if user is admin
  if (!isAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }

  const { filename, userId, mediaType, page = 1, limit = 20 } = req.query;

  // Build search query for files
  const fileSearchQuery = {};

  // Search by filename (case-insensitive, partial match)
  if (filename) {
    fileSearchQuery.$or = [
      { originalName: { $regex: filename, $options: "i" } },
      { filename: { $regex: filename, $options: "i" } },
    ];
  }

  // Filter by user ID
  if (userId) {
    // Validate if userId is a valid ObjectId
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }
    fileSearchQuery.user = userId;
  }

  // Filter by media type
  if (mediaType && mediaType !== "all") {
    fileSearchQuery.mediaType = mediaType;
  }

  // Build search query for folders
  const folderSearchQuery = {};

  // Filter folders by user ID
  if (userId) {
    folderSearchQuery.user = userId;
  }

  // Search folder names
  if (filename) {
    folderSearchQuery.name = { $regex: filename, $options: "i" };
  }

  // Filter folders by media type
  if (mediaType && mediaType !== "all") {
    folderSearchQuery.mediaType = mediaType;
  }

  try {
    // Calculate pagination (applies only to files, folders return all matches)
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute searches in parallel
    const [files, folders] = await Promise.all([
      MediaFiles.find(fileSearchQuery)
        .populate("user", "name email")
        .populate("folderId", "name mediaType")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      MediaFolder.find(folderSearchQuery)
        .populate("user", "name email")
        .sort({ depth: 1, name: 1 }),
    ]);

    // Get total count for pagination
    const totalFiles = await MediaFiles.countDocuments(fileSearchQuery);
    const totalPages = Math.ceil(totalFiles / parseInt(limit));

    // Helper function to build folder path
    const getFolderPath = async (folderId) => {
      if (!folderId) return "";

      const pathParts = [];
      let currentFolderId = folderId;

      while (currentFolderId) {
        const folder = await MediaFolder.findById(currentFolderId);
        if (!folder) break;

        pathParts.unshift(folder.name);
        currentFolderId = folder.parentId;
      }

      return pathParts.join(" > ");
    };

    // Build folder paths for files
    const filesWithPaths = await Promise.all(
      files.map(async (file) => {
        const folderPath = await getFolderPath(file.folderId._id);
        return {
          _id: file._id,
          filename: file.filename,
          originalName: file.originalName,
          filelink: file.filelink,
          mediaType: file.mediaType,
          size: file.size,
          thumbnailUrl: file.thumbnailUrl,
          createdAt: file.createdAt,
          folderId: file.folderId._id,
          folderName: file.folderId.name,
          folderPath: folderPath,
          user: {
            _id: file.user._id,
            name: file.user.name,
            email: file.user.email,
          },
          folder: {
            _id: file.folderId._id,
            name: file.folderId.name,
            mediaType: file.folderId.mediaType,
          },
        };
      })
    );

    // Build folder paths for folders
    const foldersWithPaths = await Promise.all(
      folders.map(async (folder) => {
        const folderPath = await getFolderPath(folder.parentId);
        return {
          _id: folder._id,
          name: folder.name,
          mediaType: folder.mediaType,
          depth: folder.depth,
          parentId: folder.parentId,
          createdAt: folder.createdAt,
          folderPath: folderPath,
          isDir: true,
          user: {
            _id: folder.user._id,
            name: folder.user.name,
            email: folder.user.email,
          },
        };
      })
    );

    res.status(200).json({
      files: filesWithPaths,
      folders: foldersWithPaths,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalFiles,
        filesPerPage: parseInt(limit),
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
      searchCriteria: {
        filename: filename || null,
        userId: userId || null,
        mediaType: mediaType || null,
      },
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({
      message: "Search failed",
      error: error.message,
    });
  }
});

// @desc    Search user's own media files and folders
// @route   GET /api/media/search/my-files
// @access  private
const searchMyMediaFiles = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { filename, mediaType } = req.query;

  try {
    // Build search query for files
    const fileSearchQuery = { user: userId };

    // Search by filename (case-insensitive, partial match)
    if (filename) {
      fileSearchQuery.$or = [
        { originalName: { $regex: filename, $options: "i" } },
        { filename: { $regex: filename, $options: "i" } },
      ];
    }

    // Filter by media type
    if (mediaType && mediaType !== "all") {
      fileSearchQuery.mediaType = mediaType;
    }

    // Build search query for folders
    const folderSearchQuery = { user: userId };

    // Search folder names
    if (filename) {
      folderSearchQuery.name = { $regex: filename, $options: "i" };
    }

    // Filter folders by media type
    if (mediaType && mediaType !== "all") {
      folderSearchQuery.mediaType = mediaType;
    }

    // Execute searches in parallel
    const [files, folders] = await Promise.all([
      MediaFiles.find(fileSearchQuery)
        .populate("folderId", "name mediaType")
        .sort({ createdAt: -1 }),
      MediaFolder.find(folderSearchQuery).sort({ depth: 1, name: 1 }),
    ]);

    // Helper function to build folder path
    const getFolderPath = async (folderId) => {
      if (!folderId) return "";

      const pathParts = [];
      let currentFolderId = folderId;

      while (currentFolderId) {
        const folder = await MediaFolder.findById(currentFolderId);
        if (!folder) break;

        pathParts.unshift(folder.name);
        currentFolderId = folder.parentId;
      }

      return pathParts.join(" > ");
    };

    // Build folder paths for files
    const filesWithPaths = await Promise.all(
      files.map(async (file) => {
        const folderPath = await getFolderPath(file.folderId._id);
        return {
          _id: file._id,
          filename: file.filename,
          originalName: file.originalName,
          filelink: file.filelink,
          mediaType: file.mediaType,
          size: file.size,
          thumbnailUrl: file.thumbnailUrl,
          createdAt: file.createdAt,
          folderId: file.folderId._id,
          folderName: file.folderId.name,
          folderPath: folderPath,
          isDir: false,
        };
      })
    );

    // Build folder paths for folders
    const foldersWithPaths = await Promise.all(
      folders.map(async (folder) => {
        const folderPath = await getFolderPath(folder.parentId);
        return {
          _id: folder._id,
          name: folder.name,
          mediaType: folder.mediaType,
          depth: folder.depth,
          parentId: folder.parentId,
          createdAt: folder.createdAt,
          folderPath: folderPath,
          isDir: true,
        };
      })
    );

    res.status(200).json({
      folders: foldersWithPaths,
      files: filesWithPaths,
      totalFolders: foldersWithPaths.length,
      totalFiles: filesWithPaths.length,
      searchCriteria: {
        filename: filename || null,
        mediaType: mediaType || null,
      },
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({
      message: "Search failed",
      error: error.message,
    });
  }
});

// Maximum file size for direct-to-S3 uploads: 2GB
const MAX_DIRECT_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024;

// @desc    Get a pre-signed PUT URL for direct-to-S3 upload
// @route   POST /api/media/presign
// @access  private
const presignUpload = asyncHandler(async (req, res) => {
  const { folderId, filename, fileSize, mimeType } = req.body;
  const user = req.user;
  const isAdmin = hasRole(user, "admin");

  if (!folderId || !filename || !fileSize || !mimeType) {
    return res
      .status(400)
      .json({ message: "folderId, filename, fileSize, and mimeType are required" });
  }

  // Validate file size
  if (fileSize > MAX_DIRECT_UPLOAD_SIZE) {
    return res.status(400).json({
      message: `File size exceeds the maximum limit of ${Math.round(
        MAX_DIRECT_UPLOAD_SIZE / (1024 * 1024 * 1024)
      )}GB`,
    });
  }

  // Validate folder exists
  const folder = await MediaFolder.findById(folderId);
  if (!folder) {
    return res.status(404).json({ message: "Folder not found" });
  }

  // Check access
  if (!isAdmin && folder.user.toString() !== user._id.toString()) {
    return res.status(403).json({ message: "Access denied to folder" });
  }

  // Validate file type matches folder type
  const allowedMimeTypes = {
    picture: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"],
    video: ["video/mp4", "video/webm", "video/ogg", "video/quicktime"],
    audio: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/webm"],
    document: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
    ],
  };

  if (
    folder.mediaType !== "other" &&
    allowedMimeTypes[folder.mediaType] &&
    !allowedMimeTypes[folder.mediaType].includes(mimeType)
  ) {
    return res.status(400).json({
      message: `File type "${mimeType}" is not allowed in ${folder.mediaType} folders`,
    });
  }

  // Check for duplicate filename
  const existingFile = await MediaFiles.findOne({
    folderId,
    originalName: filename,
  });
  if (existingFile) {
    return res
      .status(400)
      .json({ message: "A file with this name already exists in this folder" });
  }

  // Generate S3 key
  const uniqueFilename = `${uuidv4()}_${filename}`;
  const s3Key = `${folderId}/${uniqueFilename}`;

  // Generate pre-signed URL (15 min expiry)
  const presignedUrl = await getPresignedPutUrl(s3Key, mimeType, 900);

  res.status(200).json({
    presignedUrl,
    s3Key,
    filename: uniqueFilename,
    originalName: filename,
    contentType: mimeType,
    expiresIn: 900,
  });
});

// @desc    Confirm a direct-to-S3 upload completed, create DB record + trigger processing
// @route   POST /api/media/confirm-upload
// @access  private
const confirmUpload = asyncHandler(async (req, res) => {
  const { folderId, s3Key, filename, originalName, mimeType, fileSize } = req.body;
  const user = req.user;
  const isAdmin = hasRole(user, "admin");

  if (!folderId || !s3Key || !filename || !originalName || !mimeType || !fileSize) {
    return res.status(400).json({
      message: "folderId, s3Key, filename, originalName, mimeType, and fileSize are required",
    });
  }

  // Validate folder
  const folder = await MediaFolder.findById(folderId);
  if (!folder) {
    return res.status(404).json({ message: "Folder not found" });
  }

  if (!isAdmin && folder.user.toString() !== user._id.toString()) {
    return res.status(403).json({ message: "Access denied to folder" });
  }

  // Verify file exists in S3
  try {
    await headObject(s3Key);
  } catch (err) {
    return res.status(400).json({
      message: "File not found in S3. Upload may have failed or the pre-signed URL expired.",
    });
  }

  // Create CloudFront URL
  const cloudFrontUrl = getCloudFrontUrl(s3Key);

  // Create DB record
  const mediaFile = await MediaFiles.create({
    user: folder.user,
    folderId,
    filename,
    originalName,
    filelink: cloudFrontUrl,
    mediaType: folder.mediaType,
    size: fileSize,
    thumbnailUrl: null,
  });

  res.status(201).json({ mediaFile, message: "Upload confirmed successfully" });

  // Fire-and-forget: trigger MediaConvert for videos
  const isVideo = mimeType.startsWith("video/");
  if (isVideo) {
    (async () => {
      try {
        const jobId = await mediaConvertService.createTranscodeJob(
          s3Key,
          folderId,
          mediaFile._id.toString()
        );
        mediaFile.processingStatus = "processing";
        mediaFile.mediaConvertJobId = jobId;
        mediaFile.originalSize = fileSize;
        await mediaFile.save();
        console.log(
          `[MediaConvert] Started job ${jobId} for ${originalName}`
        );
      } catch (err) {
        console.error("[MediaConvert] Failed to create job:", err.message);
        mediaFile.processingStatus = "failed";
        await mediaFile.save();
      }
    })();

    // Fire-and-forget: trigger thumbnail Lambda
    (async () => {
      try {
        const thumbnailLambdaService = require("../../services/thumbnailLambdaService");
        await thumbnailLambdaService.invokeThumbnailLambda({
          s3Key,
          folderId,
          fileId: mediaFile._id.toString(),
          filename,
        });
        console.log(`[ThumbnailLambda] Invoked for ${originalName}`);
      } catch (err) {
        console.error("[ThumbnailLambda] Failed to invoke:", err.message);
      }
    })();
  } else if (imageOptimizationService.isOptimizableImage(mimeType)) {
    // Fire-and-forget: sharp-based image optimization (in-place overwrite, same URL)
    mediaFile.originalSize = fileSize;
    await mediaFile.save();
    imageOptimizationService
      .optimizeImageInPlace({
        s3Key,
        fileId: mediaFile._id.toString(),
        mimetype: mimeType,
      })
      .catch((err) =>
        console.error("[ImageOpt] Unhandled error:", err.message)
      );
  }
});

// @desc    Callback from thumbnail Lambda — updates thumbnailUrl in DB
// @route   POST /api/media/thumbnail-callback
// @access  shared secret (no protect middleware)
const thumbnailCallback = asyncHandler(async (req, res) => {
  const { secret, fileId, thumbnailS3Key, success, error } = req.body;

  // Validate shared secret
  const expectedSecret = process.env.THUMBNAIL_CALLBACK_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(403).json({ message: "Invalid callback secret" });
  }

  if (!fileId) {
    return res.status(400).json({ message: "fileId is required" });
  }

  const mediaFile = await MediaFiles.findById(fileId);
  if (!mediaFile) {
    return res.status(404).json({ message: "Media file not found" });
  }

  if (success && thumbnailS3Key) {
    mediaFile.thumbnailUrl = getCloudFrontUrl(thumbnailS3Key);
    await mediaFile.save();
    console.log(`[ThumbnailCallback] Updated thumbnail for file ${fileId}`);
    return res.status(200).json({ message: "Thumbnail updated" });
  }

  console.error(`[ThumbnailCallback] Failed for file ${fileId}:`, error);
  res.status(200).json({ message: "Callback received (thumbnail failed)" });
});

// @desc    Retry optimization for a failed file (video → MediaConvert, image → sharp)
// @route   POST /api/media/retry-optimization/:fileId
// @access  Private
const retryOptimization = asyncHandler(async (req, res) => {
  const mediaFile = await MediaFiles.findById(req.params.fileId);

  if (!mediaFile) {
    return res.status(404).json({ message: "Media file not found" });
  }

  if (mediaFile.processingStatus !== "failed") {
    return res.status(400).json({ message: "Only failed files can be retried" });
  }

  const folderId = mediaFile.folderId.toString();
  const s3Key = `${folderId}/${mediaFile.filename}`;

  // Infer image mimetype from filename extension for the picture path
  const ext = (mediaFile.filename.split(".").pop() || "").toLowerCase();
  const imageMimeByExt = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  const inferredMime = imageMimeByExt[ext];

  if (mediaFile.mediaType === "picture" && inferredMime) {
    res.status(200).json({ message: "Image optimization retry started" });
    imageOptimizationService
      .optimizeImageInPlace({
        s3Key,
        fileId: mediaFile._id.toString(),
        mimetype: inferredMime,
      })
      .catch((err) =>
        console.error("[ImageOpt] Retry unhandled error:", err.message)
      );
    return;
  }

  try {
    const jobId = await mediaConvertService.createTranscodeJob(
      s3Key,
      folderId,
      mediaFile._id.toString()
    );
    mediaFile.processingStatus = "processing";
    mediaFile.mediaConvertJobId = jobId;
    await mediaFile.save();
    console.log(`[MediaConvert] Retry job ${jobId} for file ${mediaFile._id}`);
    return res.status(200).json({ message: "Optimization retry started", jobId });
  } catch (err) {
    console.error("[MediaConvert] Retry failed:", err.message);
    return res.status(500).json({ message: "Failed to start retry", error: err.message });
  }
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
  uploadMediaFileWithProgress, // New function with progress tracking
  getMediaFolderFiles,
  deleteMediaFile,
  updateMediaFile,
  moveMediaFile,
  compareS3vsCloudFront,
  debugCloudFrontPerformance,
  searchMediaFiles, // New search function for admin
  searchMyMediaFiles, // New search function for regular users
  presignUpload,
  confirmUpload,
  thumbnailCallback,
  retryOptimization,
};
