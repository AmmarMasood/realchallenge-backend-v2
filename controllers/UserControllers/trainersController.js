const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const generateToken = require("../../utils/generateToken");
const bcrypt = require("bcryptjs");
const { User } = require("../../models/UserModels/userModel");
const { Trainer } = require("../../models/UserModels/trainerModel");
const { Challenges } = require("../../models/ChallengeModels/challengesModel");

// @desc    Create trainer role by ID
// @route   POST /api/trainers/create
// @access  Private
const createTrainer = asyncHandler(async (req, res, next) => {
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }
    const { username, email } = req.body;
    const userExist = await User.findOne({ username });
    const emailExist = await User.findOne({ email });
    if (userExist || emailExist) {
      return res
        .status(400)
        .json("User Already exist with this username/email.");
    }
    let newUser = new User({
      username: req.body.username,
      email: req.body.email,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      passwordHash: bcrypt.hashSync(req.body.password, 10),
      role: req.body.role,
    });
    console.log(newUser);
    newUser = await newUser.save();

    if (!newUser) {
      return res.status(400).json("Trainer cannot be created!");
    } else {
      return res.status(201).json({
        mesage: "Trainer Created Successfully",
        _id: newUser._id,
        username: newUser.username,
        role: newUser.role,

        token: generateToken(
          newUser._id,
          newUser.role,
          newUser.email,
          newUser.username
        ),
      });
    }
  } catch (err) {
    return next(err);
  }
});

// @desc    Get All trainers
// @route   GET /api/trainers/all
// @access  Private
const getAllTrainers = asyncHandler(async (req, res) => {
  const trainers = await User.find({ role: "trainer" }).select("-passwordHash");
  console.log(trainers);
  if (trainers) {
    res.status(200).json({
      trainers,
    });
  } else {
    res.status(404);
    throw new Error("Trainers Cannot be fetched");
  }
});

// @desc    Get trainer by ID
// @route   GET /api/trainers/:trainerId
// @access  Private
const getTrainerById = asyncHandler(async (req, res) => {
  console.log("here");
  const user = await User.findById(req.params.trainerId)
    .populate("trainersFitnessInterest")
    .populate("trainerGoals");

  if (user) {
    if (user.role == "trainer") {
      const challenges = await Challenges.find({
        trainers: req.params.trainerId,
      }).select(
        "challengeName thumbnailLink videoThumbnailLink informationList rating fitnessInterests"
      );
      return res.status(201).json({
        message: "Trainer fetched successfully",
        trainer: user,
        challenges: challenges,
      });
    } else {
      return res.status(404).json({
        message: "The user requested is not a trainer.",
      });
    }
  } else {
    res.status(404);
    throw new Error("Trainer not found");
  }
});

// @desc    Update trainer by ID
// @route   PUT /api/trainers/:trainerId
// @access  Private
const updateTrainerById = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.trainerId);

  if (user.role === "trainer") {
    try {
      let trainerDetail;

      let update = {
        username: req.body.username ? req.body.username : user.username,
        email: req.body.email ? req.body.email : user.email,
        firstName: req.body.firstName ? req.body.firstName : user.firstName,
        lastName: req.body.lastName ? req.body.lastName : user.lastName,
        passwordHash: req.body.password
          ? bcrypt.hashSync(req.body.password, 10)
          : user.passwordHash,
        gender: req.body.gender ? req.body.gender : user.gender,
        avatarLink: req.body.avatarLink ? req.body.avatarLink : user.avatarLink,
        country: req.body.country ? req.body.country : user.country,
        heroBanner: req.body.heroBanner ? req.body.heroBanner : user.heroBanner,
        videoTrailerLink: req.body.videoTrailerLink
          ? req.body.videoTrailerLink
          : user.videoTrailerLink,
        motto: req.body.motto ? req.body.motto : user.motto,
        bio: req.body.bio ? req.body.bio : user.bio,
        trainerGoals: req.body.trainerGoals ? req.body.trainerGoals : [],
        trainersFitnessInterest: req.body.trainersFitnessInterest
          ? req.body.trainersFitnessInterest
          : [],
      };

      const trainerId = req.params.trainerId;
      if (req.body.trainerDetails) {
        if (user.trainerDetails) {
          await Trainer.findByIdAndUpdate(
            user.trainerDetails._id,
            req.body.trainerDetails,
            {
              useFindAndModify: false,
            }
          );
        } else {
          trainerDetail = new Trainer(req.body.trainerDetails);
          await trainerDetail.save();
          user.trainerDetails = await trainerDetail._id;
          await user.save();
        }

        console.log(trainerDetail);
      }
      await User.findByIdAndUpdate(trainerId, update, {
        useFindAndModify: false,
      });

      console.log(user);
      //
      const trainer = await User.findById(trainerId)
        .populate("trainerDetails")
        .select("-passwordHash");
      return res.status(200).json({
        data: trainer,
        message: "Trainer has been updated",
      });
    } catch (error) {
      next(error);
    }
  } else {
    return res.status(404).json({
      message: "The user requested is not a trainer.",
    });
  }
});

const createtrainerComment = asyncHandler(async (req, res, next) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(500).json("Body fields cannot be empty.");
  }
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }
    const { text } = req.body;

    const user = await User.findById(req.params.trainerId);
    if (user) {
      const comment = {
        user: req.user._id,
        text: text,
      };

      user.comments.push(comment);

      await user.save();
      console.log(user);
      const updatedUser = await User.findById(req.params.trainerId).populate(
        "comments.user"
      );
      res.status(201).json({ comments: updatedUser.comments });
    } else {
      res.status(404);
      throw new Error("Trainer not found");
    }
  } catch (err) {
    console.log("error", err);
    return next(err);
  }
});
module.exports = {
  createTrainer,
  getAllTrainers,
  getTrainerById,
  updateTrainerById,
  createtrainerComment,
};
