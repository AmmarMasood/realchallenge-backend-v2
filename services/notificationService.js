/**
 * Notification Service
 *
 * Centralized service for creating and managing notifications.
 * All notification triggers should use this service for consistency.
 *
 * Usage:
 *   const NotificationService = require('../services/notificationService');
 *   await NotificationService.challengeCreated(challenge, senderId);
 */

const { Notification } = require("../models/Notifications/notificationModal");
const { notificationKeys } = require("../utils/notificationMessages");

/**
 * Helper to create a notification record
 * @private
 */
const createNotification = async ({
  type,
  titleKey,
  bodyKey,
  params = {},
  userGroup,
  sentBy,
  onClick,
  notificationType = "broadcast",
  notificationFor = null,
}) => {
  try {
    // Get keys from notificationKeys if type is provided
    let keys = { titleKey, bodyKey };
    if (type && notificationKeys[type]) {
      keys = notificationKeys[type];
    }

    const notification = await Notification.create({
      type: getNotificationType(type),
      titleKey: keys.titleKey,
      bodyKey: keys.bodyKey,
      params,
      userGroup,
      sentBy,
      onClick,
      notificationType,
      notificationFor,
    });

    return notification;
  } catch (error) {
    console.error("NotificationService: Failed to create notification", error);
    throw error;
  }
};

/**
 * Map service type names to model enum values
 */
const getNotificationType = (type) => {
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
    challengePurchased: "subscription",
    challengeCompleted: "achievement",
    challengeLive: "new-challenge",
    newComment: "new-article",
  };
  return typeMap[type] || "system";
};

/**
 * Create notifications for multiple users (batch)
 * @private
 */
const createBatchNotifications = async (userIds, notificationData) => {
  const notifications = await Promise.all(
    userIds.map((userId) =>
      createNotification({
        ...notificationData,
        notificationType: "personal",
        notificationFor: userId,
      })
    )
  );
  return notifications;
};

// ============================================
// PUBLIC NOTIFICATION METHODS
// ============================================

