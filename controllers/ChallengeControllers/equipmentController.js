const generateToken = require("../../utils/generateToken");
const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const { roles } = require("../../utils/roles");
const bcrypt = require("bcryptjs");
const { tags } = require("../../models/ChallengeModels/tagsModel");
const { Equipment } = require("../../models/ChallengeModels/equipmentModel");

// @desc    Create equipment
// @route   POST /api/equipment/create
const createEquipment = asyncHandler(async (req, res, next) => {
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
    let newEquipment = new Equipment({
      name: req.body.name,
    });

    newEquipment = await newEquipment.save();
    if (!newEquipment) {
      return res.status(400).json("Equipment cannot be created!");
    } else {
      return res.status(201).json({
        mesage: "Equipment Created Successfully",
        newEquipment,
      });
    }
  } catch (err) {
    return next(err);
  }
});

// @desc    Get equipment by ID
// @route   GET /api/equipment/:equipmentId
const getEquipmentById = asyncHandler(async (req, res) => {
  const equipment = await Equipment.findById(req.params.equipmentId);

  if (equipment) {
    res.json(equipment);
  } else {
    res.status(404);
    throw new Error("Equipment not found");
  }
});

// @desc    Get All equipments
// @route   GET /api/equipment/
const getAllEquipments = asyncHandler(async (req, res) => {
  const equipments = await Equipment.find({});
  if (equipments) {
    res.status(200).json({
      equipments,
    });
  } else {
    res.status(404);
    throw new Error("Equipments Cannot be fetched");
  }
});

// @desc    Update Equipmet by Id
// @route   PUT /api/equipment/:equipmentId
const updateEquipment = asyncHandler(async (req, res, next) => {
  try {
    const update = req.body;
    const equipmentId = req.params.equipmentId;
    await Equipment.findByIdAndUpdate(equipmentId, update, {
      useFindAndModify: false,
    });
    const equipment = await Equipment.findById(equipmentId);
    res.status(200).json({
      data: equipment,
      message: "equipment has been updated",
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete equipment
// @route   Delete /api/equipment/:equipmentId
const deleteEquipment = asyncHandler(async (req, res) => {
  const equipment = await Equipment.findById(req.params.equipmentId);

  if (equipment) {
    await equipment.remove();
    res.json({ message: "equipment removed" });
  } else {
    res.status(404);
    throw new Error("equipment not found");
  }
});

module.exports = {
  createEquipment,
  getEquipmentById,
  getAllEquipments,
  updateEquipment,
  deleteEquipment,
};
