const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const { Blog } = require("../../models/BlogModels/blogModel");
const { Recipe } = require("../../models/RecipeModels/recipeModel");
const { Challenges } = require("../../models/ChallengeModels/challengesModel");
const NotificationService = require("../../services/notificationService");

// @desc    Get All Recipes
const getAllRequests = asyncHandler(async (req, res) => {
  try {
    const recipes = await Recipe.find({});
    const blogs = await Blog.find({});
    const challenges = await Challenges.find({});
    res.status(200).json({
      recipes: recipes,
      blogs: blogs,
      challenges: challenges,
    });
  } catch (err) {
    res.status(404);
    throw new Error("Body Cannot be fetched");
  }
});

const updateRequest = asyncHandler(async (req, res) => {
  try {
    if (req.body.type === "challenge") {
      // Get the challenge before updating to check if it was previously not approved
      const challenge = await Challenges.findById(req.body.id);
      const wasApproved = challenge ? challenge.adminApproved : false;

      await Challenges.findByIdAndUpdate(
        req.body.id,
        { adminApproved: req.body.value, isPublic: req.body.value },
        {
          useFindAndModify: false,
        }
      );

      // Send notification to trainers when challenge goes live (approved for the first time)
      if (req.body.value === true && !wasApproved && challenge && challenge.trainers && challenge.trainers.length > 0) {
        await NotificationService.challengeLive(challenge, challenge.trainers);
      }
    }
    if (req.body.type === "recipe") {
      await Recipe.findByIdAndUpdate(
        req.body.id,
        { adminApproved: req.body.value, isPublic: req.body.value },
        {
          useFindAndModify: false,
        }
      );
    }
    if (req.body.type === "blog") {
      await Blog.findByIdAndUpdate(
        req.body.id,
        { adminApproved: req.body.value, isPublic: req.body.value },
        {
          useFindAndModify: false,
        }
      );
    }

    res.status(200).json({
      message: "success",
    });
  } catch (err) {
    res.status(404);
    throw new Error("Body Cannot be fetched");
  }
});

//   const updateARequest = asyncHandler(async (req, res) => {
//     try{
//         let item;
//         if(req.body.type === "recipe"){}
//         if(req.body.type === "blog"){}
//         if(req.body.type === "challenge"){}
//         const recipes = await Recipe.find({});
//         const blogs = await Blog.find({})
//         const challenges = await Challenges.find({})
//         res.status(200).json({
//             recipes: recipes,
//             blogs: blogs,
//             challenges: challenges
//           });
//     }catch(err){
//         res.status(404);
//         throw new Error("Body Cannot be fetched");
//     }

module.exports = {
  getAllRequests,
  updateRequest,
};

//   });
