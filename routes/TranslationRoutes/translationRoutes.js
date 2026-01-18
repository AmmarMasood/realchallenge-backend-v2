const express = require("express");
const router = express.Router();
const { protect } = require("../../middlewares/authMiddleware");

const {
  getTranslationsByKey,
  getContentMissingTranslations,
  getContentNeedingTranslation,
  linkTranslations,
} = require("../../controllers/TranslationControllers/translationController");

// Get all translations by translation key
router.get("/:translationKey", protect, getTranslationsByKey);

// Get content missing translations for a specific language
router.get(
  "/missing/:contentType/:language",
  protect,
  getContentMissingTranslations
);

// Get content needing translation to a target language
router.get(
  "/needs-translation/:contentType/:targetLanguage",
  protect,
  getContentNeedingTranslation
);

// Link existing content as translations
router.post("/link", protect, linkTranslations);

module.exports = router;
