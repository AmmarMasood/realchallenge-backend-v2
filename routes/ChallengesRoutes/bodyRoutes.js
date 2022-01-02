const express = require("express");
const router = express.Router();

const {
  createBody,
  getBodyById,
  deleteBody,
  getAllBody,
  updateBody,
} = require("../../controllers/ChallengeControllers/bodyController");

router.get("/", getAllBody);
router.post("/create", createBody);
router.put("/:bodyId", updateBody);
router.get("/:bodyId", getBodyById);
router.delete("/:bodyId", deleteBody);

module.exports = router;
