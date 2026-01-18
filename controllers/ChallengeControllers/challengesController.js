/*
  TODO:1 GET Trainers ID and pass here
  TODO:2 Create Membership Logic and pass id here in challenge
*/

const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const { roles } = require("../../utils/roles");
const { hasRole } = require("../../middlewares/authMiddleware");
const { Challenges } = require("../../models/ChallengeModels/challengesModel");
const { generateTranslationKey } = require("../../utils/translationKey");
const { Trainer } = require("../../models/UserModels/trainerModel");
const {
  CustomerDetails,
} = require("../../models/UserModels/customerDetailsModel");
const { User } = require("../../models/UserModels/userModel");
const { createWorkout } = require("./workoutController");
const {
  createMusicWithChallenges,
  updateMusicWithChallenges,
} = require("./musicController");
const NotificationService = require("../../services/notificationService");

// Helper function to escape regex special characters
const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// @desc    Create a Challenge
// @route   POST /api/challenges/create
const createChallenge = asyncHandler(async (req, res, next) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(500).json("Body fields cannot be empty.");
  }
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    // Check if challenge with same name already exists for the assigned trainers and language (case-insensitive)
    // It follows the trainer (the owner), not the creator when it's the admin
    const trainersToCheck = req.body.trainers && req.body.trainers.length > 0
      ? req.body.trainers
      : [req.user.id]; // If no trainers assigned, use creator as owner

    const existingChallenge = await Challenges.findOne({
      trainers: { $in: trainersToCheck },
      language: req.body.language,
      challengeName: { $regex: new RegExp(`^${escapeRegex(req.body.challengeName)}$`, 'i') },
    });

    if (existingChallenge) {
      return res.status(409).json({
        message: "A challenge with this name and language already exists for one of the assigned trainers",
        error: "DUPLICATE_CHALLENGE_NAME",
      });
    }

    let WeeksResolved;
    let workoutID;
    if (req.body.weeks.length > 0) {
      const Weeks = Promise.all(
        req.body.weeks.map(async (week) => {
          const Workouts = Promise.all(
            week.workout.map(async (workout) => {
              workoutID = createWorkout(workout);
              return workoutID;
            })
          );
          let workoutsResolved = await Workouts;
          const newWeek = week.weekName;
          return {
            weekName: newWeek,
            weekSubtitle: week.weekSubtitle,
            workouts: workoutsResolved,
          };
        })
      );
      WeeksResolved = await Weeks;
    }
    let musicId;
    let musicsResolved;
    if (req.body.music.length > 0) {
      const musics = Promise.all(
        req.body.music.map(async (music) => {
          musicId = createMusicWithChallenges(music);
          console.log(musicId);
          return musicId;
        })
      );
      musicsResolved = await musics;
    }

    console.log("Musics", musicsResolved);

    // Generate or use provided translationKey
    const translationKey = req.body.translationKey ||
      generateTranslationKey("challenge", req.body.challengeName);

    let newChallenge = new Challenges({
      user: req.user.id,
      translationKey,
      language: req.body.language,
      challengeName: req.body.challengeName,
      description: req.body.description,
      price: req.body.price,
      points: req.body.points,
      currency: req.body.currency,
      trainersFitnessInterest: req.body.trainersFitnessInterest,
      thumbnailLink: req.body.thumbnailLink,
      additionalProducts: req.body.additionalProducts,
      videoThumbnailLink: req.body.videoThumbnailLink,
      videoLink: req.body.videoLink,
      access: req.body.access,
      trainers: req.body.trainers,
      challengeGoals: req.body.challengeGoals,
      tags: req.body.tags,
      body: req.body.body,
      duration: req.body.duration,
      difficulty: req.body.difficulty,
      weeks: WeeksResolved,
      music: musicsResolved,
      results: req.body.results,
      informationList: req.body.informationList,
      allowComments: req.body.allowComments,
      isPublic: req.body.isPublic,
      allowReviews: req.body.allowReviews,
      createPost: req.body.createPost,
      // alternativeLanguage removed - using translationKey for multi-language support
    });

    newChallenge = await newChallenge.save();
    let Challenge = await Challenges.findById(newChallenge._id).populate([
      "trainers",
      "body",
      "tags",
      "additionalProducts",
      "music",
      //"weeks.workouts",
      {
        path: "weeks",
        populate: [
          {
            path: "workouts",
            populate: [
              {
                path: "exercises",
              },
              {
                path: "relatedEquipments",
              },
              {
                path: "relatedProducts",
              },
            ],
          },
        ],
      },
    ]);
    if (!Challenge) {
      return res.status(400).json("Challenge cannot be created!");
    } else {
      if (req.body.sendNotification) {
        await NotificationService.challengeCreated(
          { name: newChallenge.challengeName, _id: newChallenge._id },
          req.user.id
        );
      }

      return res.status(201).json({
        mesage: "Challenge Created Successfully",
        weeks: Challenge,
      });
    }
  } catch (err) {
    console.log(err);
    return next(err);
  }
});

