'use strict';
/* boot: tabs, status bar, theme, undo, toasts; pages register render functions */
const Pages = {};      // id → { init(), render() }
function $(id) { return document.getElementById(id); }
function el(tag, attrs, children) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null) e.setAttribute(k, v);
  }
  (children || []).forEach(c => e.append(c));
  return e;
}
function toast(msg, kind) {
  const t = el('div', { class: `toast ${kind || ''}`, text: msg });
  $('toasts').append(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
}
function fmtPct(x) { return `${Math.round(x * 100)}%`; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) { const ta = el('textarea', { style: 'position:fixed;left:-9999px' }); ta.value = text; document.body.append(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; }
}

function showTab(id) {
  document.querySelectorAll('.page').forEach(p => p.hidden = p.id !== `page-${id}`);
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === id));
  Store.update(s => { s.ui.tab = id; }, { record: false, silent: true });
  if (Pages[id]) Pages[id].render();
}
function renderStatus() {
  const s = Store.state, inc = Store.included();
  const labelled = inc.filter(x => (x.values.condition || '').trim()).length;
  const v = validateProject(s);
  $('stSamples').textContent = `${inc.length} sample${inc.length === 1 ? '' : 's'}` + (s.samples.length !== inc.length ? ` (${s.samples.length - inc.length} excluded)` : '');
  $('stLabelled').textContent = `${labelled}/${inc.length} labelled`;
  $('stConditions').textContent = `${v.replicates.size} condition${v.replicates.size === 1 ? '' : 's'}`;
  const iss = $('stIssues');
  iss.textContent = v.errors ? `${v.errors} error${v.errors > 1 ? 's' : ''}` : v.warnings ? `${v.warnings} warning${v.warnings > 1 ? 's' : ''}` : 'ready to export';
  iss.className = 'st ' + (v.errors ? 'err' : v.warnings ? 'warn' : 'ok');
  $('btnUndo').disabled = Store.history.length === 0;
}
function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', mode);
  $('btnTheme').textContent = mode === 'system' ? 'Theme: auto' : mode === 'dark' ? 'Theme: dark' : 'Theme: light';
}

document.addEventListener('DOMContentLoaded', () => {
  Store.init();
  Object.values(Pages).forEach(p => p.init && p.init());
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
  $('btnUndo').addEventListener('click', () => { if (Store.undo()) toast('Undone'); });
  $('btnReset').addEventListener('click', () => { if (confirm('Clear all samples, plates and columns? (Undo is available)')) { Store.reset(); toast('Project cleared'); } });
  $('btnTheme').addEventListener('click', () => { const order = ['system', 'light', 'dark']; const next = order[(order.indexOf(Store.state.ui.theme) + 1) % 3]; Store.update(s => { s.ui.theme = next; }, { record: false, silent: true }); applyTheme(next); });
  applyTheme(Store.state.ui.theme || 'system');
  Store.subscribe(() => { renderStatus(); const id = Store.state.ui.tab; if (Pages[id]) Pages[id].render(); });
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.target.matches('input,textarea,[contenteditable]')) { e.preventDefault(); Store.undo(); } });
  showTab(Store.state.ui.tab || 'samples');
  renderStatus();
});
