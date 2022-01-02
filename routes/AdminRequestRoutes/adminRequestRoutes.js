const express = require("express");
const router = express.Router();

const { protect } = require("../../middlewares/authMiddleware");

const {
  getAllRequests,
  updateRequest,
} = require("../../controllers/AdminRequestController/AdminRequestController");

router.get("/all", protect, getAllRequests);
router.put("/", protect, updateRequest);

module.exports = router;