// @desc    Get week by ID from challenges
// @route   GET /api/challenges/:challengeId/:weekId
const getWeekByID = asyncHandler(async (req, res) => {
  const challenge = await Challenges.findById(req.params.challengeId).populate([
    {
      path: "weeks",
      populate: [
        {
          path: "workouts",
          populate: [
            {
              path: "exercises",
            },
            {
              path: "relatedEquipments",
            },
            {
              path: "relatedProducts",
            },
          ],
        },
      ],
    },
  ]);
  if (challenge) {
    const weeksArray = challenge.weeks;
    // console.log(weeksArray);
    // const week = weeksArray.find((week) => week._id === req.params.weekId);
    const week = weeksArray.filter(
      (week) => week._id.toString() === req.params.weekId.toString()
    );

    if (week.length > 0) {
      let returnWeek = week[0];
      return res.status(201).json({
        week: returnWeek,
        message: "Week Retrieved Successfully!",
      });
    } else {
      return res.status(400).json({
        message: "Week Id is invalid!",
      });
    }
  } else {
    return res.status(400).json({
      message: "Challenge Id is invalid!",
    });
  }
});

// @desc    Get challenge by ID
// @route   GET /api/challenges/:challengeId
const getChallengeById = asyncHandler(async (req, res) => {
  const challenge = await Challenges.findById(req.params.challengeId).populate([
    "trainers",
    "body",
    "tags",
    "trainersFitnessInterest",
    "additionalProducts",
    "music",
    "comments.user",
    "reviews.user",

    //"weeks.workouts",
    {
      path: "weeks",
      populate: [
        {
          path: "workouts",
          populate: [
            {
              path: "exercises",
            },
            {
              path: "relatedEquipments",
            },
            {
              path: "relatedProducts",
            },
          ],
        },
      ],
    },
  ]);

  if (challenge) {
    res.json(challenge);
  } else {
    res.status(404);
    throw new Error("Challenge not found");
  }
});

// // @desc    Get All challenges
// // @route   GET /api/challenges/
const getAllChallenges = asyncHandler(async (req, res) => {
  let challenges;
  if (req.query.language && req.query.language.length > 0) {
    challenges = await Challenges.find({
      isPublic: true,
      adminApproved: true,
      language: req.query.language,
    }).populate([
      "trainers",
      "body",
      "tags",
      "additionalProducts",
      "trainersFitnessInterest",
      "music",
      //"weeks.workouts",
      {
        path: "weeks",
        populate: [
          {
            path: "workouts",
            populate: [
              {
                path: "exercises.exerciseId",
              },
              {
                path: "relatedEquipments",
              },
              {
                path: "relatedProducts",
              },
            ],
          },
        ],
      },
    ]);
  } else {
    challenges = await Challenges.find({
      isPublic: true,
      adminApproved: true,
    }).populate([
      "trainers",
      "body",
      "tags",
      "additionalProducts",
      "trainersFitnessInterest",
      "music",
      //"weeks.workouts",
      {
        path: "weeks",
        populate: [
          {
            path: "workouts",
            populate: [
              {
                path: "exercises.exerciseId",
              },
              {
                path: "relatedEquipments",
              },
              {
                path: "relatedProducts",
              },
            ],
          },
        ],
      },
    ]);
  }

  if (challenges) {
    res.status(200).json({
      challenges,
    });
  } else {
    res.status(404);
    throw new Error("Challenges Cannot be fetched");
  }
});

