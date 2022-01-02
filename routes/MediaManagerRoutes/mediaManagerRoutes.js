const express = require("express");
const router = express.Router();
const multer = require("multer");

// image upload folder
const uploadImg = multer({ dest: "uploads/images" });
const uploadVid = multer({ dest: "uploads/videos" });
const uploadDoc = multer({ dest: "uploads/docs" });
const uploadVo = multer({ dest: "uploads/voiceOvers" });
const uploadMu = multer({ dest: "uploads/musics" });
const uploadIc = multer({ dest: "uploads/icons" });
const uploadTe = multer({ dest: "uploads/temps" });
const uploadFo = multer({ dest: "uploads/foods" });
const uploadRc = multer({ dest: "uploads/rc" });

const {
  testMediaRoute,
  uploadImage,
  getImage,
  uploadVideo,
  uploadDocument,
  getVideo,
  getAllVideos,
  getAllImages,
  getAllDocs,
  deleteMediaFiles,
  getDoc,
  uploadVoiceOver,
  getAllVoiceOvers,
  getVoiceOver,
  getMusic,
  getAllMusics,
  uploadMusic,
  getAllIcons,
  getAllFoods,
  getAllTemps,
  uploadTempfiles,
  uploadFoodfiles,
  uploadIconfiles,
  uploadRcFile,
  getTemp,
  getFood,
  getIcon,
  getRcFile,
  getAllRcFiles,
} = require("../../controllers/MediaControllers/mediaController");

const {
  protect,
  admin,
  trainer,
  blogger,
  nutrist,
  shopManager,
} = require("../../middlewares/authMiddleware");

router.route("/").get(protect, testMediaRoute);

router.route("/get/videos/all").get(protect, getAllVideos);
router.route("/get/images/all").get(protect, getAllImages);
router.route("/get/docs/all").get(protect, getAllDocs);
router.route("/get/voiceOvers/all").get(protect, getAllVoiceOvers);
router.route("/get/musics/all").get(protect, getAllMusics);

router.route("/get/icons/all").get(protect, getAllIcons);
router.route("/get/foods/all").get(protect, getAllFoods);
router.route("/get/temps/all").get(protect, getAllTemps);
router.route("/get/rc/all/:foldername").get(protect, getAllRcFiles);
// route to upload image to s3
router
  .route("/uploadImage")
  .post(protect, uploadImg.single("image"), uploadImage);
// route to upload video to s3
router
  .route("/uploadVideo")
  .post(protect, uploadVid.single("video"), uploadVideo);
// route to upload docs to s3
router
  .route("/uploadDoc")
  .post(protect, uploadDoc.single("doc"), uploadDocument);

// route to upload voiceOvers to s3
router
  .route("/uploadVoiceOver")
  .post(protect, uploadVo.single("voiceOver"), uploadVoiceOver);

// route to upload music to s3
router
  .route("/uploadMusic")
  .post(protect, uploadMu.single("music"), uploadMusic);

// route to upload music to s3
router.route("/temps").post(protect, uploadTe.single("file"), uploadTempfiles);

router.route("/foods").post(protect, uploadFo.single("file"), uploadFoodfiles);

router.route("/icons").post(protect, uploadIc.single("file"), uploadIconfiles);

// upload data to rc folders
router
  .route("/rc/:foldername")
  .post(protect, uploadRc.single("file"), uploadRcFile);

// route to get image from s3
router.route("/getImage/:key").get(getImage);
// route to get videos from s3
router.route("/getVideo/:key").get(getVideo);
// route to get docu from s3
router.route("/getDoc/:key").get(getDoc);
// route to get voiceOver from s3
router.route("/getVoiceOver/:key").get(getVoiceOver);
// route to get music from s3
router.route("/getMusic/:key").get(getMusic);

router.route("/getTemp/:key").get(getTemp);
router.route("/getFood/:key").get(getFood);
router.route("/getIcon/:key").get(getIcon);
router.route("/getRc/:key").get(getRcFile);

// route to delete files from s3
router.route("/files").delete(protect, admin, deleteMediaFiles);

module.exports = router;
