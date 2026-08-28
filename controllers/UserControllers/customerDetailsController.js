const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const { body, validationResult } = require("express-validator");
const { tags } = require("../../models/ChallengeModels/tagsModel");
const generateToken = require("../../utils/generateToken");
const bcrypt = require("bcryptjs");
const {
  CustomerDetails,
} = require("../../models/UserModels/customerDetailsModel");
const { User } = require("../../models/UserModels/userModel");
const { Challenges } = require("../../models/ChallengeModels/challengesModel");
const { Recipe } = require("../../models/RecipeModels/recipeModel");
const { DEFAULT_LANGUAGE } = require("../../utils/language");
const { resolveCustomerGoal } = require("../../utils/goals");
const {
  rankChallenges,
} = require("../../services/recommendation/challengeScoring");
const { IdentityStore } = require("aws-sdk");
const NotificationService = require("../../services/notificationService");
const { v4: uuidv4 } = require("uuid");
const {
  getPresignedPutUrl,
  getCloudFrontUrl,
  headObject,
} = require("../../config/s3");
const imageOptimizationService = require("../../services/imageOptimizationService");
const mediaConvertService = require("../../services/mediaConvertService");
const UserVideoJob = require("../../models/MediaManagerModels/userVideoJobModel");
const { normalizeSupplementOption } = require("../../services/mealPlanService");

// @desc    Create Customer role by ID
// @route   POST /api/customer/create
// @access  Private
const createCustomer = asyncHandler(async (req, res, next) => {
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
      return res.status(400).json("Customer cannot be created!");
    } else {
      return res.status(201).json({
        mesage: "Customer created Successfully",
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

// @desc    Get All Customer Details
// @route   GET /api/customerDetails/all
const getAllCustomers = asyncHandler(async (req, res) => {
  const customers = await User.find({ role: "customer" })
    .select("-passwordHash")
    .populate("customerDetails");
  if (customers) {
    res.status(200).json({
      customers,
    });
  } else {
    res.status(404);
    throw new Error("Customers with Details Cannot be fetched");
  }
});

// @desc    Get Customer Details by ID
// @route   GET /api/customerDetails/:customerDetailsId
const getCustomerById = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.params.customerId).populate({
      path: "customerDetails",
      populate: [
        {
          path: "challenges",
          populate: [
            {
              path: "trainers",
            },
          ],
        },
        {
          path: "membership",
        },
        {
          path: "groceryList",
        },
        {
          path: "myDiet",
        },
        {
          path: "supplementIntake.recipes",
          model: "Recipe",
        },
      ],
    });

    //trainers

    if (user) {
      // if (user.role === "customer") {
      console.log("cehking", user);
      return res.status(201).json({
        message: "Customer with Details fetched successfully",
        customer: user,
      });
      // } else {
      //   return res.status(404).json({
      //     message: "The user requested is not a customer.",
      //   });
      // }
    } else {
      res.status(404);
      throw new Error("Customer not found");
    }
  } catch (err) {
    console.log(err);
    throw err;
  }
});

// @desc    Update Customer Details by Id
// @route   PUT /api/customerDetails/:userId
const updateCustomer = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.customerId);
  console.log("here");
  if (user.role === "customer" || user.role === "admin") {
    try {
      let customerDetails;

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
      };
      console.log(req.body.customerDetails);
      const customerId = req.params.customerId;
      if (req.body.customerDetails) {
        if (user.customerDetails) {
          await CustomerDetails.findByIdAndUpdate(
            user.customerDetails._id,
            req.body.customerDetails,
            {
              useFindAndModify: false,
            }
          );
        } else {
          customerDetails = new CustomerDetails(req.body.customerDetails);
          await customerDetails.save();
          user.customerDetails = await customerDetails._id;

          await user.save();
        }

        console.log(customerDetails);
      }

      await User.findByIdAndUpdate(customerId, update, {
        useFindAndModify: false,
      });

      console.log(user);
      //
      const customer = await User.findById(customerId)
        .populate("customerDetails")
        .select("-passwordHash");

      // Spec: both This/Next week plans should exist as soon as the
      // nutrition profile is set (client 2026-05-16). Idempotent + fire-
      // and-forget so it never blocks or breaks the settings save (a
      // lazy build on first plan fetch remains the fallback).
      if (
        customer &&
        customer.customerDetails &&
        customer.customerDetails.caloriesPerDay
      ) {
        const {
          ensurePlansAtSignup,
        } = require("../../services/mealPlanLifecycle");
        ensurePlansAtSignup(
          customer._id,
          customer.customerDetails._id,
          customer.timeZone
        ).catch((e) =>
          console.error("[ensurePlansAtSignup]", e.message)
        );
      }

      return res.status(200).json({
        data: customer,
        message: "Customer has been updated",
      });
    } catch (error) {
      next(error);
    }
  } else {
    return res.status(404).json({
      message: "The user requested is not a customer.",
    });
  }
});

