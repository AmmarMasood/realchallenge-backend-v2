// Central language configuration for the entire application
// To add a new language:
// 1. Add to SUPPORTED_LANGUAGES array below
// 2. Add translation file in frontend: src/locales/{language}.json

const SUPPORTED_LANGUAGES = ["english", "dutch"];
const DEFAULT_LANGUAGE = "english";

module.exports = {
  languages: SUPPORTED_LANGUAGES,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,

  // Helper to validate language
  isValidLanguage: (lang) => SUPPORTED_LANGUAGES.includes(lang),

  // Helper to get opposite language (for bilingual linking)
  getOppositeLanguage: (lang) => {
    if (lang === "english") return "dutch";
    if (lang === "dutch") return "english";
    return DEFAULT_LANGUAGE;
  },
};
