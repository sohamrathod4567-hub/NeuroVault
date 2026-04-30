/* ================================
   DASHBOARD JAVASCRIPT
   ================================ */
'use strict';

// ---- State ----
let allNotes = [];
let activeNoteId = null;
let isUnsaved = false;
let searchDebounceTimer = null;
let isSemanticSearch = false;
let currentTagFilter = 'all';

// ---- Auth guard ----
const token = localStorage.getItem('nv_token');
const userRaw = localStorage.getItem('nv_user');
// --- PDF Upload Logic ---
const uploadPdfBtn = document.getElementById('uploadPdfBtn');
const pdfFileInput = document.getElementById('pdfFileInput');

if (uploadPdfBtn && pdfFileInput) {
  uploadPdfBtn.addEventListener('click', () => {
    pdfFileInput.click();
  });

  pdfFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Reset so same file can be clicked again
    e.target.value = '';

    const formData = new FormData();
    formData.append('pdf', file);

    const loadingToast = showToast('Uploading and processing PDF...', 'loading', 0);
    try {
      const res = await fetch(`/api/documents/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();
      if (res.ok) {
        updateToast(loadingToast, data.message || 'PDF processed successfully', 'success');
        await loadNotes();
      } else {
        updateToast(loadingToast, data.error || 'Failed to upload PDF', 'error');
      }
    } catch (err) {
      console.error(err);
      updateToast(loadingToast, 'A network error occurred while uploading', 'error');
    } finally {
      uploadPdfBtn.innerHTML = originalHTML;
      uploadPdfBtn.disabled = false;
    }
  });
}

// Provide a default dummy user to bypass auth
const user = { username: 'Local User', email: 'local@example.com' };

// ---- Init ----
let sidebarOpen = true;

document.addEventListener('DOMContentLoaded', () => {
  initResizers(); // Initialize draggable panels
  initUserBadge();
  initGreeting();
  loadNotes();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const searchInput = document.getElementById('search-input');
      const aiToolbar = document.getElementById('ai-toolbar');
      if (searchInput && document.activeElement === searchInput) {
        searchInput.blur();
      }
      if (aiToolbar && aiToolbar.style.display !== 'none') {
        if (window.getSelection) window.getSelection().removeAllRanges();
      }
    }
  });
});

/* Toggle the sidebar open or closed */
function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  const layout = document.querySelector('.dashboard-layout');
  if (!sidebarOpen) {
    layout.style.setProperty('--sidebar-width', '0px');
  } else {
    const savedSidebar = localStorage.getItem('nv_width_sidebar') || 280;
    layout.style.setProperty('--sidebar-width', savedSidebar + 'px');
  }
}

/* Initialize resizable panels */
function initResizers() {
  const layout = document.querySelector('.dashboard-layout');
  const resizerL = document.getElementById('resizer-left');
  const resizerR = document.getElementById('resizer-right');
  if (!layout || !resizerL || !resizerR) return;
  
  // Load saved widths
  const savedSidebar = localStorage.getItem('nv_width_sidebar');
  const savedInsights = localStorage.getItem('nv_width_insights');
  if (savedSidebar) layout.style.setProperty('--sidebar-width', savedSidebar + 'px');
  if (savedInsights) layout.style.setProperty('--insights-width', savedInsights + 'px');

  let activeResizer = null;

  const startResize = (e, type) => {
    activeResizer = type;
    document.body.classList.add('resizing');
    if (type === 'left') resizerL.classList.add('dragging');
    else resizerR.classList.add('dragging');
    
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
  };

  const handleResize = (e) => {
    if (!activeResizer) return;

    if (activeResizer === 'left') {
      const newWidth = Math.max(180, Math.min(450, e.clientX));
      layout.style.setProperty('--sidebar-width', newWidth + 'px');
      localStorage.setItem('nv_width_sidebar', newWidth);
    } else {
      const newWidth = Math.max(200, Math.min(500, window.innerWidth - e.clientX));
      layout.style.setProperty('--insights-width', newWidth + 'px');
      localStorage.setItem('nv_width_insights', newWidth);
    }
  };

  const stopResize = () => {
    document.body.classList.remove('resizing');
    resizerL.classList.remove('dragging');
    resizerR.classList.remove('dragging');
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
    activeResizer = null;
  };

  resizerL.addEventListener('mousedown', (e) => startResize(e, 'left'));
  resizerR.addEventListener('mousedown', (e) => startResize(e, 'right'));
}

/* Initialize user greeting based on time of day */
function initGreeting() {
  const nameEl = document.getElementById('home-name');
  if (nameEl && user) {
    nameEl.textContent = `, ${user.username || user.email.split('@')[0]}`;
  }
  
  const greetingEl = document.getElementById('home-greeting');
  if (greetingEl) {
    const hour = new Date().getHours();
    if (hour < 12) greetingEl.textContent = 'Good morning';
    else if (hour < 17) greetingEl.textContent = 'Good afternoon';
    else greetingEl.textContent = 'Good evening';
  }
}

/* Initialize the user avatar badge */
function initUserBadge() {
  const nameEl   = document.getElementById('user-name');
  const avatarEl = document.getElementById('user-avatar');
  if (nameEl)   nameEl.textContent   = user.username || user.email;
  if (avatarEl) avatarEl.textContent = (user.username || user.email).charAt(0).toUpperCase();
}

/* ================================
   API HELPERS
   ================================ */
/* Helper wrapper for API fetch calls with auth */
async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    localStorage.clear();
    window.location.href = '/';
    return;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API error');
  return data;
}

/* ================================
   NOTES DATA
   ================================ */
async function loadNotes() {
  const list = document.getElementById('notes-list');
  
  if (list) {
    list.innerHTML = Array(6).fill().map(() => `
      <div class="skeleton-item">
        <div class="skeleton skel-title"></div>
        <div class="skeleton skel-line"></div>
        <div class="skeleton skel-line-short"></div>
      </div>
    `).join('');
  }

  const tagsList = document.getElementById('tag-filters');
  if (tagsList) {
    tagsList.innerHTML = Array(5).fill().map(() => `
      <div class="skeleton skel-tag" style="margin-right: 4px;"></div>
    `).join('');
  }

  const activityGrid = document.getElementById('recent-grid');
  if (activityGrid) {
    activityGrid.innerHTML = Array(4).fill().map(() => `
      <div class="skeleton skel-card"></div>
    `).join('');
  }

  try {
    allNotes = await apiFetch('/api/notes');
    renderTagFilters(); // New function to render tags after loading
    applyFilters();
  } catch (err) {
    if (list) {
      list.innerHTML = `
        <div class="empty-sidebar error-state" style="padding: var(--space-4); text-align: center;">
          <div class="empty-icon" style="margin-bottom: var(--space-2);">⚠️</div>
          <p style="color: var(--error); margin-bottom: var(--space-2); font-weight: 600;">Connection Interrupted</p>
          <button class="btn btn-secondary" onclick="loadNotes()" style="margin: 0 auto;">Retry Connection</button>
        </div>`;
    }
    showToast('Vault connection failed.', 'error');
  }
}

/* ================================
   SIDEBAR RENDERING
   ================================ */
function getTagIcon(tag) {
  switch (tag) {
    case 'idea': return '💡';
    case 'research': return '🔍';
    case 'document': return '📄';
    case 'todo': return '✅';
    default: return '📝';
  }
}

function renderNotesList(notes) {
  const list = document.getElementById('notes-list');
  list.innerHTML = '';

  if (!notes.length) {
    list.innerHTML = `
      <div class="empty-sidebar">
        <div class="empty-icon">📭</div>
        <p>No notes yet.<br/>Create your first one!</p>
      </div>`;
    return;
  }

  const countLabel = isSemanticSearch
    ? `${notes.length} semantic result${notes.length !== 1 ? 's' : ''}`
    : `${notes.length} note${notes.length !== 1 ? 's' : ''}`;
  list.insertAdjacentHTML('beforeend', `<div class="note-count">${countLabel}</div>`);

  notes.forEach(note => {
    const el = document.createElement('div');
    const previewText = note.content ? escHtml(stripMarkdown(note.content)) : 'No content';
    const favClass = note.is_favorite ? ' is-favorite' : '';

    el.className = `note-item${note.id === activeNoteId ? ' active' : ''}${favClass}`;
    el.dataset.id = note.id;
    el.onclick = () => openNote(note.id);

    el.innerHTML = `
      <div class="note-item-fav">⭐</div>
      <div class="note-item-header">
        <span class="note-icon">${icon}</span>
        <div class="note-item-title"><span>${escHtml(note.title || 'Untitled Note')}</span>${scoreBadge}</div>
      </div>
      <div class="note-item-preview">${previewText}</div>
      <div class="note-item-meta">
        <span class="note-tag tag-${note.tag || 'general'}">${note.tag || 'general'}</span>
        <span class="note-date">${formatDate(note.updated_at)}</span>
      </div>`;
    list.appendChild(el);
  });
}

function renderTagFilters() {
  const container = document.getElementById('tag-filters');
  if (!container) return;

  const tags = ['all', 'idea', 'research', 'todo', 'document', 'favorites'];
  container.innerHTML = tags.map(tag => `
    <button class="tag-filter-btn${tag === currentTagFilter ? ' active' : ''}" 
            data-tag="${tag}" 
            onclick="filterByTag('${tag}')">
      ${tag === 'favorites' ? '⭐ Favorites' : tag.charAt(0).toUpperCase() + tag.slice(1)}
    </button>
  `).join('');
}

function filterByTag(tag) {
  currentTagFilter = tag;
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  
  document.querySelectorAll('.tag-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tag === tag);
  });
  
  applyFilters();
}

function applyFilters() {
  let filtered = allNotes;
  if (currentTagFilter === 'favorites') {
    filtered = filtered.filter(n => n.is_favorite === 1);
  } else if (currentTagFilter !== 'all') {
    filtered = filtered.filter(n => n.tag === currentTagFilter);
  }

  const countEl = document.getElementById('list-note-count');
  if (countEl) countEl.textContent = filtered.length;

  renderNotesList(filtered);
  renderRecentActivity();
}

function renderRecentActivity() {
  const grid = document.getElementById('recent-grid');
  if (!grid) return;
  
  if (!allNotes || allNotes.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: var(--space-6); background: var(--bg-surface); border-radius: var(--radius-lg); border: 1px dashed var(--border-strong);">
        <div style="font-size: 24px; margin-bottom: var(--space-2);">📝</div>
        <p style="font-weight: 600; font-size: 14px; color: var(--text-primary); margin-bottom: 4px;">Your vault is entirely empty.</p>
        <p style="font-size: 13px;">Start by clicking 'New Note' above to draft your first idea.</p>
      </div>`;
    return;
  }
  
  // Get top 4 most recently updated
  // Note: allNotes is already sorted by updated_at DESC from the API
  const recent = allNotes.slice(0, 4);
  
  grid.innerHTML = recent.map(n => `
    <div class="card card-interactive recent-card" onclick="openNote(${n.id})">
      <div class="recent-card-title">
        <span class="note-icon">${getTagIcon(n.tag)}</span>
        <span>${escHtml(n.title || 'Untitled')}</span>
      </div>
      <div class="recent-card-meta">Updated ${formatDate(n.updated_at)}</div>
    </div>
  `).join('');
}

/* ================================
   SEARCH  (semantic + keyword fallback)
   ================================ */
function filterNotes(query) {
  clearTimeout(searchDebounceTimer);

  if (!query.trim()) {
    // Empty query — show all notes
    isSemanticSearch = false;
    clearSearchUI();
    renderNotesList(allNotes);
    return;
  }

  // Very short query: instant local keyword filter, no API call
  if (query.trim().length <= 2) {
    isSemanticSearch = false;
    clearSearchUI();
    const q = query.toLowerCase();
    renderNotesList(allNotes.filter(n =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.content || '').toLowerCase().includes(q) ||
      (n.tag || '').toLowerCase().includes(q)
    ));
    return;
  }

  // Debounce: wait 450ms after the user stops typing before hitting the API
  searchDebounceTimer = setTimeout(() => semanticSearch(query.trim()), 450);
}