// @desc    Get favourite recipe
// @route   GET /api/customerDetails/favouriteRecipe/:customerId
// @access  Private/Customer
const getAllFavouriteRecipes = asyncHandler(async (req, res, next) => {
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    const user = await User.findById(req.params.customerId).populate({
      path: "customerDetails",
      populate: [
        {
          path: "favouriteRecipes",
        },
      ],
    });
    const favRecipes =
      (user && user.customerDetails && user.customerDetails.favouriteRecipes) ||
      [];

    // Empty list is a normal state, not a client error — see the note on
    // getAllFavouriteChallenges below.
    return res.status(200).json({
      message: favRecipes.length
        ? "Favourite recipes fetched successfully"
        : "No favourite recipes yet",
      favRecipes,
    });
  } catch (err) {
    return next(err);
  }
});

// @desc    Set favourite recipe
// @route   PUT /api/customerDetails/favouriteRecipe/:customerId
// @access  Private/Admin
const setFavouriteRecipe = asyncHandler(async (req, res, next) => {
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }
    let favourite = req.body.recipeId;

    // Creator cannot favourite their own recipe
    const recipeToFav = await Recipe.findById(favourite);
    if (recipeToFav && recipeToFav.user && recipeToFav.user.toString() === req.params.customerId) {
      return res.status(403).json({ msg: "Cannot favourite your own recipe" });
    }

    const user = await User.findById(req.params.customerId).populate(
      "customerDetails"
    );
    if (!user || !user.customerDetails) {
      return res.status(400).json({ msg: "User profile not found" });
    }
    let favRecipe = await user.customerDetails.favouriteRecipes;

    // check if post already being liked by user
    if (
      favRecipe.filter(
        (recipeId) => recipeId.toString() === favourite.toString()
      ).length > 0
    ) {
      console.log("here");
      return res.status(400).json({ msg: "Recipe Already favourited" });
    }

    if (user && favourite) {
      favRecipe.push(favourite);
      await user.customerDetails.save();
      return res.status(200).json({
        message: "Recipe favorited",
        favouriteRecipes: favRecipe,
      });
    } else {
      return res.status(400).json("no favourite recipe sent");
    }
  } catch (err) {
    return next(err);
  }
});

// @route    PUT api/customerDetails/unfavouriteRecipe/:customerId
// @desc     Unfavourite recipe
// @access   Private
const unfavouriteRecipe = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.params.customerId).populate(
      "customerDetails"
    );

    let unFavId = req.body.recipeId;

    const removeIndex = await user.customerDetails.favouriteRecipes
      .map((recipeId) => recipeId.toString())
      .indexOf(unFavId);

    user.customerDetails.favouriteRecipes.splice(removeIndex, 1);

    await user.customerDetails.save();
    return res.status(200).json({
      message: "recipe unfavourited",
      favouriteRecipes: user.customerDetails.favouriteRecipes,
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Server Error");
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Favourite Challenges — parallel to Favourite Recipes (above). Same shape,
// same error semantics. Lives on customerDetails.favouriteChallenges.
// ─────────────────────────────────────────────────────────────────────────

// @desc    Get all favourite challenges
// @route   GET /api/customerDetails/favouriteChallenge/:customerId
// @access  Private/Customer
const getAllFavouriteChallenges = asyncHandler(async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }
    const user = await User.findById(req.params.customerId).populate({
      path: "customerDetails",
      populate: [{ path: "favouriteChallenges" }],
    });
    const favChallenges =
      (user && user.customerDetails && user.customerDetails.favouriteChallenges) || [];
    // An empty favourites list is a normal state, not a client error. This
    // used to answer 400, which logged a console error on every dashboard load
    // for anyone who had not favourited anything yet.
    return res.status(200).json({
      message: favChallenges.length
        ? "Favourite challenges fetched successfully"
        : "No favourite challenges yet",
      favChallenges,
    });
  } catch (err) {
    return next(err);
  }
});

