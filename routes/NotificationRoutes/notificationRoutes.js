const express = require("express");
const router = express.Router();
const { protect, customer, admin } = require("../../middlewares/authMiddleware");
const {
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUserNotifications,
  createNotificationAdmin,
} = require("../../controllers/NotificationControllers/notificationController");

// Mark a notification as read
router.put("/read/:notificationId", protect, customer, markNotificationAsRead);

// Mark all notifications as read
router.put("/read-all", protect, customer, markAllNotificationsAsRead);

// Get a user's notifications
router.get("/", protect, customer, getUserNotifications);

// Admin: Create a notification (broadcast or personal)
router.post("/create", protect, admin, createNotificationAdmin);

module.exports = router;
