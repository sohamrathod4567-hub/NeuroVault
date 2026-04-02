'use strict';
const express = require('express');
const authenticate = require('../middleware/authenticate');
const chatService = require('../services/chatService');
const { chatCompletion } = require('../services/aiProvider');

const router = express.Router();
router.use(authenticate);

/**
 * POST /api/chat
 * Body: { question: string, history: Array, topK?: number, stream?: boolean }
 * 
 * Supports streaming if 'stream' is true.
 */
router.post('/', async (req, res) => {
  const { question, history = [], topK = 5, stream = false } = req.body;

  try {
    const result = await chatService.processQuery({
      userId: req.user.id,
      question,
      history,
      topK,
      stream
    });

    if (stream) {
      // Set headers for SSE (Server-Sent Events)
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      // result is a readable stream from aiProvider
      result.on('data', chunk => {
        const text = chunk.toString();
        // Send raw text for the frontend to parse
        res.write(text);
      });

      result.on('end', () => {
        res.end();
      });

      result.on('error', (err) => {
        console.error('[chat-stream] Error:', err.message);
        res.end();
      });

    } else {
      // Regular JSON response
      res.json({ answer: result, model: 'Pollinations AI' });
    }

  } catch (err) {
    console.error('[chat] Route failed:', err.message);
    res.status(500).json({ error: err.message || 'Chat failed. Please try again.' });
  }
});

/**
 * POST /api/chat/action (Refactored)
 * Body: { action: 'expand'|'simplify'|'summarize', text: string }
 */
router.post('/action', async (req, res) => {
  const { action, text } = req.body;
  if (!text || !action) return res.status(400).json({ error: 'Text and action are required' });

  let prompt = '';
  switch(action) {
    case 'expand': prompt = `Expand on the following text, providing more detail and explanation. Format in markdown:\n\n${text}`; break;
    case 'simplify': prompt = `Simplify the following text so it is easier to understand. Format in markdown:\n\n${text}`; break;
    case 'summarize': prompt = `Summarize the following text briefly. Format in markdown:\n\n${text}`; break;
    default: return res.status(400).json({ error: 'Invalid action' });
  }

  try {
    const answer = await chatCompletion({ messages: [{ role: 'user', content: prompt }] });
    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: 'Action failed.' });
  }
});

/**
 * POST /api/chat/inline (Refactored)
 * Body: { action: 'improve'|'summarize'|'explain', text: string }
 */
router.post('/inline', async (req, res) => {
  const { action, text } = req.body;
  if (!text || !action) return res.status(400).json({ error: 'Text and action are required' });

  let prompt = '';
  switch(action) {
    case 'improve': prompt = `Improve the writing of the following text while keeping its original meaning and tone. Return ONLY the improved text, no conversational filler:\n\n${text}`; break;
    case 'summarize': prompt = `Summarize the following text concisely. Return ONLY the summary, no conversational filler:\n\n${text}`; break;
    case 'explain': prompt = `Explain the following text in simple terms:\n\n${text}`; break;
    default: return res.status(400).json({ error: 'Invalid action' });
  }

  try {
    const answer = await chatCompletion({ messages: [{ role: 'user', content: prompt }] });
    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: 'Inline AI failed.' });
  }
});

module.exports = router;