// @desc    Add a challenge to favourites
// @route   PUT /api/customerDetails/favouriteChallenge/:customerId
// @access  Private/Customer
const setFavouriteChallenge = asyncHandler(async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }
    const favourite = req.body.challengeId;

    // Don't let a trainer favourite their own challenge.
    const challengeToFav = await Challenges.findById(favourite);
    if (
      challengeToFav &&
      Array.isArray(challengeToFav.trainers) &&
      challengeToFav.trainers
        .map((t) => t.toString())
        .includes(req.params.customerId)
    ) {
      return res
        .status(403)
        .json({ msg: "Cannot favourite your own challenge" });
    }

    const user = await User.findById(req.params.customerId).populate(
      "customerDetails"
    );
    if (!user || !user.customerDetails) {
      return res.status(400).json({ msg: "User profile not found" });
    }
    const favChallenges = user.customerDetails.favouriteChallenges || [];

    if (
      favChallenges.filter((id) => id.toString() === favourite.toString())
        .length > 0
    ) {
      return res.status(400).json({ msg: "Challenge already favourited" });
    }

    if (user && favourite) {
      favChallenges.push(favourite);
      user.customerDetails.favouriteChallenges = favChallenges;
      await user.customerDetails.save();
      return res.status(200).json({
        message: "Challenge favorited",
        favouriteChallenges: favChallenges,
      });
    }
    return res.status(400).json("no favourite challenge sent");
  } catch (err) {
    return next(err);
  }
});

// @desc    Remove a challenge from favourites
// @route   PUT /api/customerDetails/unfavouriteChallenge/:customerId
// @access  Private/Customer
const unfavouriteChallenge = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.params.customerId).populate(
      "customerDetails"
    );
    const unFavId = req.body.challengeId;

    const removeIndex = (user.customerDetails.favouriteChallenges || [])
      .map((id) => id.toString())
      .indexOf(unFavId);

    if (removeIndex >= 0) {
      user.customerDetails.favouriteChallenges.splice(removeIndex, 1);
      await user.customerDetails.save();
    }

    return res.status(200).json({
      message: "challenge unfavourited",
      favouriteChallenges: user.customerDetails.favouriteChallenges,
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Server Error");
  }
});

// @desc    Add recipe to shopping cart
// @route   PUT /api/customerDetails/shoppingCart/:customerId
const addToShoppingCart = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.params.customerId).populate(
      "customerDetails"
    );
    const recipeId = req.body.recipeId;

    if (
      user.customerDetails.shoppingCart
        .map((id) => id.toString())
        .includes(recipeId)
    ) {
      return res.status(400).json({ message: "Recipe already in shopping cart" });
    }

    user.customerDetails.shoppingCart.push(recipeId);
    await user.customerDetails.save();

    return res.status(200).json({
      message: "Recipe added to shopping cart",
      shoppingCart: user.customerDetails.shoppingCart,
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Server Error");
  }
});

// @desc    Remove recipe from shopping cart
// @route   PUT /api/customerDetails/removeShoppingCart/:customerId
const removeFromShoppingCart = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.params.customerId).populate(
      "customerDetails"
    );
    const recipeId = req.body.recipeId;

    const removeIndex = user.customerDetails.shoppingCart
      .map((id) => id.toString())
      .indexOf(recipeId);

    if (removeIndex === -1) {
      return res.status(400).json({ message: "Recipe not in shopping cart" });
    }

    user.customerDetails.shoppingCart.splice(removeIndex, 1);
    await user.customerDetails.save();

    return res.status(200).json({
      message: "Recipe removed from shopping cart",
      shoppingCart: user.customerDetails.shoppingCart,
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Server Error");
  }
});

// @desc    Get shopping cart
// @route   GET /api/customerDetails/shoppingCart/:customerId
const getShoppingCart = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.params.customerId).populate({
      path: "customerDetails",
      populate: {
        path: "shoppingCart",
        model: "Recipe",
        populate: { path: "ingredients.name", model: "Ingredient" },
      },
    });

    return res.status(200).json({
      message: "Shopping cart fetched",
      shoppingCart: user.customerDetails.shoppingCart,
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Server Error");
  }
});

