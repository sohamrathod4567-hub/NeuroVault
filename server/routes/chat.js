'use strict';
const express = require('express');
const authenticate = require('../middleware/authenticate');
const chatService = require('../services/chatService');
const { chatCompletion } = require('../services/aiProvider');

const router = express.Router();
router.use(authenticate);

/**
 * POST /api/chat
 * Body: { question, history, topK?, stream? }
 *
 * When stream=true the backend parses Ollama's SSE chunks and forwards
 * ONLY the plain-text delta to the browser, so the client never sees JSON.
 */
router.post('/', async (req, res) => {
  const { question, history = [], topK = 5, stream = false } = req.body;

  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'Question is required' });
  }

  try {
    const result = await chatService.processQuery({
      userId: req.user.id,
      question,
      history,
      topK,
      stream,
    });

    /* ── Streaming path ─────────────────────────────────────────── */
    if (stream) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      // result is already a plain-text Readable (SSE parsed inside aiProvider)
      result.on('data', (chunk) => res.write(chunk));
      result.on('end', () => res.end());
      result.on('error', (err) => {
        console.error('[chat-stream] Error:', err.message);
        if (!res.writableEnded) {
          res.write('\n\n[Stream error. Please retry.]');
          res.end();
        }
      });

      return;
    }

    /* ── Non-streaming path ─────────────────────────────────────── */
    res.json({ answer: result });

  } catch (err) {
    console.error('[chat] Route error:', err.message);
    // Guard: don't try to set headers if we already started streaming
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Chat failed. Please try again.' });
    }
  }
});

/**
 * POST /api/chat/action
 * Body: { action: 'expand'|'simplify'|'summarize', text }
 */
router.post('/action', async (req, res) => {
  const { action, text } = req.body;
  if (!text || !action) return res.status(400).json({ error: 'Text and action are required' });

  const prompts = {
    expand:   `Expand on the following text, providing more detail and explanation. Format in markdown:\n\n${text}`,
    simplify: `Simplify the following text so it is easier to understand. Format in markdown:\n\n${text}`,
    summarize:`Summarize the following text briefly. Format in markdown:\n\n${text}`,
  };

  if (!prompts[action]) return res.status(400).json({ error: 'Invalid action' });

  try {
    const answer = await chatCompletion({ messages: [{ role: 'user', content: prompts[action] }] });
    res.json({ answer });
  } catch (err) {
    console.error('[chat/action] Error:', err);
    res.status(500).json({ error: err.message || 'AI is currently unavailable.' });
  }
});

/**
 * POST /api/chat/inline
 * Body: { action: 'improve'|'summarize'|'explain', text }
 */
router.post('/inline', async (req, res) => {
  const { action, text } = req.body;
  if (!text || !action) return res.status(400).json({ error: 'Text and action are required' });

  const prompts = {
    improve:  `Improve the writing of the following text while keeping its original meaning and tone. Return ONLY the improved text:\n\n${text}`,
    summarize:`Summarize the following text concisely. Return ONLY the summary:\n\n${text}`,
    explain:  `Explain the following text in simple terms:\n\n${text}`,
  };

  if (!prompts[action]) return res.status(400).json({ error: 'Invalid action' });

  try {
    const answer = await chatCompletion({ messages: [{ role: 'user', content: prompts[action] }] });
    res.json({ answer });
  } catch (err) {
    console.error('[chat/inline] Error:', err);
    res.status(500).json({ error: err.message || 'AI is currently unavailable.' });
  }
});

module.exports = router;
