/* ================================
   AUTH PAGE JAVASCRIPT
   ================================ */
'use strict';

// Redirect to dashboard if already logged in
(function() {
  const token = localStorage.getItem('nv_token');
  if (token) window.location.href = '/dashboard.html';
})();

/* -------- Tab switching -------- */
function switchTab(tab) {
  const loginForm    = document.getElementById('form-login');
  const registerForm = document.getElementById('form-register');
  const tabLogin     = document.getElementById('tab-login');
  const tabRegister  = document.getElementById('tab-register');

  if (tab === 'login') {
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
  } else {
    registerForm.classList.add('active');
    loginForm.classList.remove('active');
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
  }
}

/* -------- Toast notifications -------- */
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

function dismissToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.classList.add('removing');
  setTimeout(() => toast.remove(), 300);
}


/* -------- Set loading state -------- */
function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (loading) {
    btn.disabled = true;
    btn.dataset.origText = btn.textContent;
    btn.innerHTML = '<div class="spinner"></div> Loading…';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.origText || 'Submit';
  }
}

/* -------- Login handler -------- */
async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  setLoading('login-submit', true);
  try {
    const res  = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Login failed');

    localStorage.setItem('nv_token', data.token);
    localStorage.setItem('nv_user', JSON.stringify(data.user));
    showToast('Welcome back! 🎉', 'success');
    setTimeout(() => { window.location.href = '/dashboard.html'; }, 600);
  } catch (err) {
    showToast(err.message, 'error');
    setLoading('login-submit', false);
  }
}

/* -------- Register handler -------- */
async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('reg-username').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;

  if (password.length < 6) {
    showToast('Password must be at least 6 characters', 'error');
    return;
  }

  setLoading('register-submit', true);
  try {
    const res  = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Registration failed');

    localStorage.setItem('nv_token', data.token);
    localStorage.setItem('nv_user', JSON.stringify(data.user));
    showToast('Vault created! Redirecting…', 'success');
    setTimeout(() => { window.location.href = '/dashboard.html'; }, 600);
  } catch (err) {
    showToast(err.message, 'error');
    setLoading('register-submit', false);
  }
}