// @desc    Get recommended challenges for a customer.
//
//          Hard filters (published, language, goal, not already owned) run in
//          Mongo; ranking is done by services/recommendation/challengeScoring.
//          A customer has exactly one goal out of three, so the goal is a
//          filter — discipline overlap is what actually ranks the results.
//
//          Returns 200 with an empty list and a `reason` when there is nothing
//          to show. An unset goal is a normal state, not an error, and the old
//          404 meant the frontend never surfaced the message.
//
// @route   GET /api/customerDetails/recommendedChallenges/:customerId
//          ?language=english&limit=10
const getRecommendedChallenge = asyncHandler(async (req, res) => {
  const customer = await User.findById(req.params.customerId)
    .select("-passwordHash")
    .populate("customerDetails");

  if (!customer || !customer.customerDetails) {
    res.status(404);
    throw new Error("Customer not found");
  }

  const details = customer.customerDetails;
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
  const language = req.query.language || DEFAULT_LANGUAGE;

  const goal = resolveCustomerGoal(details.goals);
  if (!goal) {
    return res.status(200).json({ recommendedChallenges: [], reason: "no_goal" });
  }

  const ownedIds = (details.challenges || []).map((c) => c._id || c);

  // Trainers and body-focus areas from challenges the customer already owns —
  // used for the affinity signals.
  const owned = ownedIds.length
    ? await Challenges.find({ _id: { $in: ownedIds } })
        .select("trainers body")
        .lean()
    : [];
  const profile = {
    fitnessInterests: details.fitnessInterests || [],
    preferredIntensity: details.preferredIntensity || [],
    trainerIds: owned.flatMap((c) => c.trainers || []),
    bodyIds: owned.flatMap((c) => c.body || []),
  };

  const baseFilter = {
    isPublic: true,
    adminApproved: true,
    language,
    _id: { $nin: ownedIds },
  };

  // Disciplines are populated so the scorer can name the overlap in its
  // "reasons" payload — the customer's own fitnessInterests are stored as bare
  // ObjectIds, so the names have to come from this side.
  const withDisciplines = (q) =>
    q.populate("trainersFitnessInterest", "name").lean();

  // Both pools are always scored and merged, rather than using off-goal only
  // as a top-up when the on-goal list is short. Topping up made the result
  // depend on `limit`: with exactly N on-goal challenges, limit=N hid off-goal
  // entirely while limit=N+1 could put one first. A customer whose disciplines
  // only match off-goal challenges saw nothing relevant at one limit and their
  // best match at the next.
  //
  // The OFF_GOAL_PENALTY in the scorer is what encodes "prefer the customer's
  // goal" — it does that consistently at every limit, whereas the fetch order
  // did it only sometimes.
  const [onGoal, offGoal] = await Promise.all([
    withDisciplines(Challenges.find({ ...baseFilter, challengeGoals: goal })),
    withDisciplines(
      Challenges.find({ ...baseFilter, challengeGoals: { $ne: goal } })
    ),
  ]);

  const ranked = rankChallenges(onGoal, profile)
    .concat(rankChallenges(offGoal, profile, { offGoal: true }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  res.status(200).json({
    recommendedChallenges: ranked.map((r) => ({
      ...r.challenge,
      score: Math.round(r.score * 1000) / 1000,
      offGoal: r.offGoal,
      reasons: r.reasons,
    })),
    reason: ranked.length === 0 ? "no_matches" : null,
  });
});

// @desc swap recipe
// @route POST /api/customerDetails/swap/customerId
const swapRecipe = asyncHandler(async (req, res, next) => {
  try {
    const customer = await User.findById(req.params.customerId)
      .select("-passwordHash")
      .populate({
        path: "customerDetails",
        model: "CustomerDetails",
        populate: [
          {
            path: "myDiet",
            select: "name -_id",
          },
          {
            path: "supplementIntake.recipes",
            select: "name kCalPerPerson protein carbohydrate fat -_id",
          },
        ],
      });

    const recipe = req.body.recipe;
    const mealType = req.body.mealType;
    const recipes = await Recipe.find()
      .populate({ path: "diet", model: "Diet", select: "name -_id" })
      .populate({ path: "mealTypes", model: "MealType", select: "name -_id" });

    let maxCalories = recipe.kCalPerPerson + 20;
    let minCalories = recipe.kCalPerPerson - 20;
    let swappedRecipe;
    for (let r of recipes) {
      let dietMatch = false;
      for (let customerDiet of customer.customerDetails.myDiet) {
        dietMatch = false;
        for (let recipeDiet of r.diet) {
          if (recipeDiet.name == customerDiet.name) {
            dietMatch = true;
            break;
          }
        }
        if (!dietMatch) {
          break;
        }
      }
      let mealTypeMatch = false;
      if (dietMatch) {
        for (let m of r.mealTypes) {
          if (m.name == mealType) {
            mealTypeMatch = true;
            break;
          }
        }
      }

      if (
        r._id != recipe._id &&
        dietMatch &&
        mealTypeMatch &&
        r.kCalPerPerson <= maxCalories &&
        r.kCalPerPerson >= minCalories
      ) {
        swappedRecipe = r;
        break;
      }
    }
    if (swappedRecipe) {
      res.status(200).json({
        message: "Similar recipe found",
        newRecipe: swappedRecipe,
      });
    } else {
      res.status(404).json({
        message: "Similar recipe not found",
      });
    }
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Server Error");
  }
});

// REMOVED: recommendedWeeklyDiet (and its local `shuffle` helper).
//
// This endpoint held a second, older copy of the meal-plan generator. It was
// superseded by services/mealPlanService (used by /api/meal-plan), but stayed
// routed and was still called on every dashboard load with its result
// discarded. Worse, the copy here never filtered allergens — the highest
// priority exclusion in the spec — so any caller reaching it could be served
// a recipe the customer is allergic to.
//
// Meal plans come from mealPlanController -> buildWeekPlan. Do not restore
// a second generator here; extend the service instead.

// @desc    Update Customer Details by Id
// @route   PUT /api/customerDetails/track-challenge/:customerId
const updateChallengeProgress = asyncHandler(async (req, res, next) => {
  try {
    const user = await User.findById(req.params.customerId).populate(
      "customerDetails"
    );
    const challengeInformation = await Challenges.findById(
      req.body.progress.challenge
    );
    const allWorkouts = challengeInformation.weeks
      .map((w) => w.workouts)
      .flat(1);
    const customerDetails = user.customerDetails;
    var newTrackChallenges = [...customerDetails.trackChallenges];
    const rate =
      (req.body.progress.completedWorkouts.length / allWorkouts.length) * 100;
    console.log("challengeInformation", allWorkouts, rate);
    if (newTrackChallenges.length > 0) {
      // update user points if challenge is completed

      console.log("here 1");
      const challengeIndex = newTrackChallenges.findIndex((c) => {
        console.log(c.challenge.toString());
        return c.challenge.toString() === req.body.progress.challenge;
      });

      if (challengeIndex >= 0) {
        const areChallengePointGained =
          newTrackChallenges[challengeIndex].challengePointGained;
        // Stamp completion time only when a workout was newly finished
        // (completedWorkouts grew), otherwise keep the prior timestamp
        const prevCompletedCount = (
          newTrackChallenges[challengeIndex].completedWorkouts || []
        ).length;
        const newCompletedCount = (
          req.body.progress.completedWorkouts || []
        ).length;
        const lastWorkoutCompletedAt =
          newCompletedCount > prevCompletedCount
            ? new Date()
            : newTrackChallenges[challengeIndex].lastWorkoutCompletedAt;
        console.log("here 2");
        newTrackChallenges[challengeIndex] = {
          ...req.body.progress,
          challengeCompletionRate: rate,
          challengeCompleted: rate === 100 ? true : false,
          challengePointGained: areChallengePointGained,
          lastWorkoutCompletedAt,
        };

        if (
          !newTrackChallenges[challengeIndex].challengePointGained &&
          rate === 100
        ) {
          newTrackChallenges[challengeIndex] = {
            ...newTrackChallenges[challengeIndex],
            challengePointGained: true,
          };
          await User.findByIdAndUpdate(
            req.params.customerId,
            { $inc: { points: challengeInformation.points } },
            {
              useFindAndModify: false,
            }
          );
          // Send notification for challenge completion
          await NotificationService.challengeCompleted(
            challengeInformation,
            req.params.customerId,
            challengeInformation.points
          );
        }
      } else {
        console.log("here 3");
        newTrackChallenges.push({
          ...req.body.progress,
          challengeCompletionRate: rate,
          challengeCompleted: rate === 100 ? true : false,
          lastWorkoutCompletedAt:
            (req.body.progress.completedWorkouts || []).length > 0
              ? new Date()
              : null,
        });

        if (
          !newTrackChallenges[newTrackChallenges.length - 1]
            .challengePointGained &&
          rate === 100
        ) {
          newTrackChallenges[newTrackChallenges.length - 1] = {
            ...newTrackChallenges[newTrackChallenges.length - 1],
            challengePointGained: true,
          };
          await User.findByIdAndUpdate(
            req.params.customerId,
            { $inc: { points: challengeInformation.points } },
            {
              useFindAndModify: false,
            }
          );
          // Send notification for challenge completion
          await NotificationService.challengeCompleted(
            challengeInformation,
            req.params.customerId,
            challengeInformation.points
          );
        }
      }
    } else {
      console.log("here 5");
      newTrackChallenges.push({
        ...req.body.progress,
        challengeCompletionRate: rate,
        challengeCompleted: rate === 100 ? true : false,
        lastWorkoutCompletedAt:
          (req.body.progress.completedWorkouts || []).length > 0
            ? new Date()
            : null,
      });
    }

    console.log("here 6", newTrackChallenges);
    const response = await CustomerDetails.findByIdAndUpdate(
      customerDetails._id,
      {
        trackChallenges: newTrackChallenges,
        // Remember where the user left off so the dashboard can offer Continue
        lastPlayedChallenge: req.body.progress.challenge,
      },
      {
        useFindAndModify: false,
      }
    );
    return res.status(200).json({
      data: response,
      message: "updated",
    });
  } catch (err) {
    console.log("error", err);
    return res.status(400).json({
      err,
    });
  }
});

// @desc    post challenge progress from backend
// @route   post /api/customerDetails/track-challenge
const getChallengeProgress = asyncHandler(async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate([
      "customerDetails",
      "customerDetails.trackChallenges.challengeReview",
    ]);
    const customerDetails = user.customerDetails;
    const challenge = customerDetails.trackChallenges.find(
      (c) => c.challenge.toString() === req.params.challengeId
    );
    console.log(
      "yesta",
      req.user._id,
      user,
      customerDetails.trackChallenges,
      req.params.challengeId
    );
    return res.status(200).json({
      data: challenge,
      message: "Challenge tracking found",
    });
  } catch (err) {
    return res.status(400).json({
      err,
    });
  }
});

