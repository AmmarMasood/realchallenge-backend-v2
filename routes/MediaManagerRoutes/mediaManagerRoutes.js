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
  getMediaFolderFiles,
  deleteMediaFile,
  updateMediaFile,
  moveMediaFile,
} = require("../../controllers/MediaControllers/mediaController");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

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
});

// Test route
router.get("/", protect, testMediaRoute);

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

// --- FILE ROUTES ---
router
  .route("/folders/:folderId")
  .post(protect, uploadFile.single("file"), uploadMediaFile);

router.get("/folders/:folderId/files", protect, getMediaFolderFiles);
router.delete("/folders/:folderId/files/:fileId", protect, deleteMediaFile);
router.put("/folders/:folderId/files/:fileId", protect, updateMediaFile);
router.put("/folders/:folderId/files/:fileId/move", protect, moveMediaFile);

module.exports = router;
