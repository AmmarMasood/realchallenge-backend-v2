const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const { FaqCategory } = require("../../models/FaqModel/fagCategory");

// @desc    Create category
// @route   POST /api/faq/category
const createCategory = asyncHandler(async (req, res, next) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(500).json("Body fields cannot be empty.");
  }
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }
    console.log(req.body);
    let newCategory = new FaqCategory({
      name: req.body.name,
    });

    newCategory = await newCategory.save();
    if (!newCategory) {
      return res.status(400).json("Category cannot be created!");
    } else {
      return res.status(201).json({
        mesage: "Category Created Successfully",
        newCategory,
      });
    }
  } catch (err) {
    return next(err);
  }
});

// @desc    Get All categories
// @route   GET /api/faq/category/
const getAllCategory = asyncHandler(async (req, res) => {
  console.log("here");
  const categories = await FaqCategory.find({});
  if (categories) {
    res.status(200).json({
      categories,
    });
  } else {
    res.status(404);
    throw new Error("Categories Cannot be fetched");
  }
});

// @desc    Delete category
// @route   Delete /api/faq/category/:categoryId
const deleteCategory = asyncHandler(async (req, res) => {
  const category = await FaqCategory.findById(req.params.categoryId);

  if (category) {
    await category.remove();
    res.json({ message: "category removed" });
  } else {
    res.status(404);
    throw new Error("category not found");
  }
});

const updateCategory = asyncHandler(async (req, res) => {
  try {
    const update = req.body;
    const categoryId = req.params.categoryId;
    await FaqCategory.findByIdAndUpdate(categoryId, update, {
      useFindAndModify: false,
    });
    const category = await FaqCategory.findById(categoryId);
    res.status(200).json({
      data: category,
      message: "Category Type has been updated",
    });
  } catch (error) {
    next(error);
  }
});
module.exports = {
  createCategory,
  getAllCategory,
  deleteCategory,
  updateCategory,
};