// @desc    replace free challenge
// @route   get /api/customerDetails/replace-free-challenge/:challengeId
const replaceFreeChallenge = asyncHandler(async (req, res, next) => {
  try {
    // heere challenge id represents the id of tthe challenge that needs to be replace with free challenge
    const user = await User.findById(req.user._id).populate({
      path: "customerDetails",
      populate: {
        path: "challenges",
        model: "Challenges",
      },
    });

    const customerDetails = user.customerDetails;

    // Accept either the full challenge object (what the browser sends) or a
    // bare id. Without this, a body of the wrong shape left `_id` undefined,
    // which pushed `undefined` into the challenges array — the user's free
    // challenge was removed, garbage stored in its place, and the endpoint
    // still answered 200 "Challenge replaced!".
    const requested = req.body.challenge;
    const requestedId =
      requested && typeof requested === "object" ? requested._id : requested;

    if (!requestedId || !mongoose.Types.ObjectId.isValid(requestedId)) {
      return res.status(400).json({ err: "A valid challenge id is required." });
    }

    const targetChallenge = await Challenges.findById(requestedId);
    if (!targetChallenge) {
      return res.status(404).json({ err: "Challenge not found." });
    }

    const checkIfUserAlreadyHasChallenge = customerDetails.challenges.findIndex(
      (c) => c && c._id.toString() === requestedId.toString()
    );
    // if user donest already have the challenge
    if (checkIfUserAlreadyHasChallenge < 0) {
      let updatedChallenges = [...customerDetails.challenges];
      let updatedChallengTrack = [...customerDetails.trackChallenges];
      // Null-safe: rows written before the input validation below could contain
      // a null where a challenge should be.
      const freeChallenge = customerDetails.challenges.find(
        (c) => c && (c.access || []).includes("FREE")
      );
      // first we replace the old free challenge with new one.
      if (freeChallenge) {
        // Determine all IDs to remove (old free challenge + its group siblings)
        let oldIdsToRemove = [freeChallenge._id.toString()];
        if (freeChallenge.intensityGroupId) {
          const oldSiblings = await Challenges.find({
            intensityGroupId: freeChallenge.intensityGroupId,
          }).select("_id");
          oldIdsToRemove = oldSiblings.map((s) => s._id.toString());
        }

        // Remove all old group challenges
        updatedChallenges = customerDetails.challenges.filter(
          (f) => f && !oldIdsToRemove.includes(f._id.toString())
        );

        // Remove track records for all old group challenges
        updatedChallengTrack = customerDetails.trackChallenges.filter(
          (f) => !oldIdsToRemove.includes(f.challenge.toString())
        );

        // Determine all IDs to add (new challenge + its group siblings)
        const newChallengeDoc = targetChallenge;
        let newIdsToAdd = [requestedId.toString()];
        if (newChallengeDoc && newChallengeDoc.intensityGroupId) {
          const newSiblings = await Challenges.find({
            intensityGroupId: newChallengeDoc.intensityGroupId,
          }).select("_id");
          newIdsToAdd = newSiblings.map((s) => s._id.toString());
        }

        for (const id of newIdsToAdd) {
          if (!updatedChallenges.some((c) => (c._id || c).toString() === id)) {
            updatedChallenges.push(id);
          }
        }

        user.customerDetails.challenges = updatedChallenges;
        user.customerDetails.trackChallenges = updatedChallengTrack;
        await user.customerDetails.save();
        return res.status(200).json({
          message: "Challenge replaced!",
        });
      } else {
        return res.status(400).json({
          err: "Unable to find free challenge in your details",
        });
      }
    } else {
      return res.status(400).json({
        err: "User already has a challenge",
      });
    }
  } catch (err) {
    next(err);
  }
});

