// Add these routes to your existing media routes file

const express = require("express");
const router = express.Router();
const { protect, admin } = require("../../middlewares/authMiddleware"); // Assuming you have admin middleware

const {
  testMediaRoute,
  createMediaFolder,
  getMediaFolder,
  deleteMediaFolder,
  updateMediaFolder,
  getAllMediaFolders,
  getAllMediaFoldersGroupedByUser, // New admin function
  getSpecificUserFolders, // New admin function
  getUserMediaFolders,
  uploadMediaFile,
  uploadMediaFileWithProgress,
  getMediaFolderFiles,
  deleteMediaFile,
  updateMediaFile,
  moveMediaFile,
  debugCloudFrontPerformance,
  compareS3vsCloudFront,
  searchMediaFiles, // New search function for admin
  searchMyMediaFiles, // New search function for regular users
} = require("../../controllers/MediaControllers/mediaController");

const {
  establishProgressConnection,
} = require("../../controllers/MediaControllers/progressController");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

// Maximum file size: 150MB
const MAX_FILE_SIZE = 400 * 1024 * 1024; // 400MB

// image upload folder
const uploadFile = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, "uploads");
    },
    filename: function (req, file, cb) {
      cb(null, uuidv4() + "_" + file.originalname);
    },
  }),
  limits: {
    fileSize: MAX_FILE_SIZE, // Limit file size to 100MB
  },
  fileFilter: function (req, file, cb) {
    // This will be called before the file is saved
    cb(null, true);
  },
});

// Test route
router.get("/", protect, testMediaRoute);

// --- PROGRESS ROUTES ---
// SSE endpoint for upload progress tracking (custom auth via query param)
router.get("/progress/:uploadId", establishProgressConnection);

// --- FOLDER ROUTES ---
router.post("/folder", protect, createMediaFolder);
router.get("/folder/:id", protect, getMediaFolder);
router.put("/folder/:id", protect, updateMediaFolder);
router.delete("/folder/:id", protect, deleteMediaFolder);

// --- ADMIN FOLDER ROUTES ---
// Get all folders grouped by users (admin only) - NEW ROUTE
router.get("/folders/admin", protect, admin, getAllMediaFoldersGroupedByUser);

// Get specific user's folders (admin only) - NEW ROUTE
router.get("/folders/user/:userId", protect, admin, getSpecificUserFolders);

// Get all folders (admin only) - original route for backward compatibility
router.get("/folders", protect, admin, getAllMediaFolders);

// Get current user's folders
router.get("/folders/user", protect, getUserMediaFolders);

// --- SEARCH ROUTES ---
// Search user's own media files and folders
router.get("/search/my-files", protect, searchMyMediaFiles);

// Search media files (admin only)
router.get("/search", protect, admin, searchMediaFiles);

// Multer error handling middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: `File size exceeds the maximum limit of ${Math.round(
          MAX_FILE_SIZE / (1024 * 1024)
        )}MB`,
        error: err.message,
        maxSize: MAX_FILE_SIZE,
      });
    }
    return res.status(400).json({
      message: "File upload error",
      error: err.message,
    });
  }
  next(err);
};

// --- FILE ROUTES ---
router
  .route("/folders/:folderId")
  .post(protect, uploadFile.single("file"), handleMulterError, uploadMediaFile);

// Upload with progress tracking
router
  .route("/folders/:folderId/with-progress")
  .post(
    protect,
    uploadFile.single("file"),
    handleMulterError,
    uploadMediaFileWithProgress
  );

router.get("/folders/:folderId/files", protect, getMediaFolderFiles);
router.delete("/folders/:folderId/files/:fileId", protect, deleteMediaFile);
router.put("/folders/:folderId/files/:fileId", protect, updateMediaFile);
router.put("/folders/:folderId/files/:fileId/move", protect, moveMediaFile);

router.post("/debug/cloudfront", debugCloudFrontPerformance);
router.post("/debug/compare", compareS3vsCloudFront);

module.exports = router;
