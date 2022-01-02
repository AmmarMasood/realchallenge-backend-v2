const express = require("express");
const router = express.Router();

const {
  createTags,
  getTagById,
  deleteTag,
  getAllTags,
  updateTag,
} = require("../../controllers/ChallengeControllers/tagController");

router.get("/", getAllTags);
router.post("/create", createTags);
router.put("/:tagId", updateTag);
router.get("/:tagId", getTagById);
router.delete("/:tagId", deleteTag);

module.exports = router;