// @desc    add free challenge
// @route   get /api/customerDetails/add-free-challenge/:challengeId
const addFreeChallenge = asyncHandler(async (req, res, next) => {
  try {
    // heere challenge id represents the id of tthe challenge that needs to be replace with free challenge
    const user = await User.findById(req.user._id).populate({
      path: "customerDetails",
      populate: {
        path: "challenges",
        model: "Challenges",
      },
    });

    const customerDetails = user.customerDetails;

    // Look up the full challenge to check for intensity group
    const challengeDoc = await Challenges.findById(req.body.challenge._id);

    // Resolve all IDs to add (includes siblings if intensity group)
    let idsToAdd = [req.body.challenge._id];
    if (challengeDoc && challengeDoc.intensityGroupId) {
      const siblings = await Challenges.find({
        intensityGroupId: challengeDoc.intensityGroupId,
      }).select("_id");
      idsToAdd = siblings.map((s) => s._id.toString());
    }

    // Check if user already owns any challenge from this group
    const alreadyOwnsGroup = idsToAdd.some((id) =>
      customerDetails.challenges.some((c) => c._id.toString() === id)
    );

    if (!alreadyOwnsGroup) {
      let updatedChallenges = [...customerDetails.challenges];
      for (const id of idsToAdd) {
        updatedChallenges.push(id);
      }

      user.customerDetails.challenges = updatedChallenges;
      await user.customerDetails.save();
      return res.status(200).json({
        message: "Challenge added!",
      });
    } else {
      return res.status(400).json({
        err: "User already has a challenge",
      });
    }
  } catch (err) {
    next(err);
  }
});

