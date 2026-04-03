/* ================================
   CHAT JAVASCRIPT
   ================================ */
'use strict';

/* ---- State ---- */
let chatHistory = [];   // { role: 'user'|'assistant', content, sources?, timestamp }
let isChatLoading = false;
let currentView = 'notes';
let abortController = null;

/* ================================
   VIEW SWITCHER
   ================================ */
function switchView(view) {
  currentView = view;

  const notesView = document.getElementById('view-notes');
  const chatView  = document.getElementById('view-chat');
  const graphView = document.getElementById('view-graph');
  
  const noteBtn   = document.getElementById('view-notes-btn');
  const chatBtn   = document.getElementById('view-chat-btn');
  const graphBtn  = document.getElementById('view-graph-btn');
  
  const insightsNote = document.getElementById('insights-content-note');
  const insightsChat = document.getElementById('insights-content-chat');
  const btnDelete = document.getElementById('delete-btn');
  const btnSave = document.getElementById('save-btn');

  // Hide all
  notesView.style.display = 'none';
  chatView.style.display  = 'none';
  graphView.style.display = 'none';
  noteBtn.classList.remove('active');
  chatBtn.classList.remove('active');
  graphBtn.classList.remove('active');

  if (view === 'chat') {
    chatView.style.display  = 'flex';
    chatBtn.classList.add('active');
    
    if (insightsNote) insightsNote.style.display = 'none';
    if (insightsChat) insightsChat.style.display = 'flex';
    if (btnDelete) btnDelete.style.display = 'none';
    if (btnSave) btnSave.style.display = 'none';

    updateNoteCount();
    setTimeout(() => document.getElementById('chat-input')?.focus(), 50);
  } else if (view === 'graph') {
    graphView.style.display = 'flex';
    graphBtn.classList.add('active');
    
    if (insightsNote) insightsNote.style.display = 'none';
    if (insightsChat) insightsChat.style.display = 'none';
    if (btnDelete) btnDelete.style.display = 'none';
    if (btnSave) btnSave.style.display = 'none';

    if (window.initGraph) window.initGraph();
  } else {
    notesView.style.display = 'flex';
    noteBtn.classList.add('active');
    
    if (insightsChat) insightsChat.style.display = 'none';
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
  const count = typeof allNotes !== 'undefined' ? allNotes.length : 0;
  const el = document.getElementById('chat-note-count');
  if (el) el.textContent = `${count} note${count !== 1 ? 's' : ''} indexed`;
  if (count > 0) renderSuggestedQuestions();
}

/* ================================
   SUGGESTED QUESTIONS
   ================================ */
function renderSuggestedQuestions() {
  const container = document.getElementById('suggested-questions');
  if (!container || typeof allNotes === 'undefined') return;

  const questions = [];
  const ideaNotes    = allNotes.filter(n => n.tag === 'idea').slice(0, 1);
  const researchNotes = allNotes.filter(n => n.tag === 'research').slice(0, 1);
  const todoNotes    = allNotes.filter(n => n.tag === 'todo').slice(0, 1);

  if (ideaNotes.length)    questions.push(`Tell me about my idea: "${ideaNotes[0].title}"`);
  if (researchNotes.length) questions.push(`Summarize my research on "${researchNotes[0].title}"`);
  if (todoNotes.length)    questions.push(`What are my to-do items related to "${todoNotes[0].title}"?`);

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
   CHAT SUBMIT (STREAMING)
   ================================ */
function handleChatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitChat();
  }
}