async function semanticSearch(query) {
  setSearchLoading(true);
  try {
    const data = await apiFetch('/api/search', {
      method: 'POST',
      body: JSON.stringify({ query, topK: 5 }),
    });
    isSemanticSearch = true;
    renderNotesList(data.results);
  } catch (err) {
    // Graceful fallback: keyword filter if search API fails (e.g. no API key)
    isSemanticSearch = false;
    const q = query.toLowerCase();
    renderNotesList(allNotes.filter(n =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.content || '').toLowerCase().includes(q)
    ));
    if (err.message.includes('OPENAI_API_KEY')) {
      showToast('Add OPENAI_API_KEY to .env for semantic search', 'info');
    }
  } finally {
    setSearchLoading(false);
  }
}

function setSearchLoading(loading) {
  const input = document.getElementById('search-input');
  if (input) input.style.opacity = loading ? '0.5' : '1';
}

function clearSearchUI() {
  const input = document.getElementById('search-input');
  if (input && !input.value) input.style.opacity = '1';
}

/* ================================
   NOTE EDITOR
   ================================ */
function openNote(id) {
  const note = allNotes.find(n => n.id === id);
  if (!note) return;

  activeNoteId = id;

  // Update sidebar active state
  document.querySelectorAll('.note-item').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.id) === id);
  });

  // Show editor
  showEditor();

  // Reset to edit mode on new note open
  setEditorMode('edit');

  // Populate fields
  document.getElementById('note-title').value   = note.title || '';
  document.getElementById('note-content').value = note.content || '';
  document.getElementById('note-tag-select').value = note.tag || 'general';

  updateEditorMeta(note);
  updateWordCount();
  
  // Update favorite toggle UI
  const favBtn = document.getElementById('favorite-toggle-btn');
  if (favBtn) favBtn.classList.toggle('active', note.is_favorite === 1);
  
  markSaved();
}

