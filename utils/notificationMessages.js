/**
 * Notification Translation Keys
 *
 * These keys map to translations in the frontend locale files.
 * The frontend resolves these keys based on the user's selected language.
 *
 * Format: notifications.{type}_{title|body}
 * Params are passed separately and interpolated on the frontend.
 *
 * To add a new notification type:
 * 1. Add the keys here
 * 2. Add translations to frontend locale files (english.json, dutch.json)
 * 3. Add the trigger in NotificationService
 */

const notificationKeys = {
  // ============================================
  // CONTENT CREATION (Broadcast to all users)
  // ============================================

  newChallenge: {
    titleKey: "notifications.new_challenge_title",
    bodyKey: "notifications.new_challenge_body",
  },

  newRecipe: {
    titleKey: "notifications.new_recipe_title",
    bodyKey: "notifications.new_recipe_body",
  },

  newArticle: {
    titleKey: "notifications.new_article_title",
    bodyKey: "notifications.new_article_body",
  },

  // ============================================
  // CHALLENGE LIFECYCLE (Personal notifications)
  // ============================================

  challengePurchased: {
    titleKey: "notifications.challenge_purchased_title",
    bodyKey: "notifications.challenge_purchased_body",
  },

  challengeCompleted: {
    titleKey: "notifications.challenge_completed_title",
    bodyKey: "notifications.challenge_completed_body",
  },

  challengeLive: {
    titleKey: "notifications.challenge_live_title",
    bodyKey: "notifications.challenge_live_body",
  },

  // ============================================
  // COMMENTS & INTERACTIONS
  // ============================================

  newComment: {
    titleKey: "notifications.new_comment_title",
    bodyKey: "notifications.new_comment_body",
  },

  // ============================================
  // SUBSCRIPTION NOTIFICATIONS
  // ============================================

  subscriptionCreated: {
    titleKey: "notifications.subscription_created_title",
    bodyKey: "notifications.subscription_created_body",
  },

  subscriptionExpiring: {
    titleKey: "notifications.subscription_expiring_title",
    bodyKey: "notifications.subscription_expiring_body",
  },

  subscriptionExpired: {
    titleKey: "notifications.subscription_expired_title",
    bodyKey: "notifications.subscription_expired_body",
  },

  // ============================================
  // WORKOUT & PROGRESS
  // ============================================

  nextWorkout: {
    titleKey: "notifications.next_workout_title",
    bodyKey: "notifications.next_workout_body",
  },

  achievementUnlocked: {
    titleKey: "notifications.achievement_unlocked_title",
    bodyKey: "notifications.achievement_unlocked_body",
  },

  // ============================================
  // SYSTEM & OFFERS
  // ============================================

  systemAnnouncement: {
    titleKey: "notifications.system_announcement_title",
    bodyKey: "notifications.system_announcement_body",
  },

  newOffer: {
    titleKey: "notifications.new_offer_title",
    bodyKey: "notifications.new_offer_body",
  },
};

/**
 * Helper function to create a notification object
 * @param {string} type - Notification type (e.g., 'newChallenge', 'newRecipe')
 * @param {Object} params - Dynamic parameters for interpolation
 * @param {Object} options - Additional options (onClick, userGroup, etc.)
 * @returns {Object} Notification object ready for database
 */
const createNotificationData = (type, params = {}, options = {}) => {
  const keys = notificationKeys[type];
  if (!keys) {
    throw new Error(`Unknown notification type: ${type}`);
  }

  return {
    titleKey: keys.titleKey,
    bodyKey: keys.bodyKey,
    params,
    ...options,
  };
};

/**
 * Get all available notification types
 * Useful for admin UI dropdowns
 */
const getAvailableTypes = () => {
  return Object.keys(notificationKeys);
};

module.exports = {
  notificationKeys,
  createNotificationData,
  getAvailableTypes,
};
