'use strict';
require('dotenv').config();
const fetch = require('node-fetch');

/**
 * NeuroVault AI Provider
 *
 * Tries providers in order until one works:
 *  1. Ollama  (local, no key needed)
 *  2. OpenRouter (OPEN_ROUTER_API_KEY — free tier available)
 *  3. Gemini  (GEMINI_API_KEY  — free tier at aistudio.google.com)
 *  4. Groq    (GROQ_API_KEY    — free tier at console.groq.com)
 *  5. OpenAI  (OPENAI_API_KEY  — paid)
 */

const TIMEOUT_MS = 30000;

/* ── Helpers ────────────────────────────────────────────────── */
function fetchWithTimeout(url, options) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

/** Parse an SSE stream and return a Node Readable that emits plain text chunks */
function sseToTextStream(rawStream) {
  const { Readable } = require('stream');
  const out = new Readable({ read() {} });

  let buffer = '';
  rawStream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      const jsonStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
      try {
        const parsed = JSON.parse(jsonStr);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (delta) out.push(delta);
      } catch { /* ignore non-JSON lines */ }
    }
  });

  rawStream.on('end', () => {
    if (buffer.trim() && buffer.trim() !== 'data: [DONE]') {
      const jsonStr = buffer.trim().startsWith('data: ') ? buffer.trim().slice(6) : buffer.trim();
      try {
        const parsed = JSON.parse(jsonStr);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (delta) out.push(delta);
      } catch { /* ignore */ }
    }
    out.push(null); // EOF
  });

  rawStream.on('error', (err) => out.destroy(err));
  return out;
}

/* ── Provider: Ollama (local) ──────────────────────────────── */
async function callOllama({ messages, stream, max_tokens }) {
  const base = process.env.OLLAMA_URL || 'http://localhost:11434/v1';
  const res = await fetchWithTimeout(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'llama3',
      messages, max_tokens, temperature: 0.2, stream
    })
  });
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  if (stream) return sseToTextStream(res.body);
  const data = await res.json();
  return data.choices[0]?.message?.content?.trim() || '';
}

/* ── Provider: OpenRouter ──────────────────────────────────── */
async function callOpenRouter({ messages, stream, max_tokens }) {
  const apiKey = process.env.OPEN_ROUTER_API_KEY;
  if (!apiKey) throw new Error('NO_KEY');

  // Models to try in order (all free-tier or zero-cost)
  const models = [
    'openai/gpt-oss-20b:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemma-3-4b-it:free',
    'nousresearch/hermes-3-llama-3.1-405b:free',
  ];

  for (const model of models) {
    try {
      const res = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'NeuroVault',
        },
        body: JSON.stringify({ model, messages, max_tokens, temperature: 0.2, stream })
      });

      if (!res.ok) {
        let errMsg = `Status ${res.status}`;
        try { const errObj = await res.json(); errMsg = errObj.error?.message || errMsg; } catch {}
        // Privacy-restrictions error — skip to next model
        if (errMsg.includes('guardrail')) continue;
        throw new Error(`OpenRouter ${res.status}: ${errMsg}`);
      }

      if (stream) return sseToTextStream(res.body);
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      if (content) return content;
      // null content — try next model
    } catch (e) {
      if (e.message?.includes('guardrail') || e.message?.includes('NO_KEY')) continue;
      throw e;
    }
  }

  throw new Error(
    'OpenRouter: All free models are blocked by your privacy policy. ' +
    'Please visit https://openrouter.ai/settings/privacy and enable data sharing, then retry.'
  );
}

