const fs = require('fs');
const path = require('path');

const cssFile = path.join('d:', 'Study', 'NeuroVault', 'public', 'css', 'dashboard.css');
let css = fs.readFileSync(cssFile, 'utf8');

// 1. Sidebar background
css = css.replace(/background: rgba\(24, 24, 27, 0\.4\);\s*backdrop-filter: blur\(24px\);\s*-webkit-backdrop-filter: blur\(24px\);/, 'background: var(--bg-base);');

// 2. Insights background
css = css.replace(/\.insights-panel\s*{[^}]*background: var\(--bg-surface\);/, match => match.replace('var(--bg-surface)', 'var(--bg-base)'));

// 3. Alignments and Padding
css = css.replace(/\.sidebar-header\s*{[^}]*padding: var\(--space-3\);/, match => match.replace('var(--space-3)', 'var(--space-4)'));
css = css.replace(/\.sidebar-section\s*{[^}]*padding: var\(--space-3\);/, match => match.replace('var(--space-3)', 'var(--space-4)'));
css = css.replace(/\.section-header\s*{[^}]*padding: var\(--space-3\) var\(--space-3\) var\(--space-1\);/, match => match.replace('var(--space-3) var(--space-3) var(--space-1)', 'var(--space-4) var(--space-4) var(--space-2)'));
css = css.replace(/\.notes-list\s*{[^}]*padding: 0 var\(--space-2\) var\(--space-3\) var\(--space-2\);/, match => match.replace('0 var(--space-2) var(--space-3) var(--space-2)', '0 var(--space-4) var(--space-4) var(--space-4)'));

// 4. Button consistency
css = css.replace(/\.sidebar-actions \.btn\s*{[^}]*}/, '.sidebar-actions .btn {\n  flex: 1;\n  height: 36px;\n  padding: 0 var(--space-3);\n  font-size: 13px;\n}');

// 5. Search bar glow
css = css.replace(/\.search-input-animated:focus\s*{[^}]*box-shadow: 0 0 0 3px var\(--color-primary-dim\);/, match => match.replace('box-shadow: 0 0 0 3px var(--color-primary-dim);', 'box-shadow: none;'));

// 6. Filters
css = css.replace(/\.tag-filters\s*{[^}]*gap: var\(--space-1\);/, match => match.replace('var(--space-1)', 'var(--space-2)'));
css = css.replace(/\.tag-filter-btn\s*{([^}]*)}/, (match, inner) => {
  if(!inner.includes('border:')) {
    return match.replace(/}$/, '  border: 1px solid transparent;\n}');
  }
  return match;
});
css = css.replace(/\.tag-filter-btn\.active\s*{[^}]*}/, '.tag-filter-btn.active {\n  background: var(--bg-elevated);\n  color: var(--text-primary);\n  border-color: var(--border-strong);\n}');

fs.writeFileSync(cssFile, css);

const jsFile = path.join('d:', 'Study', 'NeuroVault', 'public', 'js', 'dashboard.js');
let js = fs.readFileSync(jsFile, 'utf8');

// Update empty state HTML
const emptyStateRegex = /<div class="empty-sidebar error-state"[^>]*>[\s\S]*?<\/div>/;
const newEmptyState = `<div class="empty-sidebar error-state" style="padding: var(--space-4); text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: var(--space-3);">
          <div class="empty-icon" style="font-size: 18px; color: var(--text-muted); line-height: 1;">⚠️</div>
          <p style="color: var(--text-primary); font-size: 13px; font-weight: 400; margin: 0;">Connection Interrupted</p>
          <button class="btn btn-subtle" onclick="loadNotes()" style="height: 32px; padding: 0 var(--space-3); font-size: 11px;">Retry</button>
        </div>`;

js = js.replace(emptyStateRegex, newEmptyState);
fs.writeFileSync(jsFile, js);

console.log('UI Fixes Applied');
