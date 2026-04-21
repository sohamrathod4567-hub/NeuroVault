'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { generateEmbedding, buildEmbeddingInput } = require('../services/embeddings');

const router = express.Router();

async function seedWelcomeNotes(userId) {
  const notes = [
    {
      title: "Welcome to NeuroVault 🧠",
      content: "This is your AI-powered knowledge base. You can write notes here, upload PDF documents, and then use the **Ask AI** button to talk to your vault!\n\nTry asking it what NeuroVault can do.",
      tag: "general"
    },
    {
      title: "Project Ideas for Q3",
      content: "1. Build a multi-modal semantic search engine.\n2. Upgrade the frontend to 3D glassmorphism.\n3. Integrate local deep-learning inference.",
      tag: "idea"
    },
    {
      title: "How Semantic Search Works",
      content: "When you save a note or upload a PDF, we run the raw string text through a local Xenova Transformer model. This generates a dense high-dimensionality mathematical array called a vector embedding. When you search, we run cosine-similarity math against your prompt to find contextual matches instantly.",
      tag: "research"
    }
  ];

  for (const n of notes) {
    try {
      const vector = await generateEmbedding(buildEmbeddingInput(n.title, n.content));
      const embeddingStr = vector ? JSON.stringify(vector) : null;
      db.prepare(`
        INSERT INTO notes (user_id, title, content, embedding, tag)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, n.title, n.content, embeddingStr, n.tag);
    } catch (err) {
      console.error('[Auth] Failed to seed welcome note:', err.message);
    }
  }
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
    if (existingUser) {
      return res.status(400).json({ error: 'Email or username already in use' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)'
    ).run(username, email, hashedPassword);
    
    // Auto-seed starter notes (runs asynchronously, blocks res to ensure immediate availability)
    await seedWelcomeNotes(result.lastInsertRowid);

    const token = jwt.sign(
      { id: result.lastInsertRowid, username, email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user: { id: result.lastInsertRowid, username, email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValid = bcrypt.compareSync(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Update last_login timestamp
    db.prepare('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?').run(user.id);

    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ user: { id: decoded.id, username: decoded.username, email: decoded.email } });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// DELETE /api/auth/profile - Delete user account and all data (cascades)
const authenticate = require('../middleware/authenticate');
router.delete('/profile', authenticate, (req, res) => {
  try {
    const userId = req.user.id;
    // Notes are deleted automatically due to ON DELETE CASCADE
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    res.json({ message: 'Account and all data deleted successfully' });
  } catch (err) {
    console.error('[Auth] Account deletion error:', err.message);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router;
