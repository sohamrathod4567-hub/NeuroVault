'use strict';
const express = require('express');
const db = require('../db');
const authenticate = require('../middleware/authenticate');
const { generateEmbedding } = require('../services/embeddings');
const { rankBySimilarity } = require('../services/similarity');
const fetch = require('node-fetch');

const router = express.Router();
router.use(authenticate);

/**
 * Build the RAG system prompt.
 * Instructs the model to answer ONLY from the provided note context.
 */
function buildSystemPrompt(notes) {
  const context = notes.map((n, i) => {
    const title   = n.title   || 'Untitled';
    const content = n.content || '(no content)';
    const score   = n.similarity !== undefined ? ` [relevance: ${Math.round(n.similarity * 100)}%]` : '';
    return `--- Note ${i + 1}: "${title}"${score} ---\n${content}`;
  }).join('\n\n');

  return `You are NeuroVault's AI assistant. Answer the user's question ONLY using the provided context below.

CRITICAL RULES PREVENTING HALLUCINATIONS:
1. Answer ONLY using the provided context. Absolutely NO outside knowledge is permitted.
2. If the answer is not explicitly contained within the provided context, you MUST reply exactly with: "I couldn't find relevant information in your notes."
3. Do not infer, guess, or extrapolate beyond what is explicitly written in the notes.
4. Always cite the note title or number when providing information. Use the format [1], [2] corresponding to Note 1, Note 2 etc.
5. Provide a concise, helpful answer formatted in markdown.
6. At the very end of your response, you MUST provide exactly 3 follow-up questions the user could ask based on the context. Format them precisely like this:
---FOLLOWUPS---
1. [First follow-up question?]
2. [Second follow-up question?]
3. [Third follow-up question?]

=== PROVIDED CONTEXT (NOTES) ===
${context}
=== END OF CONTEXT ===`;
}

/**
 * POST /api/chat
 * Body: { question: string, topK?: number }
 */
router.post('/', async (req, res) => {
  const { question, topK = 5 } = req.body;

  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'Question is required' });
  }

  try {
    // 1. Embed the question
    const queryEmbedding = await generateEmbedding(question.trim());
    if (!queryEmbedding) {
      return res.status(500).json({ error: 'Failed to embed question' });
    }

    // 2. Retrieve relevant notes
    const rows = db.prepare(
      'SELECT id, title, content, tag, created_at, updated_at, embedding FROM notes WHERE user_id = ? AND embedding IS NOT NULL'
    ).all(req.user.id);

    const notes = rows.map(n => ({
      ...n,
      embedding: (() => { try { return JSON.parse(n.embedding); } catch { return null; } })(),
    }));

    const ranked = rankBySimilarity(notes, queryEmbedding, {
      topK: Math.min(Math.max(1, parseInt(topK) || 5), 10),
      threshold: 0,
    });

    // 3. Build context
    if (ranked.length === 0) {
      return res.json({
        answer: "I couldn't find any notes with embeddings to search. Please add some notes and make sure they are saved so embeddings can be generated.",
        sources: [],
      });
    }

    const sources = ranked.map(({ note, score }) => ({
      id:         note.id,
      title:      note.title,
      tag:        note.tag,
      similarity: parseFloat(score.toFixed(4)),
      preview:    (note.content || '').substring(0, 120),
    }));

    // Attach similarity to each note for the prompt
    const notesWithScore = ranked.map(({ note, score }) => ({ ...note, similarity: score }));

    // 4. Call Free Pollinations.ai API
    const systemPrompt = buildSystemPrompt(notesWithScore);
    
    const response = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai', 
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question.trim() }
        ],
        temperature: 0.1, 
        max_tokens: 1024,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Public AI API returned ${response.status}`);
    }

    const data = await response.json();
    const answer = data.choices[0]?.message?.content?.trim() || 'No answer generated.';

    // 5. Return answer + sources
    res.json({ answer, sources, model: 'Pollinations.ai Free Network' });

  } catch (err) {
    console.error('[chat]', err.message);
    res.status(500).json({ error: 'Chat failed. Please try again.' });
  }
});

/**
 * POST /api/chat/action
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
    const response = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai', 
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3, 
        max_tokens: 1024,
        stream: false
      })
    });
    const data = await response.json();
    const answer = data.choices[0]?.message?.content?.trim() || '';
    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: 'Action failed.' });
  }
});

/**
 * POST /api/chat/inline
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
    const response = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai', 
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2, 
        max_tokens: 1024,
        stream: false
      })
    });
    const data = await response.json();
    const answer = data.choices[0]?.message?.content?.trim() || '';
    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: 'Inline AI failed.' });
  }
});

module.exports = router;
