const express = require("express");
const router = express.Router();

const {
  protect,
  allowBlogRoutesAccess,
} = require("../../middlewares/authMiddleware");

const {
  createBlog,
  updateBlog,
  getAllBlogs,
  deleteBlog,
  getBlogById,
  getAllUserBlogs,
} = require("../../controllers/BlogControllers/blogController");

router.get("/all", getAllBlogs);
router.get("/user/all", protect, getAllUserBlogs);
router.get("/:blogId", getBlogById);
router.post("/create", allowBlogRoutesAccess, createBlog);
router.put("/:blogId", allowBlogRoutesAccess, protect, updateBlog);
router.delete("/:blogId", allowBlogRoutesAccess, deleteBlog);

module.exports = router;