async function submitChat(retryText = null) {
  if (isChatLoading) return;
  const input    = document.getElementById('chat-input');
  const question = retryText || input.value.trim();
  if (!question) return;

  if (!retryText) {
    input.value = '';
    autoresizeTextarea(input);
  }

  const welcome = document.getElementById('chat-welcome');
  if (welcome) welcome.style.display = 'none';
  const clearBtn = document.getElementById('clear-chat-btn');
  if (clearBtn) clearBtn.style.display = 'flex';

  // Render user bubble
  const timestamp = new Date().toISOString();
  if (!retryText) {
    appendMessage({ role: 'user', content: question, timestamp });
    chatHistory.push({ role: 'user', content: question, timestamp });
  }

  isChatLoading = true;
  setSendDisabled(true);
  const typing = showTypingIndicator();

  // Create an assistant bubble to stream into
  const assistantMsgId = 'msg_' + Date.now();
  let fullAssistantContent = '';
  
  try {
    const token = localStorage.getItem('nv_token');
    abortController = new AbortController();
    
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ 
        question, 
        history: chatHistory.slice(-10), 
        stream: true 
      }),
      signal: abortController.signal
    });

    // Hide typing indicator before processing response
    hideTypingIndicator(typing);

    if (!response.ok) {
      // response.json() works here because the error path sends JSON
      let errMsg = 'Chat failed';
      try { const errData = await response.json(); errMsg = errData.error || errMsg; } catch { /* ignore */ }
      throw new Error(errMsg);
    }

    // Stream the plain-text response from the backend
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantBubbleCreated = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Backend now sends clean text — no SSE parsing needed here
      const chunk = decoder.decode(value, { stream: true });
      if (!chunk) continue;
      fullAssistantContent += chunk;

      if (!assistantBubbleCreated) {
        appendMessage({ 
          role: 'assistant', 
          content: '', 
          id: assistantMsgId, 
          timestamp: new Date().toISOString(),
          isStreaming: true 
        });
        assistantBubbleCreated = true;
      }

      updateStreamingBubble(assistantMsgId, fullAssistantContent);
    }

    // Finalize the streamed bubble in place (no duplicate creation)
    finalizeStreamingBubble(assistantMsgId, fullAssistantContent);
    chatHistory.push({ 
      role: 'assistant', 
      content: fullAssistantContent, 
      timestamp: new Date().toISOString() 
    });

  } catch (err) {
    if (err.name === 'AbortError') return;
    
    hideTypingIndicator(typing);
    console.error('[chat]', err);

    // Translate technical errors into a clean friendly message
    let userMsg = err.message || 'AI is currently unavailable.';
    if (userMsg.includes('No AI provider') || userMsg.includes('unavailable')) {
      userMsg = 'AI is currently unavailable. Add a free **GEMINI_API_KEY** to your `.env` file. Get one free at [aistudio.google.com](https://aistudio.google.com/apikey).';
    }

    appendMessage({ 
      role: 'assistant', 
      content: userMsg, 
      error: true,
      retryText: question
    });
  } finally {
    isChatLoading = false;
    setSendDisabled(false);
    abortController = null;
    input.focus();
  }
}

/* ================================
   MESSAGE RENDERING
   ================================ */
function appendMessage({ role, content, sources, error, id, timestamp, retryText, isStreaming }) {
  const container = document.getElementById('chat-messages');
  const wrap = document.createElement('div');
  wrap.className = `chat-message ${role} ${isStreaming ? 'streaming' : ''}`;
  const msgId = id || 'msg_' + Date.now();
  wrap.id = msgId;

  const timeStr = formatTime(timestamp || new Date());

  let html = '';
  
  if (role === 'user') {
    html = `
      <div class="message-content-wrapper">
        <div class="message-bubble">${escChatHtml(content)}</div>
        <div class="message-meta">${timeStr}</div>
      </div>`;
  } else {
    let { mainContent, followups } = parseAssistantContent(content);

    if (error) {
       mainContent = `⚠️ **System Note**: ${content || 'AI is currently unavailable.'}`;
    }

    html = `
      <div class="msg-avatar ai-av">✨</div>
      <div class="message-content-wrapper w-full">
        <div class="message-bubble${error ? ' error' : ''}" id="bubble_${msgId}">
          ${markdownToHtml(mainContent)}
          ${isStreaming ? '<span class="streaming-cursor"></span>' : ''}
        </div>
        <div class="message-meta">
          ${timeStr}
          ${!error && !isStreaming ? `<button class="meta-action" onclick="copyToClipboard('${escChatHtml(mainContent)}')">Copy</button>` : ''}
        </div>`;

    if (sources && sources.length > 0) {
      html += `
        <div class="message-sources">
          <div class="sources-list">${sources.map(renderSourceChip).join('')}</div>
        </div>`;
    }

    if (error && retryText) {
      html += `<button class="retry-btn" onclick="retryChat('${escChatHtml(retryText)}', '${msgId}')">🔄 Retry Request</button>`;
    }

    if (!error && mainContent && !isStreaming) {
      html += `
        <div class="ai-actions">
          <button class="ai-action-btn" onclick="handleChatAction('expand', '${msgId}')">✨ Expand</button>
          <button class="ai-action-btn" onclick="handleChatAction('simplify', '${msgId}')">🎯 Simplify</button>
          <button class="ai-action-btn" onclick="handleChatAction('summarize', '${msgId}')">📝 Summarize</button>
        </div>`;
    }

    if (followups.length > 0 && !isStreaming) {
      html += `
        <div class="followup-suggestions">
          ${followups.map(f => `<button class="followup-chip" onclick="useSuggestedQuestion(this.dataset.q)" data-q="${escChatHtml(f)}">${escChatHtml(f)}</button>`).join('')}
        </div>`;
    }

    html += `</div>`;
  }

  wrap.innerHTML = html;
  container.appendChild(wrap);
  autoScroll();
}

