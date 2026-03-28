'use strict';
const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const db = require('../db');
const authenticate = require('../middleware/authenticate');
const { generateEmbedding } = require('../services/embeddings');

const router = express.Router();
router.use(authenticate);

// Configure multer to store uploaded files in memory
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB limit
});

/**
 * Split text into overlapping chunks
 * @param {string} text 
 * @param {number} maxWords 
 * @param {number} overlapWords 
 * @returns {string[]}
 */
function chunkText(text, maxWords = 700, overlapWords = 100) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const chunks = [];
  
  if (words.length === 0) return chunks;
  
  let i = 0;
  while (i < words.length) {
    const end = Math.min(i + maxWords, words.length);
    const chunkWords = words.slice(i, end);
    chunks.push(chunkWords.join(' '));
    
    if (end === words.length) break;
    i += (maxWords - overlapWords);
  }
  
  return chunks;
}

/**
 * POST /api/documents/upload
 * Expects `multipart/form-data` with a `pdf` field
 */
router.post('/upload', upload.single('pdf'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded' });
  }

  const filename = req.file.originalname || 'Untitled Document';
  
  try {
    // 1. Extract text from PDF buffer
    const pdfData = await pdfParse(req.file.buffer);
    const rawText = pdfData.text || '';
    
    if (!rawText.trim()) {
      return res.status(400).json({ error: 'Could not extract text from the PDF. It might be scanned or empty.' });
    }

    // 2. Chunk the text
    const chunks = chunkText(rawText, 750, 50); // 750 words max, 50 word overlap
    
    // 3. Process chunks using a transaction for database consistency
    let processedCount = 0;
    
    // Generate all embeddings first to keep the SQLite transaction fast & atomic
    const chunksWithEmbeddings = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const title = `${filename.replace(/\.pdf$/i, '')} - Part ${i + 1}`;
      
      try {
        const embeddingArray = await generateEmbedding(title + '\n\n' + chunkText);
        chunksWithEmbeddings.push({
          title, 
          content: chunkText, 
          embedding: embeddingArray ? JSON.stringify(embeddingArray) : null
        });
      } catch (embErr) {
        console.error(`[documents] Failed to embed chunk ${i}:`, embErr.message);
        // Fallback: still save chunk so it's readable, even if it can't be semantically queried
        chunksWithEmbeddings.push({ title, content: chunkText, embedding: null });
      }
    }

    // Wrap insertions in an atomic database transaction
    const insertChunks = db.transaction((items) => {
      const stmt = db.prepare('INSERT INTO notes (user_id, title, content, tag, embedding) VALUES (?, ?, ?, ?, ?)');
      for (const item of items) {
        stmt.run(req.user.id, item.title, item.content, 'document', item.embedding);
        processedCount++;
      }
    });

    insertChunks(chunksWithEmbeddings);

    res.json({ 
      success: true, 
      message: `PDF processed successfully. Created ${processedCount} semantic chunks.`,
      chunks: processedCount
    });

  } catch (err) {
    console.error('[documents]', err);
    res.status(500).json({ error: 'Failed to process PDF' });
  }
});

module.exports = router;
