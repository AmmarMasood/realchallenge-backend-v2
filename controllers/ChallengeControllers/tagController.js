const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const { roles } = require("../../utils/roles");
const bcrypt = require("bcryptjs");
const { Tags } = require("../../models/ChallengeModels/tagsModel");

// @desc    Get All tags
// @route   GET /api/tags/
// @access  Public
const createTags = asyncHandler(async (req, res, next) => {
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
    let newTag = new Tags({
      name: req.body.name,
      language: req.body.language,
    });

    newTag = await newTag.save();
    if (!newTag) {
      return res.status(400).json("Tag cannot be created!");
    } else {
      return res.status(201).json({
        mesage: "Tag Created Successfully",
        newTag,
      });
    }
  } catch (err) {
    return next(err);
  }
});

// @desc    Get tag by ID
// @route   GET /api/tags/:tagId
const getTagById = asyncHandler(async (req, res) => {
  const tag = await Tags.findById(req.params.tagId);

  if (tag) {
    res.json(tag);
  } else {
    res.status(404);
    throw new Error("Tag not found");
  }
});

// @desc    Get All tags
// @route   GET /api/tags/
const getAllTags = asyncHandler(async (req, res) => {
  let tags;
  if (req.query.language && req.query.language.length > 0) {
    tags = await Tags.find({ language: req.query.language });
  } else {
    tags = await Tags.find({});
  }
  if (tags) {
    res.status(200).json({
      tags,
    });
  } else {
    res.status(404);
    throw new Error("Tags Cannot be fetched");
  }
});

// @desc    Update Tag by Id
// @route   PUT /api/tag/:id
const updateTag = asyncHandler(async (req, res, next) => {
  try {
    const update = req.body;
    const tagId = req.params.tagId;
    await Tags.findByIdAndUpdate(tagId, update, {
      useFindAndModify: false,
    });
    const tag = await Tags.findById(tagId);
    res.status(200).json({
      data: tag,
      message: "Tag has been updated",
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete tag
// @route   Delete /api/tags/:tagId
const deleteTag = asyncHandler(async (req, res) => {
  const tag = await Tags.findById(req.params.tagId);

  if (tag) {
    await tag.remove();
    res.json({ message: "Tag removed" });
  } else {
    res.status(404);
    throw new Error("Tag not found");
  }
});

module.exports = { createTags, getTagById, getAllTags, updateTag, deleteTag };
