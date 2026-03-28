'use strict';
const express = require('express');
const db = require('../db');
const authenticate = require('../middleware/authenticate');
const { generateEmbedding, buildEmbeddingInput } = require('../services/embeddings');

const router = express.Router();

// All notes routes require authentication
router.use(authenticate);

/* ------------------------------------------------
   Helpers: JSON <-> embedding
   Embeddings are stored as JSON strings in SQLite
   and returned as number[] arrays to the client.
------------------------------------------------ */
function parseEmbedding(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function serializeEmbedding(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'string') {
    try { JSON.parse(value); return value; } catch { return null; }
  }
  return null;
}

function deserializeNote(note) {
  if (!note) return null;
  return { ...note, embedding: parseEmbedding(note.embedding) };
}

// GET /api/notes — all notes for the logged-in user
router.get('/', (req, res) => {
  try {
    const notes = db.prepare(
      'SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC'
    ).all(req.user.id);
    res.json(notes.map(deserializeNote));
  } catch (err) {
    console.error('[notes] GET / error:', err.message);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// GET /api/notes/graph — generate graph data for the vault
router.get('/graph', (req, res) => {
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
    console.error('[notes] GET /graph error:', err.message);
    res.status(500).json({ error: 'Failed to generate graph data' });
  }
});

// GET /api/notes/:id — single note
router.get('/:id', (req, res) => {
  try {
    const note = db.prepare(
      'SELECT * FROM notes WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json(deserializeNote(note));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch note' });
  }
});

// POST /api/notes — create a new note + auto-generate embedding
router.post('/', async (req, res) => {
  const { title, content, tag } = req.body;
  const rawTitle   = typeof title === 'string' ? title : '';
  const rawContent = typeof content === 'string' ? content : '';
  
  const noteTitle   = rawTitle.trim();
  const noteContent = rawContent.trim();
  const noteTag     = (tag || 'general').trim();

  if (!noteTitle && !noteContent) {
    return res.status(400).json({ error: 'Note must have a title or content (cannot be empty)' });
  }

  // Generate embedding from title + content
  let embeddingJson = null;
  try {
    const vector = await generateEmbedding(buildEmbeddingInput(noteTitle, noteContent));
    embeddingJson = serializeEmbedding(vector);
    console.log(`[embeddings] Generated ${vector ? vector.length : 0}-dim vector for new note`);
  } catch (embErr) {
    // Non-fatal: save note without embedding if OpenAI call fails
    console.warn('[embeddings] Could not generate embedding:', embErr.message);
  }

  try {
    const result = db.prepare(`
      INSERT INTO notes (user_id, title, content, embedding, tag)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.user.id, noteTitle, noteContent, embeddingJson, noteTag);

    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(deserializeNote(note));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// PUT /api/notes/:id — update a note + regenerate embedding if content changed
router.put('/:id', async (req, res) => {
  const { title, content, tag } = req.body;
  const { id } = req.params;

  try {
    const existing = db.prepare(
      'SELECT * FROM notes WHERE id = ? AND user_id = ?'
    ).get(id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Note not found' });

    const newTitle   = (title ?? existing.title).trim();
    const newContent = (content ?? existing.content).trim();
    const newTag     = (tag ?? existing.tag).trim();

    if (!newTitle && !newContent) {
      return res.status(400).json({ error: 'Note must have a title or content' });
    }

    // Re-generate embedding only when title or content actually changed
    const contentChanged =
      (newTitle !== existing.title.trim()) ||
      (newContent !== existing.content.trim());

    let embeddingJson = existing.embedding; // default: keep old embedding

    if (contentChanged) {
      try {
        const vector = await generateEmbedding(buildEmbeddingInput(newTitle, newContent));
        embeddingJson = serializeEmbedding(vector);
        console.log(`[embeddings] Regenerated ${vector ? vector.length : 0}-dim vector for note #${id}`);
      } catch (embErr) {
        console.warn('[embeddings] Could not regenerate embedding:', embErr.message);
        // Keep the existing embedding on failure
      }
    }

    db.prepare(`
      UPDATE notes SET
        title      = ?,
        content    = ?,
        embedding  = ?,
        tag        = ?,
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(newTitle, newContent, embeddingJson, newTag, id, req.user.id);

    const updated = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
    res.json(deserializeNote(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// DELETE /api/notes/:id
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  try {
    const existing = db.prepare(
      'SELECT * FROM notes WHERE id = ? AND user_id = ?'
    ).get(id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Note not found' });

    db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(id, req.user.id);
    res.json({ message: 'Note deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

module.exports = router;