function updateStreamingBubble(id, content) {
  const bubble = document.getElementById(`bubble_${id}`);
  if (!bubble) return;
  const { mainContent } = parseAssistantContent(content);
  bubble.innerHTML = markdownToHtml(mainContent) + '<span class="streaming-cursor"></span>';
  autoScroll();
}

function finalizeStreamingBubble(id, content) {
  const wrap = document.getElementById(id);
  const bubble = document.getElementById(`bubble_${id}`);
  if (!wrap) return;

  wrap.classList.remove('streaming');

  // If no content streamed at all (empty response), show fallback
  if (!content || !content.trim()) {
    if (bubble) bubble.innerHTML = '<p><em>No response received. Please try again.</em></p>';
    return;
  }

  const { mainContent, followups } = parseAssistantContent(content);

  // Update the bubble content in-place (no duplicate messages)
  if (bubble) {
    bubble.innerHTML = markdownToHtml(mainContent);
  }

  // Append meta row (timestamp + copy) and action buttons under the existing wrap
  const metaDiv = wrap.querySelector('.message-meta');
  if (metaDiv) {
    const timeStr = formatTime(new Date());
    metaDiv.innerHTML = `${timeStr}<button class="meta-action" onclick="copyToClipboard('${escChatHtml(mainContent)}')">Copy</button>`;
  }

  // Add AI action buttons
  const wrapper = wrap.querySelector('.message-content-wrapper');
  if (wrapper && mainContent) {
    // Remove old action placeholder if any
    wrapper.querySelectorAll('.ai-actions, .followup-suggestions').forEach(el => el.remove());

    const actionsEl = document.createElement('div');
    actionsEl.className = 'ai-actions';
    actionsEl.innerHTML = `
      <button class="ai-action-btn" onclick="handleChatAction('expand', '${id}')">✨ Expand</button>
      <button class="ai-action-btn" onclick="handleChatAction('simplify', '${id}')">🎯 Simplify</button>
      <button class="ai-action-btn" onclick="handleChatAction('summarize', '${id}')">📝 Summarize</button>`;
    wrapper.appendChild(actionsEl);

    if (followups.length > 0) {
      const fwEl = document.createElement('div');
      fwEl.className = 'followup-suggestions';
      fwEl.innerHTML = followups.map(f =>
        `<button class="followup-chip" onclick="useSuggestedQuestion(this.dataset.q)" data-q="${escChatHtml(f)}">${escChatHtml(f)}</button>`
      ).join('');
      wrapper.appendChild(fwEl);
    }
  }

  autoScroll();
}

function parseAssistantContent(content) {
  let mainContent = content || '';
  let followups = [];
  if (content && typeof content === 'string' && content.includes('---FOLLOWUPS---')) {
    const parts = content.split('---FOLLOWUPS---');
    mainContent = parts[0].trim();
    const fwText = parts[1].trim();
    followups = fwText.split('\n').map(l => l.replace(/^\d+\.\s*/, '').trim()).filter(l => l);
  }
  return { mainContent, followups };
}

