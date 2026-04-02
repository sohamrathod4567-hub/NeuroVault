'use strict';
const fetch = require('node-fetch');

/**
 * AI Provider service to handle communication with AI models.
 * Default is Pollinations.ai (free, mimics OpenAI API).
 */

async function chatCompletion({ messages, stream = false, temperature = 0.1, max_tokens = 1024 }) {
  const model = 'openai'; // Pollinations default
  const url = 'https://text.pollinations.ai/openai';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens,
        stream
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI Provider returned ${response.status}: ${errorText}`);
    }

    if (stream) {
      return response.body; // Return readable stream
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || 'No answer generated.';
  } catch (err) {
    console.error('[aiProvider] Chat extension failed:', err.message);
    throw err;
  }
}

module.exports = { chatCompletion };
