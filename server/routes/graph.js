'use strict';
const express = require('express');
const db = require('../db');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/notes/graph
 * Discovers wikilinks in note content and returns nodes/edges for the graph.
 */
router.get('/', (req, res) => {
  try {
    const userId = req.user.id;
    const notes = db.prepare('SELECT id, title, content, tag FROM notes WHERE user_id = ?').all(userId);

    // 1. Create Nodes
    const nodes = notes.map(n => ({
      id: String(n.id),
      title: n.title || 'Untitled',
      tag: n.tag || 'general'
    }));

    // 2. Discover Wikilinks (Edges)
    const links = [];
    const titleToId = new Map();
    notes.forEach(n => titleToId.set(n.title.toLowerCase().trim(), String(n.id)));

    notes.forEach(sourceNote => {
      const content = sourceNote.content || '';
      // Regex for [[Title]]
      const matches = content.match(/\[\[(.*?)\]\]/g);
      
      if (matches) {
        matches.forEach(m => {
          const targetTitle = m.slice(2, -2).trim().toLowerCase();
          const targetId = titleToId.get(targetTitle);
          
          if (targetId && targetId !== String(sourceNote.id)) {
            // Avoid duplicates
            if (!links.some(l => l.source === String(sourceNote.id) && l.target === targetId)) {
              links.push({
                source: String(sourceNote.id),
                target: targetId,
                type: 'wikilink'
              });
            }
          }
        });
      }
    });

    res.json({ nodes, links });
  } catch (err) {
    console.error('[graph] GET / error:', err.message);
    res.status(500).json({ error: 'Failed to generate knowledge graph data' });
  }
});

module.exports = router;