/* ── Provider: Google Gemini ─────────────────────────────────
   Free: 15 req/min, 1M tokens/day
   Key:  https://aistudio.google.com/apikey  (no credit card)
──────────────────────────────────────────────────────────── */
async function callGemini({ messages, max_tokens }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('NO_KEY');

  let systemText = '';
  const contents = [];
  for (const m of messages) {
    if (m.role === 'system') { systemText = m.content; continue; }
    const role = m.role === 'assistant' ? 'model' : 'user';
    contents.push({ role, parts: [{ text: m.content }] });
  }
  if (systemText && contents[0]?.role === 'user') {
    contents[0].parts[0].text = `${systemText}\n\n${contents[0].parts[0].text}`;
  }

  // Try multiple Gemini models in case one is rate-limited
  const models = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-8b'];

  for (const modelName of models) {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { maxOutputTokens: max_tokens, temperature: 0.2 }
        })
      }
    );

    if (res.status === 429) {
      console.warn(`[aiProvider] Gemini ${modelName} rate limited, trying next model...`);
      continue; // try next model
    }

    if (!res.ok) {
      let errMsg = `Status ${res.status}`;
      try { const errObj = await res.json(); errMsg = errObj.error?.message || errMsg; } catch {}
      throw new Error(`Gemini ${res.status}: ${errMsg}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) return text;
  }

  throw new Error('Gemini: All models rate limited. Please wait a moment and retry.');
}

/* ── Provider: Groq ──────────────────────────────────────────
   Free: 14,400 req/day, llama3-8b-8192
   Key:  https://console.groq.com  (no credit card)
──────────────────────────────────────────────────────────── */
async function callGroq({ messages, stream, max_tokens }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('NO_KEY');
  // Try models in order — some may be deprecated
  const models = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'];
  for (const model of models) {
    try {
      const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, max_tokens, temperature: 0.2, stream })
      });
      if (!res.ok) {
        let errMsg = `Status ${res.status}`;
        try { const errObj = await res.json(); errMsg = errObj.error?.message || errMsg; } catch {}
        // If model is decommissioned, try next one
        if (errMsg.includes('decommissioned') || errMsg.includes('not found')) continue;
        throw new Error(`Groq ${res.status}: ${errMsg}`);
      }
      if (stream) return sseToTextStream(res.body);
      const data = await res.json();
      return data.choices[0]?.message?.content?.trim() || '';
    } catch (e) {
      if (e.message?.includes('decommissioned') || e.message?.includes('not found')) continue;
      throw e;
    }
  }
  throw new Error('Groq: No working models found.');
}

/* ── Provider: OpenAI ─────────────────────────────────────── */
async function callOpenAI({ messages, stream, max_tokens }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('NO_KEY');
  const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens, temperature: 0.2, stream })
  });
  if (!res.ok) { 
    let errMsg = `Status ${res.status}`;
    try { const errObj = await res.json(); errMsg = errObj.error?.message || errMsg; } catch {}
    throw new Error(`OpenAI ${res.status}: ${errMsg}`); 
  }
  if (stream) return sseToTextStream(res.body);
  const data = await res.json();
  return data.choices[0]?.message?.content?.trim() || '';
}

/* ── Main export: try all providers ──────────────────────────  */
async function chatCompletion({ messages, stream = false, temperature = 0.2, max_tokens = 1024 }) {
  const providers = [
    { name: 'Ollama',      fn: () => callOllama({ messages, stream, max_tokens }) },
    { name: 'OpenRouter',  fn: () => callOpenRouter({ messages, stream, max_tokens }) },
    { name: 'Gemini',      fn: () => callGemini({ messages, max_tokens }) },
    { name: 'Groq',        fn: () => callGroq({ messages, stream, max_tokens }) },
    { name: 'OpenAI',      fn: () => callOpenAI({ messages, stream, max_tokens }) },
  ];

  const errors = [];
  for (const { name, fn } of providers) {
    try {
      console.log(`[aiProvider] Trying ${name}...`);
      const result = await fn();
      console.log(`[aiProvider] ✅ ${name} responded`);
      return result;
    } catch (err) {
      if (err.message === 'NO_KEY') { continue; }
      console.warn(`[aiProvider] ⚠️  ${name} failed: ${err.message}`);
      errors.push(`${name}: ${err.message}`);
    }
  }

  console.error('[aiProvider] ❌ All providers failed:', errors.join(' | '));
  throw new Error(
    'No AI provider is available. ' +
    'To fix this:\n' +
    '  Option 1 (Free, instant): Add GEMINI_API_KEY to .env → get key at https://aistudio.google.com/apikey\n' +
    '  Option 2 (Free, fast): Add GROQ_API_KEY to .env → get key at https://console.groq.com\n' +
    '  Option 3 (No internet): Run Ollama locally → https://ollama.com'
  );
}

module.exports = { chatCompletion };
