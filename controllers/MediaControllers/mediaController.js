const asyncHandler = require("express-async-handler");
const {
  uploadFile,
  getFile,
  deleteFile,
  uploadVideoFile,
} = require("../../config/s3");
const fs = require("fs");
const util = require("util");
const unLinkFile = util.promisify(fs.unlink);
const MediaFiles = require("../../models/MediaManagerModels/mediaFileModel");
const { Mongoose } = require("mongoose");

// @desc    test route
// @route   get /api/media/test
// @access  private
const testMediaRoute = asyncHandler(async (req, res, next) => {
  console.log(req.user);
  res.status(200).json({ message: "test success" });
});

// @desc    get image
// @route   get /api/media/getImage
// @access  Private
const getImage = asyncHandler(async (req, res, next) => {
  try {
    const key = req.params.key;
    console.log("ammar", key);
    const readStream = getFile(key, "images");
    readStream.pipe(res);
    return res.status(200).json({ message: "successs" });
  } catch (err) {
    console.log("yes", err);
    next(err);
  }
});

const getRcFile = asyncHandler(async (req, res, next) => {
  try {
    const key = req.params.key;
    // const readStream = getFile(key);
    // readStream.pipe(res);
  } catch (err) {
    console.log(err);
    next(err);
  }
});
// @desc    get temp
// @route   get /api/media/getTemp
// @access  Private
const getTemp = asyncHandler(async (req, res, next) => {
  try {
    const key = req.params.key;
    // const readStream = getFile(key);
    // readStream.pipe(res);
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @desc    get food
// @route   get /api/media/getFood
// @access  Private
const getFood = asyncHandler(async (req, res, next) => {
  try {
    const key = req.params.key;
    // const readStream = getFile(key);
    // readStream.pipe(res);
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @desc    get icon
// @route   get /api/media/getIcon
// @access  Private
const getIcon = asyncHandler(async (req, res, next) => {
  try {
    const key = req.params.key;
    // const readStream = getFile(key);
    // readStream.pipe(res);
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @desc    upload image
// @route   post /api/media/uploadImage
// @access  Private
const uploadImage = asyncHandler(async (req, res, next) => {
  try {
    const file = req.file;
    const user = req.user;
    const f = await MediaFiles.create({
      user: user._id,
      filename: file.originalname,
      filelink: file.filename,
      foldername: "images",
    });
    res.status(200).json({ file: f, message: "sucess" });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @desc    upload rc files
// @route   post /api/media/uploadRcFile
// @access  Private
const uploadRcFile = asyncHandler(async (req, res, next) => {
  try {
    const file = req.file;
    const user = req.user;
    const foldername = req.params.foldername;

    if (file.mimetype && file.mimetype.includes("video")) {
      // const fileType = file.originalname.split(".").pop();
      // const results = await uploadVideoFile(file, fileType);
      // await unLinkFile(file.filename);
      const f = await MediaFiles.create({
        user: user._id,
        filename: file.originalname,
        filelink: file.filename,
        foldername: foldername,
      });
      res.status(200).json({ file: f, message: "sucess" });
      return;
    }
    // const results = await uploadFile(file);
    // await unLinkFile(file.filename);
    const f = await MediaFiles.create({
      user: user._id,
      filename: file.originalname,
      filelink: file.filename,
      foldername: foldername,
    });
    res.status(200).json({ file: f, message: "sucess" });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @desc    upload music
// @route   post /api/media/uploadMusic
// @access  Private
const uploadMusic = asyncHandler(async (req, res, next) => {
  try {
    const file = req.file;
    const user = req.user;
    console.log(file);
    // console.log(user);
    // const results = await uploadFile(file);
    // await unLinkFile(file.filename);
    const f = await MediaFiles.create({
      user: user._id,
      filename: file.originalname,
      filelink: file.filename,
      foldername: "musics",
    });
    res.status(200).json({ file: f, message: "sucess" });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

const uploadDocument = asyncHandler(async (req, res, next) => {
  try {
    const file = req.file;
    const user = req.user;
    const f = await MediaFiles.create({
      user: user._id,
      filename: file.originalname,
      filelink: file.filename,
      foldername: "docs",
    });
    res.status(200).json({ file: f, message: "sucess" });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @desc    get document
// @route   get /api/media/getDoc
// @access  Private
const getDoc = asyncHandler(async (req, res, next) => {
  try {
    const key = req.params.key;
    // const readStream = getFile(key);
    //
    readStream.pipe(res);
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @desc    get music
// @route   get /api/media/getMusic
// @access  Private
const getMusic = asyncHandler(async (req, res, next) => {
  try {
    const key = req.params.key;
    // const readStream = getFile(key);
    //
    readStream.pipe(res);
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @desc    get video
// @route   get /api/media/getVideo
// @access  Private
const getVideo = asyncHandler(async (req, res, next) => {
  try {
    const key = req.params.key;
    // const readStream = getFile(key);
    //
    readStream.pipe(res);
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @desc    get voice over
// @route   get /api/media/voiceOver
// @access  Private
const getVoiceOver = asyncHandler(async (req, res, next) => {
  try {
    const key = req.params.key;
    // const readStream = getFile(key);
    //
    readStream.pipe(res);
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @desc    upload video
// @route   post /api/media/uploadVideo
// @access  Private
const uploadVideo = asyncHandler(async (req, res, next) => {
  try {
    const file = req.file;
    const fileType = file.originalname.split(".").pop();
    const user = req.user;
    // const results = await uploadVideoFile(file, fileType);
    // await unLinkFile(file.filename);
    // console.log(results);
    const f = await MediaFiles.create({
      user: user._id,
      filename: file.originalname,
      filelink: file.filename,
      foldername: "videos",
    });
    // console.log(file);
    // console.log(fileType);
    // console.log("results", results);
    res.status(200).json({ file: f, message: "sucess" });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @desc    upload voice over
// @route   post /api/media/uploadVoiceOver
// @access  Private
const uploadVoiceOver = asyncHandler(async (req, res, next) => {
  try {
    const file = req.file;
    const user = req.user;
    // const results = await uploadFile(file);

    // await unLinkFile(file.filename);
    // console.log(results);
    const f = await MediaFiles.create({
      user: user._id,
      filename: file.originalname,
      filelink: file.filename,
      foldername: "voiceOvers",
    });
    // console.log(f);
    res.status(200).json({ file: f, message: "sucess" });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @desc    upload foods
// @route   post /api/media/foods
// @access  Private
const uploadFoodfiles = asyncHandler(async (req, res, next) => {
  try {
    const file = req.file;
    const user = req.user;
    // const results = await uploadFile(file);

    // await unLinkFile(file.filename);
    // console.log(results);
    const f = await MediaFiles.create({
      user: user._id,
      filename: file.originalname,
      filelink: file.filename,
      foldername: "foods",
    });
    console.log(f);
    res.status(200).json({ file: f, message: "sucess" });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @desc    upload icons
// @route   post /api/media/icons
// @access  Private
const uploadIconfiles = asyncHandler(async (req, res, next) => {
  try {
    const file = req.file;
    const user = req.user;
    // const results = await uploadFile(file);

    // await unLinkFile(file.filename);
    // console.log(results);
    const f = await MediaFiles.create({
      user: user._id,
      filename: file.originalname,
      filelink: file.filename,
      foldername: "icons",
    });
    // console.log(f);
    res.status(200).json({ file: f, message: "sucess" });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @desc    upload temps
// @route   post /api/media/temps
// @access  Private
const uploadTempfiles = asyncHandler(async (req, res, next) => {
  try {
    const file = req.file;
    const user = req.user;
    // const results = await uploadFile(file);

    // await unLinkFile(file.filename);
    // console.log(results);
    const f = await MediaFiles.create({
      user: user._id,
      filename: file.originalname,
      filelink: file.filename,
      foldername: "temps",
    });
    console.log(f);
    res.status(200).json({ file: f, message: "sucess" });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @desc   get all vides
// @route   get /api/media/get/videos/all
// @access  private
const getAllVideos = asyncHandler(async (req, res, next) => {
  try {
    let files;
    if (req.user.role === "admin") {
      files = await MediaFiles.find({ foldername: "videos" });
    } else {
      files = await MediaFiles.find({
        foldername: "videos",
        user: req.user.id,
      });
    }

    res.status(200).json({ videos: files });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @desc   get all musics
// @route   get /api/media/get/musics/all
// @access  private
const getAllMusics = asyncHandler(async (req, res, next) => {
  try {
    let files;
    if (req.user.role === "admin") {
      files = await MediaFiles.find({ foldername: "musics" });
    } else {
      files = await MediaFiles.find({
        foldername: "musics",
        user: req.user.id,
      });
    }
    res.status(200).json({ musics: files });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @desc   get all images
// @route   get /api/media/get/images/all
// @access  private
const getAllImages = asyncHandler(async (req, res, next) => {
  try {
    let files;
    if (req.user.role === "admin") {
      files = await MediaFiles.find({ foldername: "images" });
    } else {
      files = await MediaFiles.find({
        foldername: "images",
        user: req.user.id,
      });
    }
    res.status(200).json({ images: files });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

const getAllRcFiles = asyncHandler(async (req, res, next) => {
  try {
    const foldername = req.params.foldername;
    let files;
    if (req.user.role === "admin") {
      files = await MediaFiles.find({ foldername: foldername });
    } else {
      files = await MediaFiles.find({
        foldername: foldername,
        user: req.user.id,
      });
    }
    res.status(200).json({ files: files });
  } catch (err) {
    console.log(err);
    next(err);
  }
});
// @route   get api/media/get/docs/all
// @access  private
const getAllDocs = asyncHandler(async (req, res, next) => {
  try {
    let files;
    if (req.user.role === "admin") {
      files = await MediaFiles.find({ foldername: "docs" });
    } else {
      files = await MediaFiles.find({
        foldername: "docs",
        user: req.user.id,
      });
    }

    res.status(200).json({ docs: files });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @route   get api/media/get/voiceOvers/alll
// @access  private
const getAllVoiceOvers = asyncHandler(async (req, res, next) => {
  try {
    let files;
    if (req.user.role === "admin") {
      files = await MediaFiles.find({ foldername: "voiceOvers" });
    } else {
      files = await MediaFiles.find({
        foldername: "voiceOvers",
        user: req.user.id,
      });
    }

    res.status(200).json({ voiceOvers: files });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @route   get api/media/get/icons/alll
// @access  private
const getAllIcons = asyncHandler(async (req, res, next) => {
  try {
    let files;
    if (req.user.role === "admin") {
      files = await MediaFiles.find({ foldername: "icons" });
    } else {
      files = await MediaFiles.find({
        foldername: "icons",
        user: req.user.id,
      });
    }
    res.status(200).json({ files: files });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @route   get api/media/get/temps/alll
// @access  private
const getAllTemps = asyncHandler(async (req, res, next) => {
  try {
    let files;
    if (req.user.role === "admin") {
      files = await MediaFiles.find({ foldername: "temps" });
    } else {
      files = await MediaFiles.find({
        foldername: "temps",
        user: req.user.id,
      });
    }

    res.status(200).json({ files: files });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @route   get api/media/get/foods/alll
// @access  private
const getAllFoods = asyncHandler(async (req, res, next) => {
  try {
    let files;
    if (req.user.role === "admin") {
      files = await MediaFiles.find({ foldername: "foods" });
    } else {
      files = await MediaFiles.find({
        foldername: "foods",
        user: req.user.id,
      });
    }

    res.status(200).json({ files: files });
  } catch (err) {
    console.log(err);
    next(err);
  }
});
// @desc   delete files from s3 and databases
// @route   dete /files
// @access  private
const deleteMediaFiles = asyncHandler(async (req, res, next) => {
  try {
    const files = req.body;

    files &&
      files.map(async (f) => {
        const a = await MediaFiles.deleteOne({ _id: f.id });
        var parts = f.link.split("/");
        var id = parts[parts.length - 1];
        // const res = await deleteFile(id);
        unLinkFile(`./uploads/${f.link}`);
      });
    console.log("yesss", files);

    res.status(200).send({ status: "success", deleted: req.body });
    //   res.status(200).json({ images: files });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

const destroy = asyncHandler(async (req, res, next) => {
  try {
    const a = await MediaFiles.deleteMany({});
    console.log("deletesd");
    res
      .status(200)
      .send({ status: "Successfully removed all documents from media files" });
  } catch (err) {
    console.log(err);
    next(err);
  }
});
module.exports = {
  testMediaRoute,
  uploadImage,
  uploadVideo,
  getImage,
  getVideo,
  getTemp,
  getIcon,
  getFood,
  getAllVideos,
  getAllImages,
  deleteMediaFiles,
  getAllDocs,
  uploadDocument,
  getDoc,
  getAllVoiceOvers,
  uploadVoiceOver,
  getVoiceOver,
  getMusic,
  getAllMusics,
  uploadMusic,
  uploadTempfiles,
  uploadFoodfiles,
  uploadIconfiles,
  uploadRcFile,
  getAllFoods,
  getAllTemps,
  getAllIcons,
  getRcFile,
  getAllRcFiles,
  destroy,
};
