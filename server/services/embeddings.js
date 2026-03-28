'use strict';
const fs = require('fs');

/**
 * We are using @xenova/transformers for completely free, local embeddings.
 * No API key needed, no usage limits.
 * Model: Xenova/all-MiniLM-L6-v2 (384 dimensions)
 */
let pipelinePromise = null;

async function getExtractor() {
  if (!pipelinePromise) {
    // Dynamically import the ESM module
    pipelinePromise = import('@xenova/transformers').then(async ({ pipeline, env }) => {
      // Configure for local use, downloading models to a specific cache dir
      env.cacheDir = './.cache/transformers';
      env.allowLocalModels = true;
      env.useBrowserCache = false;
      
      console.log('⏳ Loading local embedding model (Xenova/all-MiniLM-L6-v2)... this may take a moment on first run.');
      // Initialize the feature extraction pipeline
      const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        quantized: true // Use quantized model for smaller size/faster inference
      });
      console.log('✅ Local embedding model loaded ready!');
      return extractor;
    }).catch(err => {
      console.error('❌ Failed to load local embedding model:', err);
      pipelinePromise = null;
      throw err;
    });
  }
  return pipelinePromise;
}

/**
 * Generate a text embedding using local transformer model.
 * Returns a plain number[] (384-dimensional float array).
 *
 * @param {string} text  — the text to embed (title + content combined)
 * @returns {Promise<number[]>}
 */
async function generateEmbedding(text) {
  if (!text || !text.trim()) {
    return null;
  }

  try {
    const extractor = await getExtractor();
    
    // Generate embeddings
    const output = await extractor(text.trim(), { pooling: 'mean', normalize: true });
    
    // output.data is a Float32Array, convert to standard JS array
    return Array.from(output.data);
  } catch (err) {
    console.error('[embeddings] Generation failed:', err.message);
    throw err;
  }
}

/**
 * Build the input string to embed from a note's title + content.
 * Combining both gives richer semantic signal.
 *
 * @param {string} title
 * @param {string} content
 * @returns {string}
 */
function buildEmbeddingInput(title, content) {
  const parts = [];
  if (title  && title.trim())   parts.push(title.trim());
  if (content && content.trim()) parts.push(content.trim());
  return parts.join('\n\n');
}

module.exports = { generateEmbedding, buildEmbeddingInput };
