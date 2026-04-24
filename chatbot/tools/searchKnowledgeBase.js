// chatbot/tools/searchKnowledgeBase.js
// ─────────────────────────────────────────────────────────────────────────────
// Searches the admin-managed Q&A Knowledge Base for entries relevant to
// the user's query. Only returns active entries. Results are fed to GPT
// which blends them with its own knowledge for a natural reply.
// ─────────────────────────────────────────────────────────────────────────────

const KnowledgeBase = require("../../models/KnowledgeBase");

async function searchKnowledgeBase({ query, category }, context) {
  const lang = context?.language || "en";
  if (!query?.trim()) {
    return { found: false, message: "No search query provided.", results: [] };
  }

  const searchQuery = { status: "active" };

  // ── Category filter (optional) ────────────────────────────────────────────
  if (category) {
    searchQuery.category = category;
  }

  // ── Text search across all multilingual fields + keywords ─────────────────
  // Split the query into meaningful words (>2 chars) for broader matching
  const words = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (words.length === 0) {
    return { found: false, message: "Query too short.", results: [] };
  }

  // Build OR conditions: full phrase match first, then individual words
  // This gives GPT the most relevant entries even with partial queries
  const regexConditions = [];

  // Full phrase match (highest relevance)
  const fullPhrase = query.trim();
  regexConditions.push(
    { "question.en": { $regex: fullPhrase, $options: "i" } },
    { "question.nl": { $regex: fullPhrase, $options: "i" } },
    { "answer.en":   { $regex: fullPhrase, $options: "i" } },
    { "answer.nl":   { $regex: fullPhrase, $options: "i" } },
    { keywords:      { $regex: fullPhrase, $options: "i" } }
  );

  // Individual word matches (broader coverage)
  words.forEach((word) => {
    regexConditions.push(
      { "question.en": { $regex: word, $options: "i" } },
      { "question.nl": { $regex: word, $options: "i" } },
      { keywords:      { $regex: word, $options: "i" } }
    );
  });

  searchQuery.$or = regexConditions;

  // ── Fetch top matches ─────────────────────────────────────────────────────
  const entries = await KnowledgeBase.find(searchQuery)
    .sort({ createdAt: -1 })
    .limit(4)
    .lean();

  if (!entries.length) {
    return {
      found:    false,
      message:  `No knowledge base entries found for "${query}".`,
      results:  [],
    };
  }

  return {
    found:   true,
    count:   entries.length,
    source:  "knowledge_base",
    preferredLanguage: lang, 
    results: entries.map((e) => ({
      category: e.category,
      question: {
        en: e.question?.en || "",
        nl: e.question?.nl || "",
      },
      answer: {
        en: e.answer?.en || "",
        nl: e.answer?.nl || "",
      },
       preferredAnswer: lang === "nl"   
        ? (e.answer?.nl || e.answer?.en || "")
        : (e.answer?.en || e.answer?.nl || ""),
      keywords: e.keywords || "",
    })),
  };
}

module.exports = { searchKnowledgeBase };