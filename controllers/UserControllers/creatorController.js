const asyncHandler = require("express-async-handler");
const { User } = require("../../models/UserModels/userModel");
const { Challenges } = require("../../models/ChallengeModels/challengesModel");
const { Recipe } = require("../../models/RecipeModels/recipeModel");

// @desc    Get creator (any user) by ID
// @route   GET /api/creator/:id
// @access  Public
const getCreatorById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .populate("trainersFitnessInterest")
    .populate("trainerGoals")
    .select("-passwordHash");

  if (!user) {
    res.status(404);
    throw new Error("Creator not found");
  }

  return res.status(200).json({
    message: "Creator fetched successfully",
    creator: user,
  });
});

// @desc    Get public challenges created/assigned to a user
// @route   GET /api/creator/:id/challenges
// @access  Public
const getChallengesByUserId = asyncHandler(async (req, res) => {
  const userId = req.params.id;

  const allChallenges = await Challenges.find({
    trainers: userId,
    isPublic: true,
    adminApproved: true,
  }).select(
    "challengeName thumbnailLink videoThumbnailLink informationList rating fitnessInterests intensityGroupId intensity language"
  );

  // Deduplicate by intensityGroupId and attach intensityVariants
  const groupMap = {};
  const challenges = [];
  for (const c of allChallenges) {
    if (c.intensityGroupId) {
      if (!groupMap[c.intensityGroupId]) {
        groupMap[c.intensityGroupId] = {
          representative: c,
          variants: [],
        };
      }
      groupMap[c.intensityGroupId].variants.push({
        _id: c._id,
        intensity: c.intensity,
        challengeName: c.challengeName,
      });
    } else {
      challenges.push(c);
    }
  }
  for (const groupId of Object.keys(groupMap)) {
    const group = groupMap[groupId];
    const rep = group.representative.toObject
      ? group.representative.toObject()
      : { ...group.representative };
    rep.intensityVariants = group.variants;
    challenges.push(rep);
  }

  return res.status(200).json({
    message: "Challenges fetched successfully",
    challenges,
  });
});

// @desc    Get public recipes created by a user
// @route   GET /api/creator/:id/recipes
// @access  Public
const getRecipesByUserId = asyncHandler(async (req, res) => {
  const userId = req.params.id;

  const recipes = await Recipe.find({
    user: userId,
    isPublic: true,
    adminApproved: true,
  })
    .select(
      "name image rating prepTime language translationKey kCalPerPerson persons"
    );

  return res.status(200).json({
    message: "Recipes fetched successfully",
    recipes,
  });
});

module.exports = {
  getCreatorById,
  getChallengesByUserId,
  getRecipesByUserId,
};
