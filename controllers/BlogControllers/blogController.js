const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const { Blog } = require("../../models/BlogModels/blogModel");
const { hasRole, hasAnyRole } = require("../../middlewares/authMiddleware");
const { generateTranslationKey } = require("../../utils/translationKey");
const NotificationService = require("../../services/notificationService");

// @desc    Create Blog
// @route   POST /api/blog/create
// @access  Private ["Admin", "Blogger"]
const createBlog = asyncHandler(async (req, res, next) => {
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
    if (hasAnyRole(req.user, ["admin", "blogger"])) {
      // Generate or use provided translationKey
      const translationKey = req.body.translationKey ||
        generateTranslationKey("blog", req.body.title);

      let newBlog = new Blog({
        translationKey,
        language: req.body.language,
        title: req.body.title,
        user: req.user.id,
        featuredImage: req.body.featuredImage,
        paragraph: req.body.paragraph,
        category: req.body.category,
        videoLink: req.body.videoLink ? req.body.videoLink : "",
        isPublic: req.body.isPublic,
        allowComments: req.body.allowComments,
        allowReviews: req.body.allowReviews,
      });

      newBlog = await newBlog.save();
      if (!newBlog) {
        return res.status(400).json("Blog cannot be created!");
      } else {
        // Send notification to all users if sendNotification is true
        if (req.body.sendNotification) {
          await NotificationService.blogCreated(newBlog, req.user.id);
        }
        return res.status(201).json({
          message: "Blog Created Successfully",
          newBlog,
        });
      }
    } else {
      return res.status(400).json({
        message: "Not Authorized to create Blog Post.",
      });
    }
  } catch (err) {
    return next(err);
  }
});

// @desc    Get All Blogs
// @route   GET /api/blog/all
// @route   Public
const getAllBlogs = asyncHandler(async (req, res) => {
  let blogs;
  if (req.query.langauge && req.query.language.length > 0) {
    blogs = await Blog.find({
      isPublic: true,
      adminApproved: true,
      language: req.query.language,
    })
      .populate("user")
      .select("-hashPassword")
      .populate("category");
  } else {
    blogs = await Blog.find({
      isPublic: true,
      adminApproved: true,
    })
      .populate("user")
      .select("-hashPassword")
      .populate("category");
  }

  if (blogs) {
    res.status(200).json({
      blogs,
    });
  } else {
    res.status(404);
    throw new Error("Blogs Cannot be fetched");
  }
});

// @desc    Get All User Blogs
// @route   GET /api/blog/user/all
// @route   Private
const getAllUserBlogs = asyncHandler(async (req, res) => {
  let blogs;

  if (req.query.language && req.query.language.length > 0) {
    if (hasRole(req.user, "admin")) {
      blogs = await Blog.find({ language: req.query.language })
        .populate("user")
        .populate("alternativeLanguage")
        .select("-hashPassword")
        .populate("category");
    } else {
      blogs = await Blog.find({
        user: req.user.id,
        language: req.query.language,
      })
        .populate("user")
        .populate("alternativeLanguage")
        .select("-hashPassword")
        .populate("category");
    }
  } else {
    if (hasRole(req.user, "admin")) {
      blogs = await Blog.find()
        .populate("user")
        .populate("alternativeLanguage")
        .select("-hashPassword")
        .populate("category");
    } else {
      blogs = await Blog.find({ user: req.user.id })
        .populate("user")
        .populate("alternativeLanguage")
        .select("-hashPassword")
        .populate("category");
    }
  }

  if (blogs) {
    res.status(200).json({
      blogs,
    });
  } else {
    res.status(404);
    throw new Error("Blogs Cannot be fetched");
  }
});

// @desc    Get Blog by id
// @route   GET /api/blog/:blogId
// @route   Public
const getBlogById = asyncHandler(async (req, res) => {
  const blog = await Blog.findById(req.params.blogId)
    .populate("user")
    .select("-hashPassword")
    .populate("category");

  if (blog) {
    res.status(200).json({
      blog,
      message: "Blog retrieved successfully",
    });
  } else {
    res.status(404);
    throw new Error("Blog Not found");
  }
});

// @desc    Delete Blog
// @route   Delete /api/blog/:blogId
// @access  Private Admin & Blogger
const deleteBlog = asyncHandler(async (req, res) => {
  const blog = await Blog.findById(req.params.blogId);

  if (blog) {
    await blog.remove();
    res.json({ message: "Blog removed" });
  } else {
    res.status(404);
    throw new Error("Blog not found");
  }
});

// @desc    Update Product by Id
// @route   PUT /api/blog/:blogId
// @access  Admin & Blogger
const updateBlog = asyncHandler(async (req, res, next) => {
  try {
    const update = req.body;
    const blogId = req.params.blogId;
    if (hasRole(req.user, "admin")) {
      await Blog.findByIdAndUpdate(blogId, update, {
        useFindAndModify: false,
      });
    } else {
      await Blog.findByIdAndUpdate(
        blogId,
        { ...update, isPublic: false, adminApproved: false },
        {
          useFindAndModify: false,
        }
      );
    }

    const blog = await Blog.findById(blogId)
      .populate("user")
      .select("-passwordHash")
      .populate("category");

    res.status(200).json({
      message: "Blog has been updated",
      blog,
    });
  } catch (error) {
    next(error);
  }
});

const destroy = asyncHandler(async (req, res, next) => {
  try {
    await Blog.deleteMany({});

    console.log("deletesd");
    res.status(200).send({
      status: "Successfully removed all Blog files",
    });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @desc    Get all translations of a blog by translationKey
// @route   GET /api/blog/translations/:translationKey
// @access  Public
const getTranslationsByKey = asyncHandler(async (req, res) => {
  const { translationKey } = req.params;
  const { excludeLanguage } = req.query;

  let query = { translationKey };
  if (excludeLanguage) {
    query.language = { $ne: excludeLanguage };
  }

  const translations = await Blog.find(query)
    .select('_id title language translationKey')
    .lean();

  res.status(200).json({
    translations,
    count: translations.length,
  });
});

// @desc    Get a blog in a specific language by translationKey
// @route   GET /api/blog/translation/:translationKey/:language
// @access  Public
const getBlogByTranslationKey = asyncHandler(async (req, res) => {
  const { translationKey, language } = req.params;

  const blog = await Blog.findOne({ translationKey, language })
    .populate("user")
    .select("-hashPassword")
    .populate("category");

  if (blog) {
    res.status(200).json({
      blog,
      message: "Blog retrieved successfully",
    });
  } else {
    res.status(404);
    throw new Error("Blog not found for this language");
  }
});

module.exports = {
  createBlog,
  deleteBlog,
  updateBlog,
  getAllBlogs,
  getAllUserBlogs,
  getBlogById,
  destroy,
  getTranslationsByKey,
  getBlogByTranslationKey,
};