const getAllUserChallenges = asyncHandler(async (req, res) => {
  let challenges;
  const includeAssigned = req.query.includeAssigned === 'true';

  // Common populate configuration
  const populateConfig = [
    "trainers",
    "body",
    "tags",
    "additionalProducts",
    "trainersFitnessInterest",
    "music",
    "user",
    {
      path: "weeks",
      populate: [
        {
          path: "workouts",
          populate: [
            {
              path: "exercises.exerciseId",
            },
            {
              path: "relatedEquipments",
            },
            {
              path: "relatedProducts",
            },
          ],
        },
      ],
    },
  ];

  if (hasRole(req.user, "admin")) {
    if (req.query.language && req.query.language.length > 0) {
      challenges = await Challenges.find({
        language: req.query.language,
      }).populate(populateConfig);
    } else {
      challenges = await Challenges.find({}).populate(populateConfig);
    }
  } else {
    // For trainers: optionally include challenges where they are in trainers array
    if (req.query.language && req.query.language.length > 0) {
      const query = includeAssigned
        ? {
            $or: [
              { user: req.user.id },
              { trainers: req.user.id }
            ],
            language: req.query.language,
          }
        : {
            user: req.user.id,
            language: req.query.language,
          };

      challenges = await Challenges.find(query).populate(populateConfig);
    } else {
      const query = includeAssigned
        ? {
            $or: [
              { user: req.user.id },
              { trainers: req.user.id }
            ]
          }
        : { user: req.user.id };

      challenges = await Challenges.find(query).populate(populateConfig);
    }
  }

  if (challenges) {
    res.status(200).json({
      challenges,
    });
  } else {
    res.status(404);
    throw new Error("Challenges Cannot be fetched");
  }
});

// // @desc    Update Challenge by Id
// // @route   PUT /api/challenge/:challengeId
const updateChallenge = asyncHandler(async (req, res, next) => {
  try {
    // If challengeName, trainers, or language is being updated, check for duplicates
    if (req.body.challengeName || req.body.trainers || req.body.language) {
      const challenge = await Challenges.findById(req.params.challengeId);

      // Use updated values or fall back to existing values
      const trainersToCheck = req.body.trainers !== undefined
        ? (req.body.trainers.length > 0 ? req.body.trainers : [challenge.user])
        : (challenge.trainers.length > 0 ? challenge.trainers : [challenge.user]);
      const languageToCheck = req.body.language || challenge.language;
      const nameToCheck = req.body.challengeName || challenge.challengeName;

      const existingChallenge = await Challenges.findOne({
        trainers: { $in: trainersToCheck },
        language: languageToCheck,
        challengeName: { $regex: new RegExp(`^${escapeRegex(nameToCheck)}$`, 'i') },
        _id: { $ne: req.params.challengeId }, // Exclude the current challenge
      });

      if (existingChallenge) {
        return res.status(409).json({
          message: "A challenge with this name and language already exists for one of the assigned trainers",
          error: "DUPLICATE_CHALLENGE_NAME",
        });
      }
    }

    let musicsResolved;
    if (req.body.music) {
      if (req.body.music.length > 0) {
        const musics = Promise.all(
          req.body.music.map(async (m) => {
            if (m._id) {
              return updateMusicWithChallenges(m);
            } else {
              return createMusicWithChallenges(m);
            }
          })
        );
        musicsResolved = await musics;
      }
    }
    const challenge = await Challenges.findById(req.params.challengeId);
    let update;
    if (challenge) {
      update = {
        challengeName: req.body.challengeName
          ? req.body.challengeName
          : challenge.challengeName,
        description: req.body.description
          ? req.body.description
          : challenge.description,
        access: req.body.access ? req.body.access : challenge.access,
        price: req.body.price ? req.body.price : challenge.price,
        points: req.body.points ? req.body.points : challenge.points,
        currency: req.body.currency ? req.body.currency : challenge.currency,
        thumbnailLink: req.body.thumbnailLink
          ? req.body.thumbnailLink
          : challenge.thumbnailLink,
        trainersFitnessInterest: req.body.trainersFitnessInterest
          ? req.body.trainersFitnessInterest
          : challenge.trainersFitnessInterest,
        videoThumbnailLink: req.body.videoThumbnailLink
          ? req.body.videoThumbnailLink
          : challenge.videoThumbnailLink,
        duration: req.body.duration ? req.body.duration : challenge.duration,
        difficulty: req.body.difficulty
          ? req.body.difficulty
          : challenge.difficulty,
        results: req.body.results ? req.body.results : challenge.results,
        allowComments: req.body.allowComments,
        allowReviews: req.body.allowReviews,
        isPublic: hasRole(req.user, "admin") ? req.body.isPublic : false,
        adminApproved:
          hasRole(req.user, "admin") ? req.body.adminApproved : false,
        weeks: req.body.weeks ? req.body.weeks : challenge.weeks,
        body: req.body.body ? req.body.body : challenge.body,
        tags: req.body.tags ? req.body.tags : challenge.tags,
        informationList: req.body.informationList
          ? req.body.informationList
          : challenge.informationList,
        challengeGoals: req.body.challengeGoals
          ? req.body.challengeGoals
          : challenge.challengeGoals,
        trainers: req.body.trainers ? req.body.trainers : challenge.trainers,
        music: musicsResolved,
      };
      await Challenges.findByIdAndUpdate(challenge._id, update, {
        useFindAndModify: false,
      });
      const updatedChallenge = await Challenges.findById(
        challenge._id
      ).populate([
        "trainers",
        "body",
        "tags",
        "additionalProducts",
        "music",
        //"weeks.workouts",
        {
          path: "weeks",
          populate: [
            {
              path: "workouts",
              populate: [
                {
                  path: "exercises",
                },
                {
                  path: "relatedEquipments",
                },
                {
                  path: "relatedProducts",
                },
              ],
            },
          ],
        },
      ]);
      res.status(200).json({
        data: updatedChallenge,
        message: "Challenge updated",
      });
    } else {
      res.status(404);
      throw new Error("Challenge not found");
    }
  } catch (error) {
    next(error);
  }
});