function showEditor() {
  document.getElementById('welcome-state').style.display = 'none';
  document.getElementById('note-editor').style.display   = 'flex';
  
  if (currentView === 'notes') {
    document.getElementById('insights-content-note').style.display = 'flex';
    document.getElementById('save-btn').style.display = 'block';
    document.getElementById('delete-btn').style.display = 'block';
  }
}

function showWelcome() {
  document.getElementById('welcome-state').style.display = 'flex';
  document.getElementById('note-editor').style.display   = 'none';
  
  document.getElementById('insights-content-note').style.display = 'none';
  document.getElementById('save-btn').style.display = 'none';
  document.getElementById('delete-btn').style.display = 'none';
  
  renderRecentActivity();
}

function updateEditorMeta(note) {
  const createdEl = document.getElementById('insight-created');
  const updatedEl = document.getElementById('insight-updated');
  if (createdEl) {
    createdEl.textContent = note.created_at ? formatDate(note.created_at) : 'Just now';
  }
  if (updatedEl) {
    updatedEl.textContent = note.updated_at ? formatDate(note.updated_at) : 'Just now';
  }
}

function updateWordCount() {
  const content = document.getElementById('note-content').value;
  const words   = content.trim() ? content.trim().split(/\s+/).length : 0;
  const el = document.getElementById('word-count');
  if (el) el.textContent = `${words} word${words !== 1 ? 's' : ''}`;
}