const getUserPoints = asyncHandler(async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    return res.status(200).json({
      points: user.points,
    });
  } catch (err) {
    next(err);
  }
});

const availUserPoints = asyncHandler(async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const pointsToRedeem = req.body.pointsToRedeem || user.points;

    // Validate minimum points
    if (pointsToRedeem < 100) {
      return res.status(400).json({
        success: false,
        message: "Minimum 100 points required to redeem",
      });
    }

    // Validate user has enough points
    if (user.points < pointsToRedeem) {
      return res.status(400).json({
        success: false,
        message: "Insufficient points balance",
      });
    }

    // Calculate discount (100 points = 1 EUR/USD)
    const discount = pointsToRedeem / 100;
    const remainingPoints = user.points - pointsToRedeem;

    // Update user points atomically
    await User.findByIdAndUpdate(
      req.user._id,
      { $inc: { points: -pointsToRedeem } },
      { useFindAndModify: false }
    );

    return res.status(200).json({
      success: true,
      pointsRedeemed: pointsToRedeem,
      discount: discount,
      remainingPoints: remainingPoints,
    });
  } catch (err) {
    next(err);
  }
});

// @desc    Get a presigned S3 URL for user photo upload (no DB record)
// @route   POST /api/customerDetails/photo-upload
// @access  Private
const getPhotoUploadUrl = asyncHandler(async (req, res) => {
  const { filename, mimeType } = req.body;

  if (!filename || !mimeType) {
    return res.status(400).json({ message: "filename and mimeType are required" });
  }

  if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) {
    return res
      .status(400)
      .json({ message: "Only image or video files are allowed" });
  }

  const ext = filename.split(".").pop();
  const s3Key = `user-photos/${uuidv4()}.${ext}`;
  const presignedUrl = await getPresignedPutUrl(s3Key, mimeType);
  const fileUrl = getCloudFrontUrl(s3Key);

  res.status(200).json({ presignedUrl, fileUrl, s3Key });
});

