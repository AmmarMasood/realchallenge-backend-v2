const express = require("express");
const router = express.Router();
const { protect, customer } = require("../../middlewares/authMiddleware");
const {
  markNotificationAsRead,
  getUserNotifications,
} = require("../../controllers/NotificationControllers/notificationController");

// Mark a notification as read
router.put("/read/:notificationId", protect, customer, markNotificationAsRead);

// Get a user's notifications
router.get("/", protect, customer, getUserNotifications);

module.exports = router;