/* ================================
   CREATE NOTE
   ================================ */
async function createNewNote() {
  const nt = showToast('Creating new note...', 'loading', 0);
  try {
    const note = await apiFetch('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ title: 'Untitled Note', content: '', tag: 'general' }),
    });
    allNotes.unshift(note);
    applyFilters();
    openNote(note.id);
    setTimeout(() => document.getElementById('note-title').focus(), 50);
    updateToast(nt, 'New note created', 'success');
  } catch (err) {
    updateToast(nt, err.message, 'error');
  }
}

/* ================================
   SAVE NOTE
   ================================ */
async function saveNote() {
  if (!activeNoteId) return;

  const title   = document.getElementById('note-title').value.trim()   || 'Untitled Note';
  const content = document.getElementById('note-content').value;
  const tag     = document.getElementById('note-tag-select').value;

  const st = showToast('Saving note...', 'loading', 0);
  try {
    const updated = await apiFetch(`/api/notes/${activeNoteId}`, {
      method: 'PUT',
      body: JSON.stringify({ title, content, tag }),
    });

    // Update local state
    const idx = allNotes.findIndex(n => n.id === activeNoteId);
    if (idx !== -1) allNotes[idx] = updated;

    applyFilters();
    // Re-highlight active note
    document.querySelectorAll('.note-item').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.id) === activeNoteId);
    });

    markSaved();
    updateToast(st, 'Note saved ✓', 'success');
  } catch (err) {
    updateToast(st, err.message, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

/* ================================
   DELETE NOTE
   ================================ */
async function deleteNote() {
  if (!activeNoteId) return;
  if (!confirm('Delete this note? This cannot be undone.')) return;

  const dt = showToast('Deleting note...', 'loading', 0);
  try {
    await apiFetch(`/api/notes/${activeNoteId}`, { method: 'DELETE' });

    allNotes = allNotes.filter(n => n.id !== activeNoteId);
    activeNoteId = null;

    applyFilters();
    showWelcome();
    updateToast(dt, 'Note deleted', 'info');
  } catch (err) {
    updateToast(dt, err.message, 'error');
  }
}

/* ================================
   UNSAVED INDICATOR
   ================================ */
function markUnsaved() {
  isUnsaved = true;
  const indicator = document.getElementById('save-indicator');
  const text      = document.getElementById('save-text');
  if (indicator) indicator.className = 'save-indicator';
  if (text)      text.textContent = 'Unsaved';
  updateWordCount();
}

function markSaved() {
  isUnsaved = false;
  const indicator = document.getElementById('save-indicator');
  const text      = document.getElementById('save-text');
  if (indicator) indicator.className = 'save-indicator saved';
  if (text)      text.textContent = 'Saved';
}

function onTagChange() {
  markUnsaved();
}

// ---- Global Shortcuts ----
document.addEventListener('keydown', (e) => {
  // Ctrl+S to save
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (activeNoteId) saveNote();
  }
  
  // Ctrl+K for Command Palette
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    toggleCommandPalette();
  }

  // Escape to close palette
  if (e.key === 'Escape') {
    closeCommandPalette();
  }
});

// Warn before leaving with unsaved changes
window.addEventListener('beforeunload', (e) => {
  if (isUnsaved) {
    e.preventDefault();
    e.returnValue = '';
  }
});

/* ================================
   COMMAND PALETTE LOGIC
   ================================ */
const COMMANDS = [
  { id: 'new-note', title: 'Create New Note', icon: '📝', action: () => createNewNote() },
  { id: 'go-chat',  title: 'Ask NeuroVault (AI Chat)',   icon: '✨', action: () => switchView('chat') },
  { id: 'go-notes', title: 'Go to My Notes',    icon: '📚', action: () => switchView('notes') },
  { id: 'search',   title: 'Search All Notes',  icon: '🔍', action: () => focusSidebarSearch() },
  { id: 'upload',   title: 'Upload PDF Document', icon: '📄', action: () => pdfFileInput.click() },
  { id: 'logout',   title: 'Sign Out / Logout', icon: '🚪', action: () => handleLogout() }
];

let selectedCmdIndex = 0;
let filteredCmds = [...COMMANDS];

function toggleCommandPalette() {
  const palette = document.getElementById('cmd-palette');
  const input = document.getElementById('cmd-input');
  
  if (palette.style.display === 'none') {
    palette.style.display = 'grid';
    input.value = '';
    input.focus();
    filterCommands('');
    
    // palette input events
    input.addEventListener('input', (e) => filterCommands(e.target.value));
    input.addEventListener('keydown', handleCmdKeydown);
  } else {
    closeCommandPalette();
  }
}

function closeCommandPalette() {
  const palette = document.getElementById('cmd-palette');
  if (palette) palette.style.display = 'none';
}

function filterCommands(query) {
  const q = query.toLowerCase().trim();
  filteredCmds = COMMANDS.filter(c => c.title.toLowerCase().includes(q));
  selectedCmdIndex = 0;
  renderCmdResults();
}

