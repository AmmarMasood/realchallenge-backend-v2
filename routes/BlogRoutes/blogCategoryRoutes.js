const express = require("express");
const router = express.Router();

const {
  protect,
  allowBlogRoutesAccess,
} = require("../../middlewares/authMiddleware");

const {
  createCategory,
  getAllCategories,
  deleteCategory,
  updateCategory,
} = require("../../controllers/BlogControllers/blogCategoryController");

router.get("/all", allowBlogRoutesAccess, getAllCategories);
router.post("/create", allowBlogRoutesAccess, createCategory);
router.delete("/:categoryId", allowBlogRoutesAccess, deleteCategory);
router.put("/:categoryId", allowBlogRoutesAccess, updateCategory);

module.exports = router;
