const asyncHandler = require("express-async-handler");
const { Challenge } = require("../../models/ChallengeModels/challengesModel");
const { Exercise } = require("../../models/ChallengeModels/exerciseModel");
const { Recipe } = require("../../models/RecipeModels/recipeModel");
const { Blog } = require("../../models/BlogModels/blogModel");
const { getTypeFromKey } = require("../../utils/translationKey");
const { SUPPORTED_LANGUAGES } = require("../../utils/language");

// Map content types to their models
const modelMap = {
  challenge: Challenge,
  exercise: Exercise,
  recipe: Recipe,
  blog: Blog,
};

// @desc    Get all translations by translation key
// @route   GET /api/translations/:translationKey
// @access  Private
const getTranslationsByKey = asyncHandler(async (req, res) => {
  const { translationKey } = req.params;

  if (!translationKey) {
    res.status(400);
    throw new Error("Translation key is required");
  }

  // Determine the content type from the key
  const contentType = getTypeFromKey(translationKey);
  const Model = modelMap[contentType];

  if (!Model) {
    res.status(400);
    throw new Error(`Unknown content type: ${contentType}`);
  }

  // Find all content with this translation key
  const translations = await Model.find({ translationKey });

  // Build a map of language -> content
  const translationMap = {};
  SUPPORTED_LANGUAGES.forEach((lang) => {
    translationMap[lang] = null;
  });

  translations.forEach((item) => {
    if (item.language) {
      translationMap[item.language] = item;
    }
  });

  res.status(200).json({
    translationKey,
    contentType,
    translations: translationMap,
    availableLanguages: translations.map((t) => t.language),
    missingLanguages: SUPPORTED_LANGUAGES.filter(
      (lang) => !translationMap[lang]
    ),
  });
});

// @desc    Get content without translations for a specific language
// @route   GET /api/translations/missing/:contentType/:language
// @access  Private
const getContentMissingTranslations = asyncHandler(async (req, res) => {
  const { contentType, language } = req.params;

  const Model = modelMap[contentType];
  if (!Model) {
    res.status(400);
    throw new Error(`Unknown content type: ${contentType}`);
  }

  // Find all content in the requested language that has a translationKey
  const allContentInLanguage = await Model.find({
    language,
    translationKey: { $exists: true, $ne: null },
  });

  // Get all translation keys for this language
  const translationKeys = allContentInLanguage.map((c) => c.translationKey);

  // For each translation key, find which languages are missing
  const contentWithMissingTranslations = [];

  for (const content of allContentInLanguage) {
    const translations = await Model.find({
      translationKey: content.translationKey,
    }).select("language");

    const existingLanguages = translations.map((t) => t.language);
    const missingLanguages = SUPPORTED_LANGUAGES.filter(
      (lang) => !existingLanguages.includes(lang)
    );

    if (missingLanguages.length > 0) {
      contentWithMissingTranslations.push({
        content,
        existingLanguages,
        missingLanguages,
      });
    }
  }

  res.status(200).json({
    contentType,
    sourceLanguage: language,
    items: contentWithMissingTranslations,
    totalCount: contentWithMissingTranslations.length,
  });
});

// @desc    Get all content of a type that needs translation to a target language
// @route   GET /api/translations/needs-translation/:contentType/:targetLanguage
// @access  Private
const getContentNeedingTranslation = asyncHandler(async (req, res) => {
  const { contentType, targetLanguage } = req.params;
  const { sourceLanguage } = req.query;

  const Model = modelMap[contentType];
  if (!Model) {
    res.status(400);
    throw new Error(`Unknown content type: ${contentType}`);
  }

  // Find all content with translation keys
  const allContentWithKeys = await Model.find({
    translationKey: { $exists: true, $ne: null },
  });

  // Group by translation key
  const byTranslationKey = {};
  allContentWithKeys.forEach((content) => {
    if (!byTranslationKey[content.translationKey]) {
      byTranslationKey[content.translationKey] = {};
    }
    byTranslationKey[content.translationKey][content.language] = content;
  });

  // Find items that exist in source language but not in target language
  const needsTranslation = [];
  for (const [key, languages] of Object.entries(byTranslationKey)) {
    // If target language doesn't exist for this translation key
    if (!languages[targetLanguage]) {
      // If sourceLanguage is specified, only include if source exists
      if (sourceLanguage) {
        if (languages[sourceLanguage]) {
          needsTranslation.push({
            translationKey: key,
            sourceContent: languages[sourceLanguage],
            existingLanguages: Object.keys(languages),
          });
        }
      } else {
        // Include any content that doesn't have target language
        const firstAvailable = Object.values(languages)[0];
        needsTranslation.push({
          translationKey: key,
          sourceContent: firstAvailable,
          existingLanguages: Object.keys(languages),
        });
      }
    }
  }

  res.status(200).json({
    contentType,
    targetLanguage,
    sourceLanguage: sourceLanguage || "any",
    items: needsTranslation,
    totalCount: needsTranslation.length,
  });
});

// @desc    Link existing content as a translation
// @route   POST /api/translations/link
// @access  Private
const linkTranslations = asyncHandler(async (req, res) => {
  const { contentType, contentIds, translationKey } = req.body;

  if (!contentType || !contentIds || !translationKey) {
    res.status(400);
    throw new Error(
      "contentType, contentIds, and translationKey are required"
    );
  }

  const Model = modelMap[contentType];
  if (!Model) {
    res.status(400);
    throw new Error(`Unknown content type: ${contentType}`);
  }

  // Update all specified content to use the same translation key
  await Model.updateMany(
    { _id: { $in: contentIds } },
    { $set: { translationKey } }
  );

  // Fetch updated content
  const updatedContent = await Model.find({ _id: { $in: contentIds } });

  res.status(200).json({
    message: "Translations linked successfully",
    translationKey,
    linkedContent: updatedContent,
  });
});

module.exports = {
  getTranslationsByKey,
  getContentMissingTranslations,
  getContentNeedingTranslation,
  linkTranslations,
};
