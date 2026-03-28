/* ================================
   CHAT JAVASCRIPT
   ================================ */
'use strict';

/* ---- State ---- */
let chatHistory = [];   // { role: 'user'|'assistant', content, sources? }
let isChatLoading = false;
let currentView = 'notes';

/* ================================
   VIEW SWITCHER
   ================================ */
function switchView(view) {
  currentView = view;

  const notesView = document.getElementById('view-notes');
  const chatView  = document.getElementById('view-chat');
  const noteBtn   = document.getElementById('view-notes-btn');
  const chatBtn   = document.getElementById('view-chat-btn');
  
  const insightsNote = document.getElementById('insights-content-note');
  const insightsChat = document.getElementById('insights-content-chat');
  const btnDelete = document.getElementById('delete-btn');
  const btnSave = document.getElementById('save-btn');

  if (view === 'chat') {
    notesView.style.display = 'none';
    chatView.style.display  = 'flex';
    noteBtn.classList.remove('active');
    chatBtn.classList.add('active');
    
    // Insights
    if (insightsNote) insightsNote.style.display = 'none';
    if (insightsChat) insightsChat.style.display = 'flex';
    if (btnDelete) btnDelete.style.display = 'none';
    if (btnSave) btnSave.style.display = 'none';

    updateNoteCount();
    setTimeout(() => document.getElementById('chat-input')?.focus(), 50);
  } else {
    chatView.style.display  = 'none';
    notesView.style.display = 'flex';
    chatBtn.classList.remove('active');
    noteBtn.classList.add('active');
    
    // Insights
    if (insightsChat) insightsChat.style.display = 'none';
    // activeNoteId dictates Note Insights visibility
    if (typeof activeNoteId !== 'undefined' && activeNoteId !== null) {
      if (insightsNote) insightsNote.style.display = 'flex';
      if (btnDelete) btnDelete.style.display = 'block';
      if (btnSave) btnSave.style.display = 'block';
    } else {
      if (insightsNote) insightsNote.style.display = 'none';
      if (btnDelete) btnDelete.style.display = 'none';
      if (btnSave) btnSave.style.display = 'none';
    }
  }
}

function updateNoteCount() {
  // allNotes is defined in dashboard.js
  const count = typeof allNotes !== 'undefined' ? allNotes.length : 0;
  const el = document.getElementById('chat-note-count');
  if (el) el.textContent = `${count} note${count !== 1 ? 's' : ''} indexed`;

  // Build suggested questions from note titles
  if (count > 0) renderSuggestedQuestions();
}

/* ================================
   SUGGESTED QUESTIONS
   ================================ */
function renderSuggestedQuestions() {
  const container = document.getElementById('suggested-questions');
  if (!container || typeof allNotes === 'undefined') return;

  const questions = [];

  // Generate generic questions from note titles/tags
  const ideaNotes    = allNotes.filter(n => n.tag === 'idea').slice(0, 1);
  const researchNotes = allNotes.filter(n => n.tag === 'research').slice(0, 1);
  const todoNotes    = allNotes.filter(n => n.tag === 'todo').slice(0, 1);

  if (ideaNotes.length)    questions.push(`Tell me about my idea: "${ideaNotes[0].title}"`);
  if (researchNotes.length) questions.push(`Summarize my research on "${researchNotes[0].title}"`);
  if (todoNotes.length)    questions.push(`What are my to-do items related to "${todoNotes[0].title}"?`);

  // Fallback generic questions
  if (questions.length < 2) {
    questions.push('What are the main topics in my notes?');
    questions.push('Summarize my most recent notes');
  }

  container.innerHTML = questions.slice(0, 3).map(q =>
    `<button class="suggested-q" onclick="useSuggestedQuestion(this.dataset.q)" data-q="${escChatHtml(q)}">${escChatHtml(q)}</button>`
  ).join('');
}

function useSuggestedQuestion(q) {
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = q;
    autoresizeTextarea(input);
    input.focus();
  }
}

/* ================================
   CHAT SUBMIT
   ================================ */
function handleChatKeydown(e) {
  // Enter (without Shift) = submit
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitChat();
  }
}