const NotificationService = {
  /**
   * Notify all users when a new challenge is created
   * @param {Object} challenge - The created challenge
   * @param {String} senderId - ID of the user who created it
   */
  async challengeCreated(challenge, senderId) {
    return createNotification({
      type: "newChallenge",
      params: { challengeName: challenge.name || challenge.title },
      userGroup: "customer",
      sentBy: senderId,
      onClick: `/challenge/${challenge.slug || challenge.name?.toLowerCase().replace(/\s+/g, "-")}/${challenge._id}`,
      notificationType: "broadcast",
    });
  },

  /**
   * Notify all users when a new recipe is created
   * @param {Object} recipe - The created recipe
   * @param {String} senderId - ID of the user who created it
   */
  async recipeCreated(recipe, senderId) {
    return createNotification({
      type: "newRecipe",
      params: { recipeName: recipe.name || recipe.title },
      userGroup: "customer",
      sentBy: senderId,
      onClick: `/recipe/${recipe.slug || recipe.name?.toLowerCase().replace(/\s+/g, "-")}/${recipe._id}`,
      notificationType: "broadcast",
    });
  },

  /**
   * Notify all users when a new blog/article is created
   * @param {Object} blog - The created blog
   * @param {String} senderId - ID of the user who created it
   */
  async blogCreated(blog, senderId) {
    return createNotification({
      type: "newArticle",
      params: { articleName: blog.name || blog.title },
      userGroup: "customer",
      sentBy: senderId,
      onClick: `/magazine/${blog.slug || blog.name?.toLowerCase().replace(/\s+/g, "-")}/${blog._id}`,
      notificationType: "broadcast",
    });
  },

  /**
   * Notify a user when they purchase a challenge
   * @param {Object} challenge - The purchased challenge
   * @param {String} userId - ID of the user who purchased
   */
  async challengePurchased(challenge, userId) {
    return createNotification({
      type: "challengePurchased",
      params: { challengeName: challenge.name || challenge.title },
      userGroup: "customer",
      sentBy: "system",
      onClick: `/challenge/${challenge.slug || challenge.name?.toLowerCase().replace(/\s+/g, "-")}/${challenge._id}`,
      notificationType: "personal",
      notificationFor: userId,
    });
  },

  /**
   * Notify a user when they complete a challenge and earn points
   * @param {Object} challenge - The completed challenge
   * @param {String} userId - ID of the user who completed
   * @param {Number} pointsEarned - Points earned
   */
  async challengeCompleted(challenge, userId, pointsEarned) {
    return createNotification({
      type: "challengeCompleted",
      params: {
        challengeName: challenge.name || challenge.title,
        pointsEarned: pointsEarned.toString(),
      },
      userGroup: "customer",
      sentBy: "system",
      onClick: `/user/dashboard`,
      notificationType: "personal",
      notificationFor: userId,
    });
  },

  /**
   * Notify all trainers of a challenge when it goes live
   * @param {Object} challenge - The challenge that went live
   * @param {Array} trainerIds - Array of trainer user IDs
   */
  async challengeLive(challenge, trainerIds) {
    if (!trainerIds || trainerIds.length === 0) return [];

    return createBatchNotifications(trainerIds, {
      type: "challengeLive",
      params: { challengeName: challenge.name || challenge.title },
      userGroup: "trainer",
      sentBy: "system",
      onClick: `/challenge/${challenge.slug || challenge.name?.toLowerCase().replace(/\s+/g, "-")}/${challenge._id}`,
    });
  },

  /**
   * Notify content creator when someone adds a comment
   * @param {String} contentType - 'challenge', 'recipe', or 'blog'
   * @param {Object} content - The content that was commented on
   * @param {String} creatorId - ID of the content creator
   * @param {String} commenterId - ID of the commenter
   * @param {String} commenterName - Name of the commenter
   */
  async commentAdded(contentType, content, creatorId, commenterId, commenterName) {
    // Don't notify if commenting on own content
    if (creatorId.toString() === commenterId.toString()) return null;

    const contentName = content.name || content.title;
    const urlMap = {
      challenge: `/challenge/${content.slug || contentName?.toLowerCase().replace(/\s+/g, "-")}/${content._id}`,
      recipe: `/recipe/${content.slug || contentName?.toLowerCase().replace(/\s+/g, "-")}/${content._id}`,
      blog: `/magazine/${content.slug || contentName?.toLowerCase().replace(/\s+/g, "-")}/${content._id}`,
    };

    return createNotification({
      type: "newComment",
      params: {
        commenterName,
        contentType,
        contentName,
      },
      userGroup: "all",
      sentBy: commenterId,
      onClick: urlMap[contentType] || "/",
      notificationType: "personal",
      notificationFor: creatorId,
    });
  },

  /**
   * Notify all trainers of a challenge when a comment is added
   * @param {Object} challenge - The challenge
   * @param {Array} trainerIds - Array of trainer IDs
   * @param {String} commenterId - ID of the commenter
   * @param {String} commenterName - Name of the commenter
   */
  async commentOnChallenge(challenge, trainerIds, commenterId, commenterName) {
    // Filter out the commenter from trainers
    const filteredTrainerIds = trainerIds.filter(
      (id) => id.toString() !== commenterId.toString()
    );

    if (filteredTrainerIds.length === 0) return [];

    return createBatchNotifications(filteredTrainerIds, {
      type: "newComment",
      params: {
        commenterName,
        contentType: "challenge",
        contentName: challenge.name || challenge.title,
      },
      userGroup: "trainer",
      sentBy: commenterId,
      onClick: `/challenge/${challenge.slug || challenge.name?.toLowerCase().replace(/\s+/g, "-")}/${challenge._id}`,
    });
  },

  /**
   * Send a custom system announcement to all users or a specific group
   * @param {String} message - The announcement message
   * @param {String} userGroup - Target group ('all', 'customer', 'trainer', etc.)
   * @param {String} senderId - ID of the sender
   * @param {String} onClick - Optional navigation link
   */
  async systemAnnouncement(message, userGroup = "all", senderId, onClick = null) {
    return createNotification({
      type: "systemAnnouncement",
      params: { message },
      userGroup,
      sentBy: senderId,
      onClick,
      notificationType: "broadcast",
    });
  },

  /**
   * Notify user about subscription status
   * @param {String} type - 'subscriptionCreated', 'subscriptionExpiring', 'subscriptionExpired'
   * @param {String} userId - User ID
   * @param {Object} params - Additional params like daysLeft
   */
  async subscriptionNotification(type, userId, params = {}) {
    return createNotification({
      type,
      params,
      userGroup: "customer",
      sentBy: "system",
      onClick: "/pricing",
      notificationType: "personal",
      notificationFor: userId,
    });
  },

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId) {
    const notifications = await Notification.find({
      $or: [
        { notificationType: "broadcast" },
        { notificationFor: userId },
      ],
    });

    return notifications.filter(
      (n) => !n.readBy.some((r) => r.user.toString() === userId.toString())
    ).length;
  },

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId) {
    const notifications = await Notification.find({
      $or: [
        { notificationType: "broadcast" },
        { notificationFor: userId },
      ],
      "readBy.user": { $ne: userId },
    });

    await Promise.all(
      notifications.map((n) => {
        n.readBy.push({ user: userId, readAt: new Date() });
        return n.save();
      })
    );

    return { markedAsRead: notifications.length };
  },
};

module.exports = NotificationService;
