const asyncHandler = require("express-async-handler");
const {
  UITranslation,
} = require("../../models/UITranslationModel/uiTranslationModel");

/**
 * Unflatten dot-notation keys back to nested object
 * @param {Array} translations - Array of {key, value} objects
 * @returns {Object} - Nested object structure
 */
function unflattenTranslations(translations) {
  const result = {};

  for (const { key, value } of translations) {
    const keys = key.split(".");
    let current = result;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current)) {
        current[k] = {};
      }
      current = current[k];
    }

    current[keys[keys.length - 1]] = value;
  }

  return result;
}

// @desc    Get all translations for a language (public)
// @route   GET /api/ui-translations/:language
// @access  Public
const getTranslationsByLanguage = asyncHandler(async (req, res) => {
  const { language } = req.params;

  if (!["english", "dutch"].includes(language)) {
    res.status(400);
    throw new Error("Invalid language. Supported: english, dutch");
  }

  const translations = await UITranslation.find({ language })
    .select("key value")
    .lean();

  // Convert to nested object format for frontend compatibility
  const nested = unflattenTranslations(translations);

  res.status(200).json(nested);
});

// @desc    Get all translations with both languages (admin)
// @route   GET /api/ui-translations/admin/all
// @access  Private (Admin)
const getAllTranslationsAdmin = asyncHandler(async (req, res) => {
  // Get all unique keys
  const englishTranslations = await UITranslation.find({ language: "english" })
    .select("key value updatedAt updatedBy")
    .populate("updatedBy", "username")
    .lean();

  const dutchTranslations = await UITranslation.find({ language: "dutch" })
    .select("key value updatedAt updatedBy")
    .populate("updatedBy", "username")
    .lean();

  // Create maps for quick lookup
  const englishMap = new Map(englishTranslations.map((t) => [t.key, t]));
  const dutchMap = new Map(dutchTranslations.map((t) => [t.key, t]));

  // Get all unique keys
  const allKeys = new Set([...englishMap.keys(), ...dutchMap.keys()]);

  // Build result with both languages
  const result = [];
  for (const key of allKeys) {
    const english = englishMap.get(key);
    const dutch = dutchMap.get(key);

    result.push({
      key,
      english: english
        ? {
            value: english.value,
            updatedAt: english.updatedAt,
            updatedBy: english.updatedBy,
          }
        : null,
      dutch: dutch
        ? {
            value: dutch.value,
            updatedAt: dutch.updatedAt,
            updatedBy: dutch.updatedBy,
          }
        : null,
    });
  }

  // Sort by key
  result.sort((a, b) => a.key.localeCompare(b.key));

  res.status(200).json({
    translations: result,
    counts: {
      english: englishTranslations.length,
      dutch: dutchTranslations.length,
      total: allKeys.size,
    },
  });
});

// @desc    Update a translation
// @route   PUT /api/ui-translations/:language/:key
// @access  Private (Admin)
const updateTranslation = asyncHandler(async (req, res) => {
  const { language, key } = req.params;
  const { value } = req.body;

  if (!["english", "dutch"].includes(language)) {
    res.status(400);
    throw new Error("Invalid language. Supported: english, dutch");
  }

  if (value === undefined || value === null) {
    res.status(400);
    throw new Error("Value is required");
  }

  // Decode key (in case it was URL encoded)
  const decodedKey = decodeURIComponent(key);

  const translation = await UITranslation.findOneAndUpdate(
    { key: decodedKey, language },
    {
      value: String(value),
      updatedBy: req.user._id,
      updatedAt: new Date(),
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  res.status(200).json({
    message: "Translation updated successfully",
    translation: {
      key: translation.key,
      language: translation.language,
      value: translation.value,
      updatedAt: translation.updatedAt,
    },
  });
});

// @desc    Get keys missing in a language
// @route   GET /api/ui-translations/admin/missing
// @access  Private (Admin)
const getMissingTranslations = asyncHandler(async (req, res) => {
  const englishKeys = await UITranslation.find({ language: "english" })
    .select("key value")
    .lean();
  const dutchKeys = await UITranslation.find({ language: "dutch" })
    .select("key value")
    .lean();

  const englishSet = new Set(englishKeys.map((t) => t.key));
  const dutchSet = new Set(dutchKeys.map((t) => t.key));

  // Find keys missing in Dutch
  const missingInDutch = englishKeys
    .filter((t) => !dutchSet.has(t.key))
    .map((t) => ({
      key: t.key,
      englishValue: t.value,
    }));

  // Find keys missing in English
  const missingInEnglish = dutchKeys
    .filter((t) => !englishSet.has(t.key))
    .map((t) => ({
      key: t.key,
      dutchValue: t.value,
    }));

  res.status(200).json({
    missingInDutch,
    missingInEnglish,
    counts: {
      missingInDutch: missingInDutch.length,
      missingInEnglish: missingInEnglish.length,
    },
  });
});

// @desc    Bulk update translations
// @route   POST /api/ui-translations/admin/bulk
// @access  Private (Admin)
const bulkUpdateTranslations = asyncHandler(async (req, res) => {
  const { translations } = req.body;

  if (!Array.isArray(translations) || translations.length === 0) {
    res.status(400);
    throw new Error("Translations array is required");
  }

  const results = {
    updated: 0,
    created: 0,
    errors: [],
  };

  for (const item of translations) {
    const { key, language, value } = item;

    if (!key || !language || value === undefined) {
      results.errors.push({ key, error: "Missing required fields" });
      continue;
    }

    if (!["english", "dutch"].includes(language)) {
      results.errors.push({ key, error: "Invalid language" });
      continue;
    }

    try {
      const existing = await UITranslation.findOne({ key, language });

      await UITranslation.findOneAndUpdate(
        { key, language },
        {
          value: String(value),
          updatedBy: req.user._id,
          updatedAt: new Date(),
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );

      if (existing) {
        results.updated++;
      } else {
        results.created++;
      }
    } catch (error) {
      results.errors.push({ key, error: error.message });
    }
  }

  res.status(200).json({
    message: "Bulk update completed",
    results,
  });
});

module.exports = {
  getTranslationsByLanguage,
  getAllTranslationsAdmin,
  updateTranslation,
  getMissingTranslations,
  bulkUpdateTranslations,
};