function renderCmdResults() {
  const container = document.getElementById('cmd-results');
  container.innerHTML = '';
  
  if (filteredCmds.length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;">No commands found</div>';
    return;
  }
  
  filteredCmds.forEach((cmd, index) => {
    const div = document.createElement('div');
    div.className = `cmd-item ${index === selectedCmdIndex ? 'selected' : ''}`;
    div.innerHTML = `
      <div class="cmd-item-main">
        <div class="cmd-item-icon">${cmd.icon}</div>
        <span class="cmd-item-title">${cmd.title}</span>
      </div>
      <div class="cmd-item-shortcut">Enter</div>
    `;
    div.onclick = () => executeCommand(cmd);
    container.appendChild(div);
  });
  
  // Scroll into view
  const selected = container.querySelector('.selected');
  if (selected) selected.scrollIntoView({ block: 'nearest' });
}

function handleCmdKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedCmdIndex = (selectedCmdIndex + 1) % filteredCmds.length;
    renderCmdResults();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedCmdIndex = (selectedCmdIndex - 1 + filteredCmds.length) % filteredCmds.length;
    renderCmdResults();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (filteredCmds[selectedCmdIndex]) {
      executeCommand(filteredCmds[selectedCmdIndex]);
    }
  }
}

function executeCommand(cmd) {
  closeCommandPalette();
  cmd.action();
}

function focusSidebarSearch() {
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    if (typeof switchView === 'function') switchView('notes');
    setTimeout(() => searchInput.focus(), 100);
  }
}


/* ================================
   LOGOUT
   ================================ */
function handleLogout() {
  localStorage.removeItem('nv_token');
  localStorage.removeItem('nv_user');
  window.location.href = '/';
}

