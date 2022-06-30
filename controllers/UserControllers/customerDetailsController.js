const asyncHandler = require("express-async-handler");
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
const {
  ChallengeGoals,
} = require("../../models/ChallengeModels/challengeGoalsModel");
const { IdentityStore } = require("aws-sdk");

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
  const user = await User.findById(req.params.customerId).populate({
    path: "customerDetails",
    populate: [
      {
        path: "challenges",
        populate: [
          {
            path: "trainers",
          },
          {
            path: "challengeGoals",
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
    let favRecipes = await user.customerDetails.favouriteRecipes;

    if (favRecipes && favRecipes.length > 0) {
      return res.status(200).json({
        message: "Favourite recipes fetched successfully",
        favRecipes,
      });
    } else {
      return res
        .status(400)
        .json({ message: "Have not favourited any recipes yet" });
    }
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
    const user = await User.findById(req.params.customerId).populate(
      "customerDetails"
    );
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

// @desc    Get Recommended challenges for User based on the Goals they set
//          by mappping to challengesGoals
// @route   GET /api/customerDetails/:customerId/recommendedChallenge
const getRecommendedChallenge = asyncHandler(async (req, res) => {
  const customer = await User.findById(req.params.customerId)
    .select("-passwordHash")
    .populate("customerDetails");
  const custGoals = await customer.customerDetails.goals;
  //goals []
  const challenges = await Challenges.find({}).populate("challengeGoals");

  let isFound = false;
  if (challenges && custGoals) {
    let recommendedchallenge = [];

    for (let chall of challenges) {
      const challGoals = chall.challengeGoals;
      console.log(chall);
      if (challGoals.length > 0) {
        for (let goal of custGoals) {
          for (let cg of challGoals) {
            if (goal === cg.name) {
              recommendedchallenge.push(chall);
              isFound = true;
              break;
            }
          }
          if (isFound) {
            isFound = false;
            break;
          }
        }
      }
    }

    if (recommendedchallenge.length > 0) {
      res.status(200).json({
        recommendedchallenge,
      });
    } else {
      res.status(404);
      throw new Error(
        "You haven't set you Goals yet.Please update your profile to view recommended Challenges"
      );
    }
  } else {
    res.status(404);
    throw new Error("Challenges/Goals not fetched");
  }
  // const challGoals = await challenges.challengeGoals;
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

// @desc    Recommend Weekly Diet based on calories
// @route  GET /api/customerDetails/recommendedWeeklyDiet/:customerId
const shuffle = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
};
const recommendedWeeklyDiet = asyncHandler(async (req, res, next) => {
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

    let caloriesPerDay_final = await customer.customerDetails.caloriesPerDay;
    let fatPercent = await customer.customerDetails.amountOfFat;
    let carbohydratePercent = await customer.customerDetails
      .amountOfCarbohydrate;
    let proteinPercent = await customer.customerDetails.amountOfProtein;
    const dietOptions = await customer.customerDetails.myDiet;
    const lateMeal = await customer.customerDetails.lateMeal;
    const supplements = await customer.customerDetails.supplementIntake;

    let fatPerDay_final = (fatPercent / 100) * caloriesPerDay_final;
    let carbohydratePerDay_final =
      (carbohydratePercent / 100) * caloriesPerDay_final;
    let proteinPerDay_final = (proteinPercent / 100) * caloriesPerDay_final;

    let weeklyDietPlan = [];
    let breakfastRecipes = [];
    let lunchRecipes = [];
    let dinnerRecipes = [];
    let snackRecipes = [];

    const recipes = await Recipe.find()
      .populate("ingredients.name")
      .populate({ path: "diet", model: "Diet", select: "name -_id" })
      .populate({ path: "mealTypes", model: "MealType", select: "name -_id" });

    let isFound = false;
    if (recipes) {
      for (let recipe of recipes) {
        for (let myDiet of dietOptions) {
          isFound = false;
          for (let diet of recipe.diet) {
            if (myDiet.name == diet.name) {
              isFound = true;
              break;
            }
          }
          if (!isFound) {
            break;
          }
        }
        if (isFound) {
          for (let meal of recipe.mealTypes) {
            if (meal.name == "breakfast") {
              breakfastRecipes.push(recipe);
            }
            if (meal.name == "lunch") {
              lunchRecipes.push(recipe);
            }
            if (meal.name == "dinner") {
              dinnerRecipes.push(recipe);
            }
            if (meal.name == "snack") {
              snackRecipes.push(recipe);
            }
          }
        }
      }

      for (let i = 1; i <= 7; i++) {
        let dayPlan = {};

        let caloriesPerDay = caloriesPerDay_final;
        let fatPerDay = fatPerDay_final;
        let carbohydratePerDay = carbohydratePerDay_final;
        let proteinPerDay = proteinPerDay_final;

        //add supplement meals
        let dayMealCount = 0;
        let extraMealCount = 0;
        let dayMeal = false;
        let extraMeal = false;
        let noMeal = false;
        if (supplements.supplementOption == "During the day") {
          dayMeal = true;
        } else if (supplements.supplementOption == "Add as an extra meal") {
          extraMeal = true;
        } else {
          noMeal = true;
        }
        if (supplements.supplementOption != "None") {
          for (let recipe of supplements.recipes) {
            caloriesPerDay -= recipe.kCalPerPerson;
            fatPerDay -= recipe.fat * 0.09;
            carbohydratePerDay -= recipe.carbohydrate * 0.04;
            proteinPerDay -= recipe.protein * 0.04;
            if (dayMeal) {
              dayMealCount++;
              if (dayMealCount == 1) {
                dayPlan.dayMeal1 = recipe;
              } else if (dayMealCount == 2) {
                dayPlan.dayMeal2 = recipe;
              } else if (dayMealCount == 3) {
                dayPlan.dayMeal3 = recipe;
              } else if (dayMealCount == 4) {
                dayPlan.dayMeal4 = recipe;
              }
            } else if (extraMeal) {
              extraMealCount++;
              if (extraMealCount == 1) {
                dayPlan.extraMeal1 = recipe;
              } else if (extraMealCount == 2) {
                dayPlan.extraMeal2 = recipe;
              } else if (extraMealCount == 3) {
                dayPlan.extraMeal3 = recipe;
              } else if (extraMealCount == 4) {
                dayPlan.extraMeal4 = recipe;
              }
            }
          }
        }

        let calories = caloriesPerDay;
        let fat = fatPerDay;
        let carbohydrate = carbohydratePerDay;
        let protein = proteinPerDay;
        let dayPlanPushed = false;

        for (let breakfast of breakfastRecipes) {
          if (
            breakfast.kCalPerPerson < caloriesPerDay / 4 &&
            breakfast.fat * 0.09 < fatPerDay / 4 &&
            breakfast.protein * 0.04 < proteinPerDay / 4 &&
            breakfast.carbohydrate * 0.04 < carbohydratePerDay / 4
          ) {
            dayPlan.breakfast = breakfast;
            calories -= breakfast.kCalPerPerson;
            fat -= breakfast.fat * 0.09;
            carbohydrate -= breakfast.carbohydrate * 0.04;
            protein -= breakfast.protein * 0.04;
            for (let lunch of lunchRecipes) {
              if (
                lunch.kCalPerPerson < caloriesPerDay / 4 &&
                lunch.fat * 0.09 < fatPerDay / 4 &&
                lunch.protein * 0.04 < proteinPerDay / 4 &&
                lunch.carbohydrate * 0.04 < carbohydratePerDay / 4 &&
                lunch._id != breakfast._id
              ) {
                dayPlan.lunch = lunch;
                calories -= lunch.kCalPerPerson;
                fat -= lunch.fat * 0.09;
                carbohydrate -= lunch.carbohydrate * 0.04;
                protein -= lunch.protein * 0.04;
                for (let dinner of dinnerRecipes) {
                  if (
                    dinner.kCalPerPerson < caloriesPerDay / 4 &&
                    dinner.fat * 0.09 < fatPerDay / 4 &&
                    dinner.protein * 0.04 < proteinPerDay / 4 &&
                    dinner.carbohydrate * 0.04 < carbohydratePerDay / 4 &&
                    dinner._id != lunch._id &&
                    dinner._id != breakfast._id
                  ) {
                    dayPlan.dinner = dinner;
                    calories -= dinner.kCalPerPerson;
                    fat -= dinner.fat * 0.09;
                    carbohydrate -= dinner.carbohydrate * 0.04;
                    protein -= dinner.protein * 0.04;
                    for (let snack of snackRecipes) {
                      if (
                        snack.kCalPerPerson < caloriesPerDay / 4 &&
                        snack.fat * 0.09 < fatPerDay / 4 &&
                        snack.protein * 0.04 < proteinPerDay / 4 &&
                        snack.carbohydrate * 0.04 < carbohydratePerDay / 4 &&
                        snack._id != lunch._id &&
                        snack._id != breakfast._id &&
                        snack._id != dinner._id
                      ) {
                        if (noMeal || extraMeal) {
                          if (dayPlan.snack1 == null) {
                            dayPlan.snack1 = snack;
                            calories -= snack.kCalPerPerson;
                            fat -= snack.fat * 0.09;
                            carbohydrate -= snack.carbohydrate * 0.04;
                            protein -= snack.protein * 0.04;
                          } else if (dayPlan.snack2 == null) {
                            dayPlan.snack2 = snack;
                            calories -= snack.kCalPerPerson;
                            fat -= snack.fat * 0.09;
                            carbohydrate -= snack.carbohydrate * 0.04;
                            protein -= snack.protein * 0.04;
                            if (!lateMeal && !dayPlanPushed) {
                              let finalDayPlan = JSON.parse(
                                JSON.stringify(dayPlan)
                              );
                              weeklyDietPlan.push(finalDayPlan);
                              dayPlanPushed = true;
                            }
                          } else if (lateMeal) {
                            dayPlan.lateMeal = snack;
                            calories -= snack.kCalPerPerson;
                            fat -= snack.fat * 0.09;
                            carbohydrate -= snack.carbohydrate * 0.04;
                            protein -= snack.protein * 0.04;
                            if (!dayPlanPushed) {
                              let finalDayPlan = JSON.parse(
                                JSON.stringify(dayPlan)
                              );
                              weeklyDietPlan.push(finalDayPlan);
                              dayPlanPushed = true;
                            }
                          }
                        } else {
                          if (lateMeal) {
                            dayPlan.lateMeal = snack;
                            calories -= snack.kCalPerPerson;
                            fat -= snack.fat * 0.09;
                            carbohydrate -= snack.carbohydrate * 0.04;
                            protein -= snack.protein * 0.04;
                            if (!dayPlanPushed) {
                              let finalDayPlan = JSON.parse(
                                JSON.stringify(dayPlan)
                              );
                              weeklyDietPlan.push(finalDayPlan);
                              dayPlanPushed = true;
                            }
                          } else {
                            if (!dayPlanPushed) {
                              let finalDayPlan = JSON.parse(
                                JSON.stringify(dayPlan)
                              );
                              weeklyDietPlan.push(finalDayPlan);
                              dayPlanPushed = true;
                            }
                          }
                        }
                      }
                      if (dayPlanPushed) break;
                    }
                    if (!dayPlanPushed) {
                      //snacks
                      if (noMeal || extraMeal) {
                        if (dayPlan.snack1) {
                          calories += dayPlan.snack1.kCalPerPerson;
                          fat += dayPlan.snack1.fat * 0.09;
                          carbohydrate += dayPlan.snack1.carbohydrate * 0.04;
                          protein += dayPlan.snack1.protein * 0.04;
                          dayPlan.snack1 = null;
                        }
                        if (dayPlan.snack2) {
                          calories += dayPlan.snack2.kCalPerPerson;
                          fat += dayPlan.snack2.fat * 0.09;
                          carbohydrate += dayPlan.snack2.carbohydrate * 0.04;
                          protein += dayPlan.snack2.protein * 0.04;
                          dayPlan.snack2 = null;
                        }
                      }
                      //dinner
                      dayPlan.dinner = null;
                      calories += dinner.kCalPerPerson;
                      fat += dinner.fat * 0.09;
                      carbohydrate += dinner.carbohydrate * 0.04;
                      protein += dinner.protein * 0.04;
                    }
                  }
                  if (dayPlanPushed) break;
                }
                if (!dayPlanPushed) {
                  dayPlan.lunch = null;
                  calories += lunch.kCalPerPerson;
                  fat += lunch.fat * 0.09;
                  carbohydrate += lunch.carbohydrate * 0.04;
                  protein += lunch.protein * 0.04;
                }
              }
              if (dayPlanPushed) break;
            }
            if (!dayPlanPushed) {
              dayPlan.breakfast = null;
              calories += breakfast.kCalPerPerson;
              fat += breakfast.fat * 0.09;
              carbohydrate += breakfast.carbohydrate * 0.04;
              protein += breakfast.protein * 0.04;
            }
          }
          if (dayPlanPushed) {
            break;
          }
        }
        shuffle(breakfastRecipes);
        shuffle(lunchRecipes);
        shuffle(dinnerRecipes);
        shuffle(snackRecipes);
      }

      res.status(200).json({
        weeklyDietPlan,
      });
    } else {
      res.status(404).json({
        message: "No recipes found",
      });
    }
  } catch (error) {
    next(error);
  }
});

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
        console.log("here 2");
        newTrackChallenges[challengeIndex] = {
          ...req.body.progress,
          challengeCompletionRate: rate,
          challengeCompleted: rate === 100 ? true : false,
          challengePointGained: areChallengePointGained,
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
            { points: user.points + challengeInformation.points },
            {
              useFindAndModify: false,
            }
          );
        }
      } else {
        console.log("here 3");
        newTrackChallenges.push({
          ...req.body.progress,
          challengeCompletionRate: rate,
          challengeCompleted: rate === 100 ? true : false,
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
            { points: user.points + challengeInformation.points },
            {
              useFindAndModify: false,
            }
          );
        }
      }
    } else {
      console.log("here 5");
      newTrackChallenges.push({
        ...req.body.progress,
        challengeCompletionRate: rate,
        challengeCompleted: rate === 100 ? true : false,
      });
    }

    console.log("here 6", newTrackChallenges);
    const response = await CustomerDetails.findByIdAndUpdate(
      customerDetails._id,
      { trackChallenges: newTrackChallenges },
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
    const checkIfUserAlreadyHasChallenge = customerDetails.challenges.findIndex(
      (c) => c._id.toString() === req.body.challenge._id
    );
    // if user donest already have the challenge
    if (checkIfUserAlreadyHasChallenge < 0) {
      let updatedChallenges = [...customerDetails.challenges];
      let updatedChallengTrack = [...customerDetails.trackChallenges];
      const freeChallenge = customerDetails.challenges.find((c) =>
        c.access.includes("FREE")
      );
      // first we replace the old free challenge with new one.
      if (freeChallenge) {
        updatedChallenges = customerDetails.challenges.filter(
          (f) => f._id.toString() !== freeChallenge._id.toString()
        );
        updatedChallenges.push(req.body.challenge);
        //now we remove any track record of the challenge the user might have

        const checkTrackChallengeHasData = customerDetails.trackChallenges.find(
          (f) => f.challenge.toString() === freeChallenge._id.toString()
        );
        if (checkTrackChallengeHasData) {
          updatedChallengTrack = customerDetails.trackChallenges.filter(
            (f) =>
              f.challenge.toString() !==
              checkTrackChallengeHasData.challenge.toString()
          );
        }
        // console.log("checkTrackChallengeHasData", checkTrackChallengeHasData);
        // console.log("freeChallenge", freeChallenge);
        // console.log("updatedChallenges", updatedChallenges);
        // console.log("updatedChallengTrack", updatedChallengTrack);
        user.customerDetails.challenges = updatedChallenges;
        user.customerDetails.trackChallenges = updatedChallengTrack;
        user.customerDetails.save();
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
    console.log("here 3");

    console.log("challngnkengeka", challenge);

    // return res.status(200).json({
    //   data: challenge,
    //   message: "Challenge tracking found",
    // });
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
    const checkIfUserAlreadyHasChallenge = customerDetails.challenges.findIndex(
      (c) => c._id.toString() === req.body.challenge._id
    );
    // if user donest already have the challenge
    if (checkIfUserAlreadyHasChallenge < 0) {
      let updatedChallenges = [...customerDetails.challenges];

      updatedChallenges.push(req.body.challenge);

      user.customerDetails.challenges = updatedChallenges;
      user.customerDetails.save();
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
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { points: 0 },
      {
        useFindAndModify: false,
      }
    );
    console.log(user);
    return res.status(200).json({
      points: 0,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = {
  swapRecipe,
  createCustomer,
  getCustomerById,
  getAllCustomers,
  updateCustomer,
  getRecommendedChallenge,
  recommendedWeeklyDiet,
  setFavouriteRecipe,
  unfavouriteRecipe,
  getAllFavouriteRecipes,
  updateChallengeProgress,
  getChallengeProgress,
  replaceFreeChallenge,
  addFreeChallenge,
  getUserPoints,
  availUserPoints,
};
