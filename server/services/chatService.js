'use strict';
const db = require('../db');
const { generateEmbedding } = require('./embeddings');
const { rankBySimilarity } = require('./similarity');
const { chatCompletion } = require('./aiProvider');

/**
 * Orchestrates the Chat & RAG logic.
 * Retrieval-Augmented Generation (RAG) Flow:
 * 1. User question comes in.
 * 2. Question is converted to a vector embedding.
 * 3. Most similar notes for the user are retrieved from SQLite.
 * 4. Context is built from notes and sent to AI with a custom system prompt.
 * 5. Returns final AI response.
 */

class ChatService {
  /**
   * Main chat entry point.
   * @param {Object} options
   * @param {number} options.userId       — Current authenticated user ID
   * @param {string} options.question     — User question
   * @param {Array}  options.history      — Chat history { role, content }
   * @param {number} options.topK         — Number of notes to retrieve
   * @param {boolean} options.stream      — Whether to stream the response
   */
  async processQuery({ userId, question, history = [], topK = 5, stream = false }) {
    if (!question || !question.trim()) {
      throw new Error('Question is required');
    }

    // 1. Embed the user question
    const queryEmbedding = await generateEmbedding(question.trim());
    if (!queryEmbedding) {
      throw new Error('Failed to embed question');
    }

    // 2. Retrieve relevant notes from database
    const rows = db.prepare(
      'SELECT id, title, content, tag, created_at, updated_at, embedding FROM notes WHERE user_id = ? AND embedding IS NOT NULL'
    ).all(userId);

    const notes = rows.map(n => ({
      ...n,
      embedding: (() => { try { return JSON.parse(n.embedding); } catch { return null; } })(),
    }));

    const ranked = rankBySimilarity(notes, queryEmbedding, {
      topK: Math.min(Math.max(1, parseInt(topK) || 5), 10),
      threshold: 0.1, // Minimum relevance threshold
    });

    // 3. Build AI Context and System Prompt
    const systemPrompt = this.buildSystemPrompt(ranked);

    // 4. Prepare message thread (History + Current Question)
    // We include the 5 most recent history items for context depth
    const recentHistory = history.slice(-5).map(h => ({
      role: h.role,
      content: h.content
    }));

    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: question.trim() }
    ];

    // 5. Call AI Completion
    return await chatCompletion({ messages, stream });
  }

  /**
   * Construct the RAG System Prompt.
   */
  buildSystemPrompt(rankedNotes) {
    if (rankedNotes.length === 0) {
      return `You are NeuroVault's AI assistant. The user has no searchable notes yet.
Help them by explaining how to add notes or improve their documentation to leverage AI better.
NEVER hallucinate facts; if you don't know, suggest they add relevant notes.`;
    }

    const context = rankedNotes.map((n, i) => {
      const title   = n.note.title   || 'Untitled';
      const content = n.note.content || '(no content)';
      const score   = n.score !== undefined ? ` [relevance: ${Math.round(n.score * 100)}%]` : '';
      return `--- Note ${i + 1}: "${title}"${score} ---\n${content}`;
    }).join('\n\n');

    return `You are NeuroVault's AI assistant. Answer the user's question ONLY using the provided context below.

CRITICAL RULES PREVENTING HALLUCINATIONS:
1. Answer ONLY using the provided context. Absolutely NO outside knowledge is permitted.
2. If the answer is not explicitly contained within the provided context, you MUST reply exactly with: "I couldn't find relevant information in your notes."
3. Do not infer, guess, or extrapolate beyond what is explicitly written in the notes.
4. Always cite the note title or number when providing information. Use the format [1], [2] corresponding to Note 1, Note 2 etc.
5. Provide a concise, helpful answer formatted in markdown.
6. Handle follow-up questions carefully by looking at current context and previous conversation.
7. At the very end of your response, you MUST provide exactly 3 follow-up questions the user could ask based on the context. Format them precisely like this:

---FOLLOWUPS---
1. [First follow-up question?]
2. [Second follow-up question?]
3. [Third follow-up question?]

=== PROVIDED CONTEXT (NOTES) ===
${context}
=== END OF CONTEXT ===`;
  }
}

module.exports = new ChatService();
