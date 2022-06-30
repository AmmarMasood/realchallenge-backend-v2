const generateToken = require("../../utils/generateToken");
const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const { roles } = require("../../utils/roles");
const bcrypt = require("bcryptjs");
const { Body } = require("../../models/ChallengeModels/bodyModel");

const createBody = asyncHandler(async (req, res, next) => {
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
    let newBody = new Body({
      name: req.body.name,
      language: req.body.language,
    });

    newBody = await newBody.save();
    if (!newBody) {
      return res.status(400).json("Body cannot be created!");
    } else {
      return res.status(201).json({
        mesage: "Body Created Successfully",
        newBody,
      });
    }
  } catch (err) {
    return next(err);
  }
});

// @desc    Get body by ID
// @route   GET /api/body/:bodyId
const getBodyById = asyncHandler(async (req, res) => {
  const body = await Body.findById(req.params.bodyId);

  if (body) {
    res.json(body);
  } else {
    res.status(404);
    throw new Error("Body not found");
  }
});

// @desc    Get All body
// @route   GET /api/body/
const getAllBody = asyncHandler(async (req, res) => {
  let body;
  if (req.query.language && req.query.language > 0) {
    body = await Body.find({ language: req.query.language });
  } else {
    body = await Body.find({});
  }
  if (body) {
    res.status(200).json({
      body,
    });
  } else {
    res.status(404);
    throw new Error("Body Cannot be fetched");
  }
});

// @desc    Update Body by Id
// @route   PUT /api/body/:id
const updateBody = asyncHandler(async (req, res, next) => {
  try {
    const update = req.body;
    const bodyId = req.params.bodyId;
    await Body.findByIdAndUpdate(bodyId, update, {
      useFindAndModify: false,
    });
    const body = await Body.findById(bodyId);
    res.status(200).json({
      data: body,
      message: "Body has been updated",
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete body
// @route   Delete /api/body/:bodyId
const deleteBody = asyncHandler(async (req, res) => {
  const body = await Body.findById(req.params.bodyId);

  if (body) {
    await body.remove();
    res.json({ message: "Body removed" });
  } else {
    res.status(404);
    throw new Error("Body not found");
  }
});

module.exports = {
  createBody,
  getBodyById,
  getAllBody,
  updateBody,
  deleteBody,
};