// @desc    Confirm a user photo/video upload completed; optimize it in place
// @route   POST /api/customerDetails/photo-upload/confirm
// @access  Private
const confirmPhotoUpload = asyncHandler(async (req, res) => {
  const { s3Key, mimeType } = req.body;

  if (!s3Key || !mimeType) {
    return res.status(400).json({ message: "s3Key and mimeType are required" });
  }

  // Only keys issued by photo-upload may be optimized through this endpoint
  if (!s3Key.startsWith("user-photos/") || s3Key.includes("..")) {
    return res.status(400).json({ message: "Invalid s3Key" });
  }

  const isVideo = mimeType.startsWith("video/");

  if (!isVideo && !imageOptimizationService.isOptimizableImage(mimeType)) {
    return res
      .status(200)
      .json({ optimized: false, message: "File type is not optimizable" });
  }

  let headResult;
  try {
    headResult = await headObject(s3Key);
  } catch (err) {
    return res.status(400).json({
      message: "File not found in S3. Upload may have failed or the pre-signed URL expired.",
    });
  }

  res.status(200).json({ optimized: true, message: "Optimization started" });

  if (isVideo) {
    // Fire-and-forget: same MediaConvert pipeline as the media manager, tracked
    // via UserVideoJob since these uploads have no MediaFiles record. The
    // poller copies the transcoded output over the same key, so the URL on the
    // post stays valid throughout.
    (async () => {
      let jobDoc;
      try {
        jobDoc = await UserVideoJob.create({
          user: req.user._id,
          s3Key,
          originalSize: headResult.ContentLength,
        });
        const jobId = await mediaConvertService.createTranscodeJob(
          s3Key,
          "user-photos",
          jobDoc._id.toString()
        );
        jobDoc.mediaConvertJobId = jobId;
        await jobDoc.save();
        console.log(`[MediaConvert] Started job ${jobId} for user video ${s3Key}`);
      } catch (err) {
        console.error(
          `[MediaConvert] Failed to start job for user video ${s3Key}:`,
          err.message
        );
        if (jobDoc) {
          jobDoc.status = "failed";
          await jobDoc.save().catch(() => {});
        }
      }
    })();
  } else {
    // Fire-and-forget: same in-place sharp optimization as the media manager
    imageOptimizationService
      .optimizeS3ImageInPlace(s3Key, mimeType)
      .catch((err) =>
        console.error(`[ImageOpt] User photo ${s3Key} failed:`, err.message)
      );
  }
});

// @desc    Record the user's last-played challenge (set on entering the
//          player, so the dashboard "Continue" sign appears without needing
//          saved workout progress)
// @route   PUT /api/customerDetails/last-played/:challengeId
// @access  Private
const setLastPlayedChallenge = asyncHandler(async (req, res) => {
  const { challengeId } = req.params;
  const user = await User.findById(req.user._id).populate("customerDetails");
  if (!user || !user.customerDetails) {
    return res.status(404).json({ message: "Customer details not found" });
  }

  // Only record challenges the user actually owns, so "Continue" stays
  // meaningful and isn't overwritten by previews of unowned challenges.
  const owns = (user.customerDetails.challenges || []).some(
    (c) => c.toString() === challengeId
  );
  if (!owns) {
    return res.status(200).json({ updated: false });
  }

  await CustomerDetails.findByIdAndUpdate(
    user.customerDetails._id,
    { lastPlayedChallenge: challengeId },
    { useFindAndModify: false }
  );
  res.status(200).json({ updated: true });
});

module.exports = {
  swapRecipe,
  createCustomer,
  getCustomerById,
  getAllCustomers,
  updateCustomer,
  getRecommendedChallenge,
  setFavouriteRecipe,
  unfavouriteRecipe,
  getAllFavouriteRecipes,
  updateChallengeProgress,
  getChallengeProgress,
  setLastPlayedChallenge,
  replaceFreeChallenge,
  addFreeChallenge,
  getUserPoints,
  availUserPoints,
  getPhotoUploadUrl,
  confirmPhotoUpload,
  addToShoppingCart,
  removeFromShoppingCart,
  getShoppingCart,
  getAllFavouriteChallenges,
  setFavouriteChallenge,
  unfavouriteChallenge,
};
