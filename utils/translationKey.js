// Translation Key Utility
// Generates unique keys to link content across languages

const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_") // Replace spaces with _
    .replace(/[^\w\-]+/g, "") // Remove non-word chars (except -)
    .replace(/\_\_+/g, "_") // Replace multiple _ with single _
    .replace(/^_+/, "") // Trim _ from start
    .replace(/_+$/, ""); // Trim _ from end
};

/**
 * Generate a translation key from title/name
 * Format: {type}_{slugified_title}_{timestamp}
 * Example: challenge_hiit_for_beginners_1704067200
 */
const generateTranslationKey = (type, title) => {
  const slug = slugify(title);
  const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
  return `${type}_${slug}_${timestamp}`;
};

/**
 * Extract content type from translation key
 */
const getTypeFromKey = (translationKey) => {
  if (!translationKey) return null;
  const parts = translationKey.split("_");
  return parts[0] || null;
};

module.exports = {
  slugify,
  generateTranslationKey,
  getTypeFromKey,
};
