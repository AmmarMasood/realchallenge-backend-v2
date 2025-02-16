const {
  Notification,
} = require("../../models/Notifications/notificationModal");
const { User } = require("../../models/UserModels/userModel");

exports.createNotification = async (data) => {
  try {
    const { user, type, title, body, onClick, sentBy, userGroup } = data;
    const notification = await Notification.create({
      user,
      type,
      title,
      body,
      onClick,
      sentBy,
      userGroup,
    });

    return notification;
  } catch (error) {
    throw new Error(error.message);
  }
};

/**
 * Mark a notification as read
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<void>}
 */
exports.markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id; // Assuming you have user auth middleware

    const notification = await Notification.findById(notificationId);

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    // Check if user has already read this notification
    const alreadyRead = notification.readBy.some(
      (read) => read.user.toString() === userId.toString()
    );

    if (!alreadyRead) {
      // Add user to readBy array with current timestamp
      notification.readBy.push({
        user: userId,
        readAt: new Date(),
      });

      await notification.save();
    }

    res.json({ message: "Notification marked as read", notification });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Get notifications for a user
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<void>}
 */
exports.getUserNotifications = async (req, res) => {
  try {
    const userId = req.user.id; // Assuming you have a middleware that sets the req.user object
    let userCreationDate = await User.findById(userId).select("createdAt"); // Assuming you have a User model
    // Find all notifications for the user, only notificataion that were created for user after they were created
    let notifications = await Notification.find({
      $or: [
        { notificationType: "broadcast" },
        {
          notificationFor: userId,
          createdAt: { $gte: userCreationDate.createdAt },
        },
      ],
    }).sort({ createdAt: -1 });

    // at alreadyRead
    notifications = notifications.map((n) => {
      const read = n.readBy.some((r) => r.user.toString() === userId);
      return { ...n.toObject(), read };
    });

    const unreadNotifications = notifications.filter(
      (n) => !n.readBy.some((r) => r.user.toString() === userId)
    );

    res.json({
      notifications,
      unreadNotifications: unreadNotifications.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Delete a notification
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<void>}
 */
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findByIdAndDelete(id);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    if (notification.user.toString() !== req.user.id) {
      return res.status(403).json({
        message: "You are not authorized to delete this notification",
      });
    }
    res.json(notification);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
