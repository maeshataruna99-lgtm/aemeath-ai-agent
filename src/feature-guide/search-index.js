'use strict';

// Deterministic local search for Aemeath Guidebook.
// Pure offline execution: no remote API or LLM dependency.
// Matches across titles, categories, keywords, syntax, purpose, and examples.

function normalizeString(str) {
  return String(str == null ? '' : str).trim().toLowerCase();
}

function tokenize(text) {
  const norm = normalizeString(text);
  if (!norm) return [];
  return norm.split(/[\s,./\\-_+:]+/).filter((token) => token.length > 0);
}

function createSearchIndex(entries) {
  const list = Array.isArray(entries) ? entries.slice() : [];

  function search(rawQuery) {
    const query = normalizeString(rawQuery);
    if (!query) return list.slice();

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return list.slice();

    const scored = [];

    for (const entry of list) {
      let score = 0;
      const titleLower = normalizeString(entry.title);
      const categoryLower = normalizeString(entry.category);
      const syntaxLower = normalizeString(entry.usage);
      const summaryLower = normalizeString(entry.summary);
      const purposeLower = normalizeString(entry.purpose);
      const searchTerms = Array.isArray(entry.searchTerms)
        ? entry.searchTerms.map(normalizeString)
        : [];
      const examples = Array.isArray(entry.examples)
        ? entry.examples.map(normalizeString)
        : [];

      // Exact title match gets highest score
      if (titleLower === query) score += 100;
      else if (titleLower.startsWith(query)) score += 60;
      else if (titleLower.includes(query)) score += 40;

      // Exact category match
      if (categoryLower === query) score += 50;
      else if (categoryLower.includes(query)) score += 25;

      // Direct syntax match
      if (syntaxLower.includes(query)) score += 35;

      // Search terms match
      for (const term of searchTerms) {
        if (term === query) score += 45;
        else if (term.includes(query)) score += 20;
      }

      // Token-based matching
      let allTokensMatched = true;
      for (const token of queryTokens) {
        const inTitle = titleLower.includes(token);
        const inCategory = categoryLower.includes(token);
        const inTerms = searchTerms.some((t) => t.includes(token));
        const inSyntax = syntaxLower.includes(token);
        const inSummary = summaryLower.includes(token);
        const inPurpose = purposeLower.includes(token);
        const inExamples = examples.some((ex) => ex.includes(token));

        if (inTitle) score += 15;
        if (inCategory) score += 10;
        if (inTerms) score += 12;
        if (inSyntax) score += 8;
        if (inSummary) score += 5;
        if (inPurpose) score += 4;
        if (inExamples) score += 6;

        if (!inTitle && !inCategory && !inTerms && !inSyntax && !inSummary && !inPurpose && !inExamples) {
          allTokensMatched = false;
        }
      }

      if (allTokensMatched) score += 20;

      if (score > 0) {
        scored.push({ entry: entry, score: score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map((item) => item.entry);
  }

  return {
    search: search,
    count: () => list.length,
  };
}

module.exports = {
  createSearchIndex: createSearchIndex,
  tokenize: tokenize,
};
