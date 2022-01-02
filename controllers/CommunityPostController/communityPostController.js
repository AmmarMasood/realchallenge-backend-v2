const asyncHandler = require("express-async-handler");
const { validationResult } = require("express-validator");
const { roles } = require("../../utils/roles");
const {
  CommunityPostModel,
} = require("../../models/CommunityPostModels/CommunityPostModel");
const { User } = require("../../models/UserModels/userModel");

// @route    POST /api/community-posts/create
// @desc     Create a Post
// @access   Private
const createPost = asyncHandler(async (req, res, next) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(500).json("Body fields cannot be empty.");
  }
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    console.log(req.user.role);
    const user = await User.findById(req.user.id).select("-passwordHash");

    console.log(user);
    const newPost = new CommunityPostModel({
      title: req.body.title,
      text: req.body.text,
      image: req.body.image ? req.body.image : "",
      username: user.username,
      avatar: user.avatar,
      user: req.user.id,
      type: req.body.type,
      url: req.body.url,
    });

    console.log(newPost);

    const post = await newPost.save();
    if (post) {
      return res.status(201).json({
        mesage: "Post Created Successfully",
        post,
      });
    } else {
      return res.status(400).json("Post cannot be created!");
    }
  } catch (err) {
    return next(err);
  }
});

// @desc    Get All Posts
// @route   GET /api/community-posts/all/?pageNumber
// @access  To All customers(Private)
const getAllPosts = asyncHandler(async (req, res) => {
  const postCount = 6;
  const page = Number(req.query.pageNumber) || 1;
  const count = await CommunityPostModel.countDocuments({});

  if (req.query.pageNumber) {
    const posts = await CommunityPostModel.find({})
      .populate("comments.user")
      .sort({ date: -1 })
      .limit(postCount)
      .skip(postCount * (page - 1));
    if (posts) {
      if (posts.length > 0) {
        res.status(200).json({
          currentPage: page,
          lastPage: Math.ceil(count / postCount),
          postCount: posts.length,
          posts,
        });
      } else {
        return res.status(200).json({ message: "No more posts" });
      }
    } else {
      res.status(404);
      throw new Error("Posts Cannot be fetched");
    }
  } else {
    const posts = await CommunityPostModel.find({});
    if (posts) {
      res.status(200).json({
        postCount: posts.length,
        posts,
      });
    } else {
      return res.status(200).json({ message: "No more posts" });
    }
  }
});

// @desc    Get Post by ID
// @route   GET /api/community-posts/:id
const getPostById = asyncHandler(async (req, res) => {
  console.log(req.user.role);
  const post = await CommunityPostModel.findById(req.params.id).populate(
    "user"
  );

  if (post) {
    res.json(post);
  } else {
    res.status(404);
    throw new Error("Post not found");
  }
});

// @desc    Update Post by Id
// @route   PUT /api/community-posts/:postId
const updatePost = asyncHandler(async (req, res, next) => {
  try {
    const update = req.body;
    const postId = req.params.id;
    await CommunityPostModel.findByIdAndUpdate(postId, update, {
      useFindAndModify: false,
    });
    const post = await CommunityPostModel.findById(postId);
    if (post) {
      res.status(200).json({
        data: post,
        message: "Post has been updated",
      });
    } else {
      res.status(400).json({
        message: "Post Cannnot be updated",
      });
    }
  } catch (error) {
    next(error);
  }
});

// @desc    Delete Post
// @route   Delete /api/community-posts/id
// @access  Private Admin / post Creator
const deletePost = asyncHandler(async (req, res) => {
  const post = await CommunityPostModel.findById(req.params.id);

  if (!post) {
    return res.status(401).json({ msg: "Post Not Found" });
  }

  // check if post belong to that user
  if (post.user.toString() !== req.user.id && req.user.role !== "admin") {
    return res
      .status(401)
      .json({ msg: "User Not Authorized to remove the post" });
  }
  await post.remove();
  return res.json({ msg: "Post removed" });
});

// @route    PUT api/community-posts/like/:id
// @desc     Like a Post
// @access   Private
const likePost = asyncHandler(async (req, res) => {
  try {
    const post = await CommunityPostModel.findById(req.params.id);

    // check if post already being liked by user
    if (
      post.likes.filter((like) => like.user.toString() === req.user.id).length >
      0
    ) {
      return res.status(400).json({ msg: "Post Already Liked" });
    }

    post.likes.unshift({ user: req.user.id });

    await post.save();

    res.status(200).json(post.likes);
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Server Error");
  }
});

// @route    PUT api/community-posts/unlike/:id
// @desc     Unlike a Post
// @access   Private
const unlikePost = asyncHandler(async (req, res) => {
  try {
    const post = await CommunityPostModel.findById(req.params.id);

    // check if post already being liked by user
    if (
      post.likes.filter((like) => like.user.toString() === req.user.id)
        .length === 0
    ) {
      return res.status(400).json({ msg: "Post has not yet been liked" });
    }

    // Get remove index
    const removeIndex = post.likes
      .map((like) => like.user.toString())
      .indexOf(req.user.id);

    post.likes.splice(removeIndex, 1);

    await post.save();

    res.json(post.likes);
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Server Error");
  }
});

// @route    POST api/posts/community-posts/:id
// @desc     Comment on a Post
// @access   Private
const commentOnPost = asyncHandler(async (req, res) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(500).json("Body fields cannot be empty.");
  }
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    const user = await User.findById(req.user.id).select("-passwordHash");
    const post = await CommunityPostModel.findById(req.params.id);

    // console.log(user.firstName);
    if (post) {
      const newComment = {
        text: req.body.text,
        username: user.username,
        avatar: user.avatarLink,
        user: req.user.id,
      };
      console.log(newComment);

      post.comments.unshift(newComment);
      await post.save();
      const newPost = await CommunityPostModel.findById(req.params.id).populate(
        "comments.user"
      );
      res.status(200).json(newPost.comments);
    } else {
      return res.status(400).json({ message: "Post Not found" });
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// @route    DELETE api/community-posts/comment/:id/:comment_id
// @desc     Delete Comment on a Post
// @access   Private
const deleteCommentOnPost = asyncHandler(async (req, res) => {
  try {
    const post = await CommunityPostModel.findById(req.params.id);

    // Pull out comment
    const comment = post.comments.find(
      (comment) => comment.id === req.params.comment_id
    );

    // make sure if comment exist
    if (!comment) {
      return res.status(404).json({ msg: "Comment does not exist" });
    }

    // Check if user
    console.log(comment);
    if (comment.user.toString() !== req.user.id) {
      return res.status(401).json({ msg: "User not authorized" });
    }

    // get remove Index
    const removeIndex = post.comments
      .map((comment) => comment.user.toString())
      .indexOf(req.user.id);

    post.comments.splice(removeIndex, 1);

    await post.save();

    res.json(post.comments);
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Server Error");
  }
});

const grantAccess = function (action, resource) {
  return async (req, res, next) => {
    try {
      // console.log("here");
      // console.log("Access Granted", req.user.role);
      // console.log(resource);
      const permission = roles.can(req.user.role)[action](resource);
      if (!permission.granted) {
        return res.status(401).json({
          error: "You don't have enough permission to perform this action",
        });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  createPost,
  getAllPosts,
  getPostById,
  deletePost,
  updatePost,
  likePost,
  unlikePost,
  commentOnPost,
  deleteCommentOnPost,
  grantAccess,
};
