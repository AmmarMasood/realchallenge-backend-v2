const express = require("express");
const router = express.Router();
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

const {
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
  // destroy,
} = require("../../controllers/MediaControllers/mediaController");

const { protect, admin } = require("../../middlewares/authMiddleware");

router.route("/").get(protect, testMediaRoute);

// folder robustness
router.route("/folder").post(protect, createMediaFolder);
router.route("/folder/:id").get(protect, getMediaFolder);
router.route("/folder/:id").delete(protect, deleteMediaFolder);
router.route("/folder/:id").put(protect, updateMediaFolder);
router.route("/folders").get(protect, admin, getAllMediaFolders);
router.route("/folders/user").get(protect, getUserMediaFolders);
router
  .route("/folders/:folderId")
  .post(protect, uploadFile.single("file"), uploadMediaFile);
router.route("/folders/:folderId/files").get(protect, getMediaFolderFiles);
router
  .route("/folders/:folderId/files/:fileId")
  .delete(protect, deleteMediaFile);

// router.route("/destroyCollection").get(destroy);

module.exports = router;
