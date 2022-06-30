const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const { BlogCategory } = require("../../models/BlogModels/blogCategory");

// @desc    Create Blog category
// @route   POST /api/blog/category/create
// @access  Private ["Admin", "Blogger"]
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
    let newCategory = new BlogCategory({
      name: req.body.name,
      language: req.body.language,
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
// @route   GET /api/blog/category/
// @route   Public
const getAllCategories = asyncHandler(async (req, res) => {
  let categories;

  if (req.query.language && req.query.language.length > 0) {
    categories = await BlogCategory.find({ language: req.query.language });
  } else {
    categories = await BlogCategory.find({});
  }
  if (categories) {
    res.status(200).json({
      categories,
    });
  } else {
    res.status(404);
    throw new Error("Categories Cannot be fetched");
  }
});

// @desc    update category
// @route   put /api/blog/category/:categoryId
const updateCategory = asyncHandler(async (req, res) => {
  try {
    const update = req.body;
    const categoryId = req.params.categoryId;
    await BlogCategory.findByIdAndUpdate(categoryId, update, {
      useFindAndModify: false,
    });
    const category = await BlogCategory.findById(categoryId);
    res.status(200).json({
      data: category,
      message: "Category Type has been updated",
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete category
// @route   Delete /api/blog/category/:categoryId
const deleteCategory = asyncHandler(async (req, res) => {
  const category = await BlogCategory.findById(req.params.categoryId);

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
  getAllCategories,
  deleteCategory,
  updateCategory,
};