async function submitChat() {
  if (isChatLoading) return;
  const input    = document.getElementById('chat-input');
  const question = input.value.trim();
  if (!question) return;

  // Clear input
  input.value = '';
  autoresizeTextarea(input);

  // Hide welcome, show clear button
  document.getElementById('chat-welcome').style.display   = 'none';
  document.getElementById('clear-chat-btn').style.display = 'flex';

  // Render user bubble
  appendMessage({ role: 'user', content: question });
  chatHistory.push({ role: 'user', content: question });

  // Show typing indicator
  const typing = showTypingIndicator();
  isChatLoading = true;
  setSendDisabled(true);

  try {
    const data = await chatFetch('/api/chat', { question, topK: 5 });
    hideTypingIndicator(typing);

    chatHistory.push({ role: 'assistant', content: data.answer, sources: data.sources });
    appendMessage({ role: 'assistant', content: data.answer, sources: data.sources });
  } catch (err) {
    hideTypingIndicator(typing);
    appendMessage({ role: 'assistant', content: err.message, error: true });
  } finally {
    isChatLoading = false;
    setSendDisabled(false);
    input.focus();
  }
}

/* ================================
   MESSAGE RENDERING
   ================================ */
function appendMessage({ role, content, sources, error }) {
  const container = document.getElementById('chat-messages');
  const wrap = document.createElement('div');
  wrap.className = `chat-message ${role}`;

  let html = '';
  
  if (role === 'user') {
    html = `
      <div class="message-content-wrapper">
        <div class="message-bubble${error ? ' error' : ''}">${escChatHtml(content)}</div>
      </div>`;
  } else {
    html = `
      <div class="msg-avatar ai-av">✨</div>
      <div class="message-content-wrapper w-full">
        <div class="message-bubble${error ? ' error' : ''}">
          ${markdownToHtml(content)}
        </div>`;

    if (sources && sources.length > 0) {
      html += `
        <div class="message-sources">
          <div class="sources-list">
            ${sources.map(s => `
              <div class="source-chip" title="${escChatHtml(s.preview || '')}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                ${escChatHtml(s.title || 'Untitled')}
              </div>`).join('')}
          </div>
        </div>`;
    }
    html += `</div>`;
  }

  wrap.innerHTML = html;
  container.appendChild(wrap);
  
  // Smooth auto-scroll
  wrap.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

/* ================================
   TYPING INDICATOR
   ================================ */
function showTypingIndicator() {
  const container = document.getElementById('chat-messages');
  const el = document.createElement('div');
  el.className = 'chat-message assistant typing-indicator';
  el.id = 'typing-indicator';
  el.innerHTML = `
    <div class="msg-avatar ai-av pulse-logo">✨</div>
    <div class="message-content-wrapper">
      <div class="typing-bubble">
        <span class="thinking-text">AI is thinking</span>
        <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
      </div>
    </div>`;
  container.appendChild(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return el;
}

function hideTypingIndicator(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

/* ================================
   CLEAR CHAT
   ================================ */
function clearChat() {
  chatHistory = [];
  const messages = document.getElementById('chat-messages');
  const welcome  = document.getElementById('chat-welcome');
  const clearBtn = document.getElementById('clear-chat-btn');

  // Remove all messages except the welcome block
  [...messages.children].forEach(child => {
    if (child !== welcome) child.remove();
  });

  welcome.style.display = 'flex';
  clearBtn.style.display = 'none';
}

/* ================================
   HELPERS
   ================================ */
function setSendDisabled(disabled) {
  const btn = document.getElementById('chat-send-btn');
  if (btn) btn.disabled = disabled;
}

function autoresizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

async function chatFetch(path, body) {
  const token = localStorage.getItem('nv_token');
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Chat request failed');
  return data;
}

function escChatHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Minimal Markdown → HTML renderer for assistant messages.
 * Handles: **bold**, *italic*, `code`, - lists.
 */
function markdownToHtml(md) {
  if (!md) return '';

  // Escape HTML first
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Lists
  html = html.replace(/^[-*•] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');

  // Paragraphs
  html = html.split(/\n\n/).map(para => {
    para = para.trim();
    if (!para) return '';
    if (para.startsWith('<')) return para;
    return `<p>${para.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return html;
}

// After notes load, update the note count hint in chat view
document.addEventListener('DOMContentLoaded', () => {
  // Wait for allNotes to be populated (loaded in dashboard.js)
  const interval = setInterval(() => {
    if (typeof allNotes !== 'undefined' && allNotes !== null) {
      updateNoteCount();
      clearInterval(interval);
    }
  }, 300);
});