/* ================================
   TOAST
   ================================ */
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return null;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icon = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    loading: '<div class="spinner-toast"></div>'
  }[type] || 'ℹ';

  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-content">${message}</div>
  `;
  
  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => dismissToast(toast), duration);
  }

  return toast;
}

function updateToast(toast, message, type, duration = 3000) {
  if (!toast) return;
  toast.className = `toast ${type}`;
  const icon = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    loading: '<div class="spinner-toast"></div>'
  }[type] || 'ℹ';
  
  toast.querySelector('.toast-icon').innerHTML = icon;
  toast.querySelector('.toast-content').textContent = message;

  if (duration > 0) {
    setTimeout(() => dismissToast(toast), duration);
  }
}

function dismissToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.classList.add('removing');
  setTimeout(() => toast.remove(), 300);
}


/* ================================
   UTILITIES
   ================================ */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'Z');
  const now = new Date();
  const diff = (now - d) / 1000;

  if (diff < 60)         return 'just now';
  if (diff < 3600)       return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)      return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7)  return `${Math.floor(diff / 86400)}d ago`;

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ================================
   INLINE AI EDITOR FEATURE
   ================================ */
let inlineSelectionText = '';
let aiToolbarEl = null;
let aiResultPopoverEl = null;

document.addEventListener('DOMContentLoaded', () => {
  const editorPath = document.getElementById('note-content');
  if (!editorPath) return;

  // Add the toolbar element
  aiToolbarEl = document.createElement('div');
  aiToolbarEl.className = 'inline-ai-toolbar';
  aiToolbarEl.style.display = 'none';
  aiToolbarEl.innerHTML = `
    <button onclick="handleInlineAi('improve')">✨ Improve</button>
    <button onclick="handleInlineAi('summarize')">📝 Summarize</button>
    <button onclick="handleInlineAi('explain')">💡 Explain</button>
  `;
  document.body.appendChild(aiToolbarEl);

  // Add the result popover element
  aiResultPopoverEl = document.createElement('div');
  aiResultPopoverEl.className = 'inline-ai-result-popover';
  aiResultPopoverEl.style.display = 'none';
  aiResultPopoverEl.innerHTML = `
    <div class="result-body" id="inline-ai-result-text"></div>
    <div class="result-actions">
      <button class="btn-primary-sm" onclick="applyInlineAiResult()">Replace Selection</button>
      <button class="btn-secondary-sm" onclick="closeInlineAiResult()">Cancel</button>
    </div>
  `;
  document.body.appendChild(aiResultPopoverEl);

  editorPath.addEventListener('mouseup', checkSelection);
  editorPath.addEventListener('keyup', checkSelection);
  
  // click outside to close
  document.addEventListener('mousedown', (e) => {
    if (aiToolbarEl && aiToolbarEl.style.display === 'flex' && !aiToolbarEl.contains(e.target) && e.target !== editorPath) {
      aiToolbarEl.style.display = 'none';
    }
  });
});

function checkSelection(e) {
  const elem = e.target;
  const start = elem.selectionStart;
  const end = elem.selectionEnd;

  if (start !== end) {
    const text = elem.value.substring(start, end);
    if (text.trim().length > 5) {
      inlineSelectionText = text;
      // Get rough coordinates from text area
      const rect = elem.getBoundingClientRect();
      aiToolbarEl.style.left = (rect.left + rect.width / 2 - 120) + 'px';
      aiToolbarEl.style.top = (rect.top + 10) + 'px';
      aiToolbarEl.style.display = 'flex';
      return;
    }
  }
  
  // Hide if no selection
  if (aiToolbarEl) aiToolbarEl.style.display = 'none';
}

async function handleInlineAi(action) {
  aiToolbarEl.style.display = 'none';
  if (!inlineSelectionText) return;

  // Show loading
  aiResultPopoverEl.style.display = 'flex';
  aiResultPopoverEl.style.left = aiToolbarEl.style.left;
  aiResultPopoverEl.style.top = aiToolbarEl.style.top;
  document.getElementById('inline-ai-result-text').innerHTML = '<span class="loading-pulse">Thinking...</span>';

  try {
    const res = await fetch('/api/chat/inline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ action, text: inlineSelectionText })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    document.getElementById('inline-ai-result-text').innerHTML = String(data.answer).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\\n/g, '<br/>');
    // Store it globally to apply later
    aiResultPopoverEl.dataset.result = data.answer;
  } catch (err) {
    document.getElementById('inline-ai-result-text').innerHTML = '<span class="error-text">Failed to generate AI response.</span>';
  }
}

function applyInlineAiResult() {
  const result = aiResultPopoverEl.dataset.result;
  const elem = document.getElementById('note-content');
  if (!elem || !result) return;

  const start = elem.selectionStart;
  const end = elem.selectionEnd;
  
  const val = elem.value;
  elem.value = val.substring(0, start) + result + val.substring(end);
  
  closeInlineAiResult();
  markUnsaved();
}

function closeInlineAiResult() {
  if (aiResultPopoverEl) {
    aiResultPopoverEl.style.display = 'none';
    aiResultPopoverEl.dataset.result = '';
  }
}

/* ================================
   MARKDOWN ENGINE
   ================================ */

/**
 * Lightweight dependency-free markdown → HTML renderer.
 * Supports: headings, bold, italic, strikethrough, inline code,
 * code blocks, blockquotes, ul, ol, task lists, HR, auto-links.
 */
function renderMarkdown(raw) {
  if (!raw) return '<p class="prose-empty">No content yet. Switch to Edit mode to start writing.</p>';

  let html = '';
  const lines = raw.split('\n');
  let i = 0;

  // Helpers
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Inline formatting: bold, italic, strikethrough, code, links
  function inlineFormat(text) {
    // Escape HTML first so we don't double-encode
    let s = esc(text);
    // Code (must be first to protect content from other formatting)
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
    // Italic
    s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    s = s.replace(/_([^_\n]+)_/g, '<em>$1</em>');
    // Strikethrough
    s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
    // Auto-links
    s = s.replace(/(https?:\/\/[^\s<>"']+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    return s;
  }

  // Process code blocks first (``` ... ```)
  function processLine(line) {
    return line;
  }

  const result = [];
  let inCodeBlock = false;
  let codeLang = '';
  let codeLines = [];
  let inUl = false;
  let inOl = false;
  let inTaskList = false;

  function closeLists() {
    if (inUl)       { result.push('</ul>'); inUl = false; }
    if (inOl)       { result.push('</ol>'); inOl = false; }
    if (inTaskList) { result.push('</ul>'); inTaskList = false; }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // --- CODE BLOCK ---
    if (!inCodeBlock && /^```/.test(line)) {
      closeLists();
      inCodeBlock = true;
      codeLang = line.slice(3).trim();
      codeLines = [];
      continue;
    }
    if (inCodeBlock) {
      if (/^```/.test(line)) {
        inCodeBlock = false;
        result.push(`<pre><code>${esc(codeLines.join('\n'))}</code></pre>`);
        codeLines = [];
      } else {
        codeLines.push(line);
      }
      continue;
    }

    // --- HEADINGS ---
    if (/^#{1}\s/.test(line)) {
      closeLists();
      result.push(`<h1>${inlineFormat(line.slice(2))}</h1>`);
      continue;
    }
    if (/^#{2}\s/.test(line)) {
      closeLists();
      result.push(`<h2>${inlineFormat(line.slice(3))}</h2>`);
      continue;
    }
    if (/^#{3}\s/.test(line)) {
      closeLists();
      result.push(`<h3>${inlineFormat(line.slice(4))}</h3>`);
      continue;
    }
    if (/^#{4}\s/.test(line)) {
      closeLists();
      result.push(`<h4 style="font-size:1rem;font-weight:600;margin:var(--space-4) 0 var(--space-2);">${inlineFormat(line.slice(5))}</h4>`);
      continue;
    }

    // --- HORIZONTAL RULE ---
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      closeLists();
      result.push('<hr>');
      continue;
    }

    // --- BLOCKQUOTE ---
    if (/^>\s?/.test(line)) {
      closeLists();
      result.push(`<blockquote><p>${inlineFormat(line.replace(/^>\s?/, ''))}</p></blockquote>`);
      continue;
    }

    // --- TASK LIST ---
    const taskMatch = line.match(/^[-*]\s\[(x| )\]\s(.*)/);
    if (taskMatch) {
      if (!inTaskList) {
        closeLists();
        result.push('<ul style="list-style:none;padding-left:0;">');
        inTaskList = true;
      }
      const checked = taskMatch[1] === 'x';
      const doneClass = checked ? ' class="task-item done"' : ' class="task-item"';
      result.push(`<li${doneClass}><input type="checkbox" ${checked ? 'checked' : ''} onclick="return false;"><span>${inlineFormat(taskMatch[2])}</span></li>`);
      continue;
    }

    // --- UNORDERED LIST ---
    if (/^[-*]\s/.test(line)) {
      if (inTaskList) { result.push('</ul>'); inTaskList = false; }
      if (inOl) { result.push('</ol>'); inOl = false; }
      if (!inUl) { result.push('<ul>'); inUl = true; }
      result.push(`<li>${inlineFormat(line.replace(/^[-*]\s/, ''))}</li>`);
      continue;
    }

    // --- ORDERED LIST ---
    if (/^\d+\.\s/.test(line)) {
      if (inTaskList) { result.push('</ul>'); inTaskList = false; }
      if (inUl) { result.push('</ul>'); inUl = false; }
      if (!inOl) { result.push('<ol>'); inOl = true; }
      result.push(`<li>${inlineFormat(line.replace(/^\d+\.\s/, ''))}</li>`);
      continue;
    }

    // --- BLANK LINE ---
    if (line.trim() === '') {
      closeLists();
      result.push('');
      continue;
    }

    // --- PARAGRAPH ---
    closeLists();
    result.push(`<p>${inlineFormat(line)}</p>`);
  }

  // Close any open blocks
  if (inCodeBlock) {
    result.push(`<pre><code>${esc(codeLines.join('\n'))}</code></pre>`);
  }
  closeLists();

  return result.join('\n') || '<p class="prose-empty">No content yet.</p>';
}

/**
 * Strip markdown tokens from text (for sidebar preview)
 */
function stripMarkdown(raw) {
  if (!raw) return '';
  return raw
    .replace(/```[\s\S]*?```/g, '')   // code blocks
    .replace(/`[^`]+`/g, '')          // inline code
    .replace(/^#{1,6}\s+/gm, '')      // headings
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')     // italic
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')     // strikethrough
    .replace(/^[-*]\s\[.\]\s/gm, '') // task items
    .replace(/^[-*]\s/gm, '')        // ul
    .replace(/^\d+\.\s/gm, '')       // ol
    .replace(/^>\s?/gm, '')          // blockquote
    .replace(/^---+$/gm, '')         // hr
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/\n+/g, ' ')
    .trim();
}

/* ================================
   PREVIEW MODE LOGIC
   ================================ */
let editorMode = 'edit'; // 'edit' | 'preview'
let previewDebounceTimer = null;

function setEditorMode(mode) {
  editorMode = mode;
  const textarea = document.getElementById('note-content');
  const preview = document.getElementById('note-preview-pane');
  const editBtn = document.getElementById('edit-mode-btn');
  const previewBtn = document.getElementById('preview-mode-btn');

  if (mode === 'preview') {
    if (textarea) textarea.style.display = 'none';
    if (preview) {
      preview.style.display = 'block';
      renderPreviewPane();
    }
    if (editBtn) editBtn.classList.remove('active');
    if (previewBtn) previewBtn.classList.add('active');
  } else {
    if (textarea) textarea.style.display = 'block';
    if (preview) preview.style.display = 'none';
    if (editBtn) editBtn.classList.add('active');
    if (previewBtn) previewBtn.classList.remove('active');
    if (textarea) textarea.focus();
  }
}

function renderPreviewPane() {
  const textarea = document.getElementById('note-content');
  const preview = document.getElementById('note-preview-pane');
  if (!textarea || !preview) return;
  preview.innerHTML = renderMarkdown(textarea.value);
}

function debouncedPreviewRender() {
  if (editorMode !== 'preview') return;
  clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(renderPreviewPane, 200);
}

/* ================================
   FORMATTING TOOLBAR LOGIC
   ================================ */

/**
 * Insert or wrap selected text with a markdown token.
 * `format` is one of: h1, h2, h3, bold, italic, strike,
 *   ul, ol, task, code, codeblock, quote, hr
 */
function insertFormat(format) {
  const ta = document.getElementById('note-content');
  if (!ta) return;

  // If in preview mode, switch to edit first
  if (editorMode === 'preview') setEditorMode('edit');

  ta.focus();
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const sel   = ta.value.substring(start, end);
  const before = ta.value.substring(0, start);
  const after  = ta.value.substring(end);

  // Find whether cursor is at the start of a line
  const lineStart = before.lastIndexOf('\n') + 1;
  const currentLine = before.substring(lineStart) + sel;

  let replacement = '';
  let newCursorOffset = 0;

  switch (format) {
    case 'h1':
      replacement = wrapLine(before, sel, after, ta, '# '); return;
    case 'h2':
      replacement = wrapLine(before, sel, after, ta, '## '); return;
    case 'h3':
      replacement = wrapLine(before, sel, after, ta, '### '); return;

    case 'bold':
      if (sel) {
        replacement = `**${sel}**`;
        newCursorOffset = replacement.length;
      } else {
        replacement = '**bold text**';
        newCursorOffset = 2; // place cursor after **
      }
      break;

    case 'italic':
      if (sel) {
        replacement = `*${sel}*`;
        newCursorOffset = replacement.length;
      } else {
        replacement = '*italic text*';
        newCursorOffset = 1;
      }
      break;

    case 'strike':
      if (sel) {
        replacement = `~~${sel}~~`;
        newCursorOffset = replacement.length;
      } else {
        replacement = '~~strikethrough~~';
        newCursorOffset = 2;
      }
      break;

    case 'code':
      if (sel) {
        replacement = `\`${sel}\``;
        newCursorOffset = replacement.length;
      } else {
        replacement = '`code`';
        newCursorOffset = 1;
      }
      break;

    case 'codeblock': {
      const block = sel || 'code here';
      replacement = `\`\`\`\n${block}\n\`\`\``;
      newCursorOffset = 4;
      break;
    }

    case 'ul':
      replacement = wrapLine(before, sel, after, ta, '- '); return;

    case 'ol':
      replacement = wrapLine(before, sel, after, ta, '1. '); return;

    case 'task':
      replacement = wrapLine(before, sel, after, ta, '- [ ] '); return;

    case 'quote':
      replacement = wrapLine(before, sel, after, ta, '> '); return;

    case 'hr':
      replacement = '\n\n---\n\n';
      newCursorOffset = replacement.length;
      break;

    default:
      return;
  }

  ta.value = before + replacement + after;
  const newPos = start + newCursorOffset;
  ta.selectionStart = newPos;
  ta.selectionEnd   = newPos;
  markUnsaved();
  debouncedPreviewRender();
}

/**
 * Helper to prefix the current line (or selected lines) with a token.
 * Handles multi-line selections elegantly.
 */
function wrapLine(before, sel, after, ta, prefix) {
  const fullText = ta.value;
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;

  // Find the start of the first selected line
  const lineStart = fullText.lastIndexOf('\n', start - 1) + 1;

  let selectedBlock = fullText.substring(lineStart, end);
  const prefixed = selectedBlock.split('\n').map(l => prefix + l).join('\n');

  ta.value = fullText.substring(0, lineStart) + prefixed + fullText.substring(end);
  ta.selectionStart = lineStart + prefix.length;
  ta.selectionEnd   = lineStart + prefixed.length;
  markUnsaved();
  debouncedPreviewRender();
}

// ---- Keyboard shortcuts for formatting ----
document.addEventListener('keydown', (e) => {
  const ta = document.getElementById('note-content');
  const inEditor = document.activeElement === ta;
  if (!inEditor) return;

  // Bold: Ctrl+B
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
    e.preventDefault();
    insertFormat('bold');
  }
  // Italic: Ctrl+I
  if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
    e.preventDefault();
    insertFormat('italic');
  }
  // Code: Ctrl+`
  if ((e.ctrlKey || e.metaKey) && e.key === '`') {
    e.preventDefault();
    insertFormat('code');
  }
  // H1: Ctrl+1
  if ((e.ctrlKey || e.metaKey) && e.key === '1') {
    e.preventDefault();
    insertFormat('h1');
  }
  // H2: Ctrl+2
  if ((e.ctrlKey || e.metaKey) && e.key === '2') {
    e.preventDefault();
    insertFormat('h2');
  }
  // H3: Ctrl+3
  if ((e.ctrlKey || e.metaKey) && e.key === '3') {
    e.preventDefault();
    insertFormat('h3');
  }
}, true); // capture phase so it fires before the global Ctrl+S