// // @desc    Delete challenge
// // @route   Delete /api/challenges/:challengeId
const deleteChallenge = asyncHandler(async (req, res) => {
  const challenge = await Challenges.findById(req.params.challengeId);

  if (challenge) {
    await challenge.remove();
    res.json({ message: "Challenge removed" });
  } else {
    res.status(404);
    throw new Error("Challenge not found");
  }
});

// @desc    Create Challenge Review
// @route   GET /api/challenge/:id/reviews
// @access  Private
const createChallengeReview = asyncHandler(async (req, res, next) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(500).json("Body fields cannot be empty.");
  }
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }
    const { rating, comment } = req.body;
    const challenge = await Challenges.findById(req.params.id);
    const user = await User.findById(req.user._id).populate("customerDetails");

    if (challenge) {
      const alreadyReviewed = challenge.reviews.find(
        (r) => r.user.toString() === req.user._id.toString()
      );

      if (alreadyReviewed) {
        res.status(400);
        throw new Error("Challenge already reviewed");
      }

      const review = {
        rating: Number(rating),
        comment,
        user: req.user._id,
      };

      // saving reivew in challenge model
      challenge.reviews.push(review);
      challenge.rating =
        challenge.reviews.reduce((acc, item) => item.rating + acc, 0) /
        challenge.reviews.length;
      const updatedChallenge = await challenge.save();
      // saving review in customer details tracking modal
      const customerDetails = user.customerDetails;
      var newTrackChallenges = [...customerDetails.trackChallenges];
      const challengeIndex = newTrackChallenges.findIndex((c) => {
        return c.challenge.toString() === updatedChallenge._id.toString();
      });
      const newReview = updatedChallenge.reviews.filter(
        (f) => f.user.toString() === req.user._id.toString()
      );
      console.log("user", user);
      console.log("challegen index", challengeIndex);
      console.log("user who reviewd", user.customerDetails.trackChallenges[0]);
      console.log("new review", newReview);
      console.log("new review", newTrackChallenges[challengeIndex]);

      if (challengeIndex >= 0) {
        newTrackChallenges[challengeIndex].challengeReview = newReview[0]._id;
      }
      console.log("new track challege", newTrackChallenges[challengeIndex]);
      await CustomerDetails.findByIdAndUpdate(
        customerDetails._id,
        { trackChallenges: newTrackChallenges },
        {
          useFindAndModify: false,
        }
      );
      console.log(challenge);
      res.status(201).json({ message: "Review added" });
    } else {
      res.status(404);
      throw new Error("Challenge not found");
    }
  } catch (err) {
    return next(err);
  }
});

