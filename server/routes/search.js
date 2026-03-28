'use strict';
const express = require('express');
const db = require('../db');
const authenticate = require('../middleware/authenticate');
const { generateEmbedding } = require('../services/embeddings');
const { rankBySimilarity } = require('../services/similarity');

const router = express.Router();

// All search routes require authentication
router.use(authenticate);

/**
 * POST /api/search
 * Body: { query: string, topK?: number, threshold?: number }
 *
 * 1. Embed the query with OpenAI
 * 2. Load all notes for this user that have a stored embedding
 * 3. Rank by cosine similarity
 * 4. Return top-K results with their similarity scores
 */
router.post('/', async (req, res) => {
  const { query, topK = 5, threshold = 0.0 } = req.body;

  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    // 1. Embed the query
    const queryEmbedding = await generateEmbedding(query.trim());
    if (!queryEmbedding) {
      return res.status(500).json({ error: 'Failed to generate query embedding' });
    }

    // 2. Fetch all notes with embeddings for this user
    const rows = db.prepare(
      'SELECT * FROM notes WHERE user_id = ? AND embedding IS NOT NULL'
    ).all(req.user.id);

    // Parse stored JSON embeddings into number[]
    const notes = rows.map(n => ({
      ...n,
      embedding: (() => {
        try { return JSON.parse(n.embedding); } catch { return null; }
      })(),
    }));

    // 3. Rank by cosine similarity
    const ranked = rankBySimilarity(notes, queryEmbedding, {
      topK: Math.min(Math.max(1, parseInt(topK) || 5), 20), // clamp 1-20
      threshold: parseFloat(threshold) || 0,
    });

    // 4. Return results — strip the raw embedding array to keep response lean
    const results = ranked.map(({ note, score }) => {
      const { embedding: _emb, ...noteWithoutEmb } = note;
      return {
        ...noteWithoutEmb,
        similarity: parseFloat(score.toFixed(4)),
      };
    });

    res.json({
      query,
      total_with_embeddings: notes.filter(n => Array.isArray(n.embedding)).length,
      results,
    });

  } catch (err) {
    console.error('[search]', err.message);

    // Give a user-friendly message for missing API key
    if (err.message.includes('OPENAI_API_KEY')) {
      return res.status(503).json({ error: err.message });
    }
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
