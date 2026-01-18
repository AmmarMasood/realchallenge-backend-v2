const {
  Notification,
} = require("../../models/Notifications/notificationModal");
const { User } = require("../../models/UserModels/userModel");
const { createNotificationData } = require("../../utils/notificationMessages");

/**
 * Create a notification (internal use)
 * @param {Object} data - Notification data
 * @param {string} data.type - Notification type (from notificationMessages.js)
 * @param {string} data.notificationType - 'broadcast' or 'personal'
 * @param {Object} data.params - Dynamic parameters for translation interpolation
 * @param {string} data.userGroup - Target user group
 * @param {string} data.sentBy - Sender identifier
 * @param {string} data.onClick - Navigation path when clicked
 * @param {ObjectId} data.notificationFor - User ID (required for personal notifications)
 * @returns {Promise<Notification>}
 */
exports.createNotification = async (data) => {
  try {
    const {
      type,
      notificationType = "broadcast",
      params = {},
      userGroup,
      sentBy,
      onClick,
      notificationFor,
      titleKey,
      bodyKey,
    } = data;

    // Map notification type string to model enum
    const typeMap = {
      newChallenge: "new-challenge",
      newRecipe: "new-recipe",
      newArticle: "new-article",
      newOffer: "new-offer",
      subscription: "subscription",
      subscriptionCreated: "subscription",
      subscriptionExpiring: "subscription",
      subscriptionExpired: "subscription",
      nextWorkout: "next-workout",
      achievementUnlocked: "achievement",
      systemAnnouncement: "system",
    };

    // Get notification keys from helper or use provided keys
    let notificationData;
    if (titleKey && bodyKey) {
      // Direct keys provided (for admin custom notifications)
      notificationData = { titleKey, bodyKey, params };
    } else {
      // Use helper to get keys from type
      notificationData = createNotificationData(type, params);
    }

    const notification = await Notification.create({
      type: typeMap[type] || type,
      titleKey: notificationData.titleKey,
      bodyKey: notificationData.bodyKey,
      params: notificationData.params,
      onClick,
      sentBy,
      userGroup,
      notificationType,
      notificationFor,
    });

    return notification;
  } catch (error) {
    throw new Error(error.message);
  }
};

/**
 * Create notification via API (admin only)
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
exports.createNotificationAdmin = async (req, res) => {
  try {
    const {
      type,
      notificationType = "broadcast",
      params = {},
      userGroup,
      onClick,
      notificationFor,
      titleKey,
      bodyKey,
    } = req.body;

    const notification = await exports.createNotification({
      type,
      notificationType,
      params,
      userGroup,
      sentBy: req.user.id,
      onClick,
      notificationFor,
      titleKey,
      bodyKey,
    });

    res.status(201).json({
      message: "Notification created successfully",
      notification,
    });
  } catch (error) {
    console.error("Error creating notification:", error);
    res.status(500).json({ message: error.message });
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
 * Get notifications for a user with pagination
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<void>}
 */
exports.getUserNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const userCreationDate = await User.findById(userId).select("createdAt");

    // Build query for notifications
    const query = {
      $or: [
        { notificationType: "broadcast" },
        {
          notificationFor: userId,
          createdAt: { $gte: userCreationDate.createdAt },
        },
      ],
    };

    // Get total count for pagination
    const totalCount = await Notification.countDocuments(query);

    // Get paginated notifications
    let notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Add read status
    notifications = notifications.map((n) => {
      const read = n.readBy.some((r) => r.user.toString() === userId);
      return { ...n.toObject(), read };
    });

    // Count unread (from all notifications, not just this page)
    const allNotifications = await Notification.find(query);
    const unreadCount = allNotifications.filter(
      (n) => !n.readBy.some((r) => r.user.toString() === userId)
    ).length;

    res.json({
      notifications,
      unreadCount,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        hasMore: skip + notifications.length < totalCount,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Mark all notifications as read for a user
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<void>}
 */
exports.markAllNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const userCreationDate = await User.findById(userId).select("createdAt");

    // Find all unread notifications for the user
    const query = {
      $or: [
        { notificationType: "broadcast" },
        {
          notificationFor: userId,
          createdAt: { $gte: userCreationDate.createdAt },
        },
      ],
      "readBy.user": { $ne: userId },
    };

    const notifications = await Notification.find(query);

    // Mark all as read
    await Promise.all(
      notifications.map((n) => {
        n.readBy.push({ user: userId, readAt: new Date() });
        return n.save();
      })
    );

    res.json({
      message: "All notifications marked as read",
      markedCount: notifications.length,
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
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
