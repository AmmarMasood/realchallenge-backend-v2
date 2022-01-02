const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const { Category } = require("../../models/ShopModels/categoryModel");

// @desc    Create category
// @route   POST /api/shop/category/create
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
    let newCategory = new Category({
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
// @route   GET /api/shop/category/
const getAllCategory = asyncHandler(async (req, res) => {
  const categories = await Category.find({});
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
// @route   Delete /api/shop/category/:categoryId
const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.categoryId);

  if (category) {
    await category.remove();
    res.json({ message: "category removed" });
  } else {
    res.status(404);
    throw new Error("category not found");
  }
});

module.exports = {
  createCategory,
  getAllCategory,
  deleteCategory,
};