function renderSourceChip(s) {
  return `
    <div class="source-chip" title="${escChatHtml(s.preview || '')}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
      ${escChatHtml(s.title || 'Untitled')}
    </div>`;
}

function autoScroll() {
  const container = document.getElementById('chat-messages');
  const threshold = 150;
  const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  
  if (isNearBottom) {
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth'
    });
  }
}

function retryChat(text, oldId) {
  const el = document.getElementById(oldId);
  if (el) el.remove();
  submitChat(text);
}

/* ================================
   ACTIONS & UTILS
   ================================ */
async function handleChatAction(action, msgId) {
  if (isChatLoading) return;
  const bubble = document.getElementById(`bubble_${msgId}`);
  if (!bubble) return;
  const text = bubble.innerText;
  
  const typing = showTypingIndicator();
  isChatLoading = true;
  setSendDisabled(true);

  try {
    const data = await chatFetch('/api/chat/action', { action, text });
    hideTypingIndicator(typing);
    const ts = new Date().toISOString();
    chatHistory.push({ role: 'assistant', content: data.answer, timestamp: ts });
    appendMessage({ role: 'assistant', content: data.answer, timestamp: ts });
  } catch (err) {
    hideTypingIndicator(typing);
    appendMessage({ role: 'assistant', content: err.message, error: true });
  } finally {
    isChatLoading = false;
    setSendDisabled(false);
  }
}

function showTypingIndicator() {
  const container = document.getElementById('chat-messages');
  const el = document.createElement('div');
  el.className = 'chat-message assistant typing-indicator';
  el.id = 'typing-indicator';
  el.innerHTML = `
    <div class="msg-avatar ai-av pulse-logo">✨</div>
    <div class="message-content-wrapper w-full">
      <div class="chat-skeleton-wrapper">
        <div class="skeleton chat-skeleton-line mid"></div>
        <div class="skeleton chat-skeleton-line short"></div>
      </div>
    </div>`;
  container.appendChild(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return el;
}

function hideTypingIndicator(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

function clearChat() {
  chatHistory = [];
  if (abortController) abortController.abort();
  const messages = document.getElementById('chat-messages');
  const welcome  = document.getElementById('chat-welcome');
  const clearBtn = document.getElementById('clear-chat-btn');

  [...messages.children].forEach(child => {
    if (child !== welcome) child.remove();
  });

  if (welcome) welcome.style.display = 'flex';
  if (clearBtn) clearBtn.style.display = 'none';
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    if (typeof showToast === 'function') showToast('Copied to clipboard');
  });
}

function formatTime(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
}

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

function markdownToHtml(md) {
  if (!md) return '';
  let html = md.trim();

  // 1. Code blocks (multiline)
  html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
    return `<pre class="code-block"><code>${escChatHtml(code.trim())}</code></pre>`;
  });

  // 2. Inline code (single backtick)
  html = html.replace(/`([^`\n]+)`/g, (match, code) => {
    return `<code class="inline-code">${escChatHtml(code)}</code>`;
  });

  // 3. Tables
  html = html.replace(/^\|(.+)\|$/gm, (match, content) => {
    const cells = content.split('|').map(c => `<td>${c.trim()}</td>`).join('');
    return `<tr>${cells}</tr>`;
  });
  html = html.replace(/(<tr>.*<\/tr>)+/gs, '<table>$1</table>');

  // 4. Typography
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 5. Citations
  html = html.replace(/\[(\d+)\]/g, '<span class="cite-badge" onclick="scrollToSource($1)">$1</span>');

  // 6. Lists
  html = html.replace(/^[-*•] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');

  // 7. Paragraphs
  const sections = html.split(/\n\n+/);
  html = sections.map(s => {
    s = s.trim();
    if (!s) return '';
    if (s.startsWith('<pre') || s.startsWith('<ul') || s.startsWith('<table') || s.startsWith('<li')) return s;
    return `<p>${s.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return html;
}

document.addEventListener('DOMContentLoaded', () => {
  const interval = setInterval(() => {
    if (typeof allNotes !== 'undefined' && allNotes !== null) {
      updateNoteCount();
      clearInterval(interval);
    }
  }, 300);
});
