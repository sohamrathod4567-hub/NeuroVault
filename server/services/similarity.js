'use strict';

/**
 * Compute the cosine similarity between two equal-length numeric vectors.
 * Returns a value in [-1, 1]. Higher = more similar.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  // Single-pass — O(n), no extra allocations
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Rank notes by cosine similarity against a query embedding.
 * Skips notes with no stored embedding.
 *
 * @param {Array<{id, embedding: number[]|null, [key: string]: any}>} notes
 * @param {number[]} queryEmbedding
 * @param {object} options
 * @param {number} [options.topK=5]          — max results to return
 * @param {number} [options.threshold=0]     — min similarity to include
 * @returns {Array<{note, score: number}>}   — sorted descending
 */
function rankBySimilarity(notes, queryEmbedding, { topK = 5, threshold = 0 } = {}) {
  return notes
    .filter(n => Array.isArray(n.embedding) && n.embedding.length > 0)
    .map(n => ({
      note:  n,
      score: cosineSimilarity(queryEmbedding, n.embedding),
    }))
    .filter(r => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

module.exports = { cosineSimilarity, rankBySimilarity };
