const express = require("express");
const router = express.Router();
const { protect, admin } = require("../../middlewares/authMiddleware");

const {
  getTranslationsByLanguage,
  getAllTranslationsAdmin,
  updateTranslation,
  getMissingTranslations,
  bulkUpdateTranslations,
} = require("../../controllers/UITranslationControllers/uiTranslationController");

// Admin routes (require authentication and admin role)
// IMPORTANT: These must come BEFORE /:language to avoid "admin" being matched as a language

// Get all translations with both languages for admin panel
router.get("/admin/all", protect, admin, getAllTranslationsAdmin);

// Get keys that are missing in either language
router.get("/admin/missing", protect, admin, getMissingTranslations);

// Bulk update translations
router.post("/admin/bulk", protect, admin, bulkUpdateTranslations);

// Public routes
// Get all translations for a specific language (returns nested JSON)
router.get("/:language", getTranslationsByLanguage);

// Update a single translation
// Note: :key(*) allows dots in the key parameter
router.put("/:language/:key(*)", protect, admin, updateTranslation);

module.exports = router;