/* ================================
   NEW UTILITY FUNCTIONS
   ================================ */

/**
 * Toggles favorite status for the currently active note
 */
async function toggleActiveNoteFavorite() {
  if (!activeNoteId) return;
  
  const favBtn = document.getElementById('favorite-toggle-btn');
  const isCurrentlyFav = favBtn && favBtn.classList.contains('active');
  
  const nt = showToast(isCurrentlyFav ? 'Removing from favorites...' : 'Adding to favorites...', 'loading', 0);
  
  try {
    const data = await apiFetch(`/api/notes/${activeNoteId}/favorite`, {
      method: 'PATCH'
    });
    
    // Update local state
    const idx = allNotes.findIndex(n => n.id === activeNoteId);
    if (idx !== -1) {
      allNotes[idx].is_favorite = data.is_favorite;
    }
    
    // Update UI
    if (favBtn) favBtn.classList.toggle('active', data.is_favorite === 1);
    
    // Refresh list and keep editor open
    applyFilters();
    updateToast(nt, data.is_favorite ? 'Added to favorites ⭐' : 'Removed from favorites', 'success');
  } catch (err) {
    updateToast(nt, err.message, 'error');
  }
}

/**
 * Deletes the user account after confirmation
 */
async function handleAccountDeletion() {
  const confirmed = confirm('DANGER: This will permanently delete your account and all your notes. This cannot be undone. Proceed?');
  if (!confirmed) return;
  
  const dt = showToast('Deleting account...', 'loading', 0);
  try {
    await apiFetch('/api/auth/profile', { method: 'DELETE' });
    updateToast(dt, 'Account deleted. Redirecting...', 'success');
    
    setTimeout(() => {
      localStorage.clear();
      window.location.href = '/';
    }, 1500);
  } catch (err) {
    updateToast(dt, err.message, 'error');
  }
}

/**
 * Interface with chat.js to clear session history
 */
function clearChatMessages() {
  if (confirm('Clear current chat history?')) {
    if (typeof clearChat === 'function') {
      clearChat();
      showToast('Chat history cleared', 'info');
    }
  }
}
