const express = require("express");
const router = express.Router();

const {
  createEquipment,
  getEquipmentById,
  getAllEquipments,
  updateEquipment,
  deleteEquipment,
} = require("../../controllers/ChallengeControllers/equipmentController");

router.post("/create", createEquipment);
router.get("/:equipmentId", getEquipmentById);
router.get("/", getAllEquipments);
router.put("/:equipmentId", updateEquipment);
router.delete("/:equipmentId", deleteEquipment);

module.exports = router;
