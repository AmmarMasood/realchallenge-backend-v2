/**
 * Migration Script: Import UI Translations from JSON files into MongoDB
 *
 * This script reads the english.json and dutch.json locale files,
 * flattens them to dot-notation keys, and imports them into MongoDB.
 *
 * Usage:
 *   node scripts/migrateTranslations.js
 *
 * Make sure to set the environment variables in .env before running:
 *   - MONGO_URI: MongoDB connection string
 */

const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

// Import the model
const {
  UITranslation,
} = require("../models/UITranslationModel/uiTranslationModel");

// Path to locale files (adjust if needed)
const LOCALES_PATH = path.join(
  __dirname,
  "../../realchallenge-frontend-v2/src/locales",
);

/**
 * Flatten a nested object to dot-notation keys
 * @param {Object} obj - The nested object to flatten
 * @param {String} prefix - Current key prefix
 * @returns {Object} - Flattened object with dot-notation keys
 */
function flattenObject(obj, prefix = "") {
  const result = {};

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (
        typeof obj[key] === "object" &&
        obj[key] !== null &&
        !Array.isArray(obj[key])
      ) {
        // Recurse for nested objects
        Object.assign(result, flattenObject(obj[key], newKey));
      } else {
        // Store the value (convert arrays to strings if needed)
        result[newKey] = Array.isArray(obj[key])
          ? JSON.stringify(obj[key])
          : obj[key];
      }
    }
  }

  return result;
}

/**
 * Load and flatten a locale JSON file
 * @param {String} language - Language name (english, dutch)
 * @returns {Object} - Flattened translations
 */
function loadLocaleFile(language) {
  const filePath = path.join(LOCALES_PATH, `${language}.json`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Locale file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf8");
  const json = JSON.parse(content);

  return flattenObject(json);
}

/**
 * Main migration function
 */
async function migrateTranslations() {
  console.log("Starting UI Translation Migration...\n");

  // Connect to MongoDB
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: "realChallengeProduction",
    });
    console.log("Connected to MongoDB (realChallengeProduction)\n");
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error.message);
    process.exit(1);
  }

  const languages = ["english", "dutch"];
  let totalImported = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (const language of languages) {
    console.log(`Processing ${language} translations...`);

    try {
      const translations = loadLocaleFile(language);
      const keys = Object.keys(translations);
      console.log(`  Found ${keys.length} translation keys`);

      for (const key of keys) {
        const value = translations[key];

        try {
          // Upsert: update if exists, insert if not
          const result = await UITranslation.findOneAndUpdate(
            { key, language },
            {
              key,
              language,
              value: String(value),
              updatedAt: new Date(),
            },
            {
              upsert: true,
              new: true,
              setDefaultsOnInsert: true,
            },
          );

          if (result.createdAt.getTime() === result.updatedAt.getTime()) {
            totalImported++;
          } else {
            totalUpdated++;
          }
        } catch (error) {
          console.error(`  Error importing key "${key}":`, error.message);
          totalErrors++;
        }
      }

      console.log(`  Completed ${language}\n`);
    } catch (error) {
      console.error(`Error processing ${language}:`, error.message);
    }
  }

  console.log("Migration Summary:");
  console.log(`  - New translations imported: ${totalImported}`);
  console.log(`  - Existing translations updated: ${totalUpdated}`);
  console.log(`  - Errors: ${totalErrors}`);

  // Verify counts
  const englishCount = await UITranslation.countDocuments({
    language: "english",
  });
  const dutchCount = await UITranslation.countDocuments({ language: "dutch" });
  console.log(`\nDatabase counts:`);
  console.log(`  - English: ${englishCount} keys`);
  console.log(`  - Dutch: ${dutchCount} keys`);

  // Disconnect
  await mongoose.disconnect();
  console.log("\nMigration complete!");
}

// Run the migration
migrateTranslations().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
