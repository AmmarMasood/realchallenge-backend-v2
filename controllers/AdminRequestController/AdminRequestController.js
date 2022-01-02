const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const { Blog } = require("../../models/BlogModels/blogModel");
const { Recipe } = require("../../models/RecipeModels/recipeModel");
const { Challenges } = require("../../models/ChallengeModels/challengesModel");

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
      await Challenges.findByIdAndUpdate(
        req.body.id,
        { adminApproved: req.body.value, isPublic: req.body.value },
        {
          useFindAndModify: false,
        }
      );
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