// @desc    Create Challenge Comment
// @route   post /api/challenge/:id/comment
// @access  Private
const createChallengeComment = asyncHandler(async (req, res, next) => {
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

    const challenge = await Challenges.findById(req.params.id).populate("trainers");
    if (challenge) {
      const comment = {
        user: req.user._id,
        text: text,
      };

      challenge.comments.push(comment);

      await challenge.save();
      console.log(challenge);
      const updatedChallenge = await Challenges.findById(
        req.params.id
      ).populate("comments.user");

      // Notify trainers about the new comment
      const trainerIds = challenge.trainers?.map((t) =>
        typeof t === "object" ? t._id || t.user : t
      ) || [];
      if (trainerIds.length > 0) {
        await NotificationService.commentOnChallenge(
          challenge,
          trainerIds,
          req.user._id.toString(),
          req.user.username || req.user.firstName || "Someone"
        );
      }

      res.status(201).json({ comments: updatedChallenge.comments });
    } else {
      res.status(404);
      throw new Error("Challenge not found");
    }
  } catch (err) {
    console.log("error", err);
    return next(err);
  }
});

const grantAccess = function (action, resource) {
  return async (req, res, next) => {
    try {
      // console.log("Access Granted", req.user.role);
      console.log(req.user);
      const permission = roles.can(req.user.role)[action](resource);
      if (!permission.granted) {
        return res.status(401).json({
          error: "You don't have enough permission to perform this action",
        });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};

const destroy = asyncHandler(async (req, res, next) => {
  try {
    await Challenges.deleteMany({});

    console.log("deletesd");
    res.status(200).send({
      status: "Successfully removed all Challenges files",
    });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @desc    Get all translations of a challenge by translationKey
// @route   GET /api/challenges/translations/:translationKey
const getTranslationsByKey = asyncHandler(async (req, res) => {
  const { translationKey } = req.params;
  const { excludeLanguage } = req.query;

  let query = { translationKey };

  // Optionally exclude a specific language (useful for getting other translations)
  if (excludeLanguage) {
    query.language = { $ne: excludeLanguage };
  }

  const translations = await Challenges.find(query)
    .select('_id challengeName language translationKey')
    .lean();

  res.status(200).json({
    translations,
    count: translations.length,
  });
});

// @desc    Get a challenge in a specific language by translationKey
// @route   GET /api/challenges/translation/:translationKey/:language
const getChallengeByTranslationKey = asyncHandler(async (req, res) => {
  const { translationKey, language } = req.params;

  const challenge = await Challenges.findOne({ translationKey, language }).populate([
    "trainers",
    "body",
    "tags",
    "trainersFitnessInterest",
    "additionalProducts",
    "music",
    "comments.user",
    "reviews.user",
    {
      path: "weeks",
      populate: [
        {
          path: "workouts",
          populate: [
            { path: "exercises" },
            { path: "relatedEquipments" },
            { path: "relatedProducts" },
          ],
        },
      ],
    },
  ]);

  if (challenge) {
    res.json(challenge);
  } else {
    res.status(404);
    throw new Error("Challenge not found for this language");
  }
});

module.exports = {
  createChallenge,
  getChallengeById,
  getAllChallenges,
  updateChallenge,
  deleteChallenge,
  createChallengeReview,
  createChallengeComment,
  grantAccess,
  getWeekByID,
  getAllUserChallenges,
  destroy,
  getTranslationsByKey,
  getChallengeByTranslationKey,
};
