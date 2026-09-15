'use strict';
/* 2 · Table — editable sample × metadata grid, tokenizer, rule fill, validation. */
(() => {
  const sel = new Set();
  let lastClick = null, sortCol = null, sortDir = 1, tokenRoles = null, tokenOpen = false, ruleOpen = false;
  const ROLE_OPTIONS = ['', 'condition', 'replicate', 'dose', 'batch', 'timepoint', 'treatment', 'cell_line', '__new__'];

  function visibleSamples() {
    const s = Store.state, q = ($('inpFilter').value || '').toLowerCase(), showEx = $('chkShowExcluded').checked;
    let rows = s.samples.filter(x => (showEx || x.include) && (!q || x.name.toLowerCase().includes(q) || Object.values(x.values).some(v => String(v).toLowerCase().includes(q))));
    if (sortCol) {
      const key = x => sortCol === 'sample' ? x.name : sortCol === 'well' ? (Store.placementOf(x.id) || { well: 'ZZ' }).well : (x.values[sortCol] || '');
      rows = rows.slice().sort((a, b) => { const ka = key(a), kb = key(b); const na = parseFloat(ka), nb = parseFloat(kb); const c = (!isNaN(na) && !isNaN(nb)) ? na - nb : String(ka).localeCompare(String(kb), undefined, { numeric: true }); return c * sortDir; });
    }
    return rows;
  }
  function renderGrid() {
    const s = Store.state, rows = visibleSamples(), plates = s.plates.length > 1;
    const th = (label, col, removable) => `<th><button data-sort="${col}">${escapeHtml(label)}${sortCol === col ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</button>${removable ? `<button class="rm" data-rmcol="${escapeHtml(col)}" title="remove column">×</button>` : ''}</th>`;
    const head = `<thead><tr><th class="num">#</th><th>✓</th>${th('sample', 'sample')}<th>type</th>${s.columns.map(c => th(c, c, c !== 'condition')).join('')}${th('well', 'well')}</tr></thead>`;
    const body = rows.map((x, i) => {
      const pl = Store.placementOf(x.id);
      const cells = s.columns.map(c => { const v = x.values[c] == null ? '' : x.values[c]; const bad = c === 'condition' && x.include && !String(v).trim(); const sw = c === 'condition' && v ? `<span class="cond-sw" style="background:${Store.colorFor(v)}"></span>` : ''; return `<td style="white-space:nowrap">${sw}<input class="cell${bad ? ' bad' : ''}" data-id="${x.id}" data-col="${escapeHtml(c)}" value="${escapeHtml(v)}" ${c === 'condition' ? 'list="condList"' : ''} style="${sw ? 'width:calc(100% - 1rem)' : ''}"></td>`; }).join('');
      return `<tr data-id="${x.id}" class="${sel.has(x.id) ? 'selected' : ''}${x.include ? '' : ' excluded'}"><td class="num" data-idx="${i}">${i + 1}</td><td><input type="checkbox" class="inc" ${x.include ? 'checked' : ''}></td><td class="name">${escapeHtml(x.name)}</td><td><span class="badge ${x.type}">${x.type}</span></td>${cells}<td class="well">${pl ? `${plates ? pl.plate + ':' : ''}${pl.well}` : ''}</td></tr>`;
    }).join('');
    $('grid').innerHTML = rows.length ? head + `<tbody>${body}</tbody>` : `<tr><td class="empty">${s.samples.length ? 'No rows match the filter.' : 'No samples yet — import them on the Samples tab.'}</td></tr>`;
    $('selCount').textContent = sel.size;
  }
  function renderChecks() {
    const v = validateProject(Store.state);
    $('validationPanel').innerHTML = v.findings.length ? v.findings.map((f, i) => `<div class="finding ${f.level}" data-i="${i}"><span class="lvl">${f.level}</span><div><div class="msg">${escapeHtml(f.message)}</div><span class="hint">${escapeHtml(f.hint)}</span></div></div>`).join('') : '<div class="hint">No issues. Every included sample has a condition.</div>';
    $('validationPanel').onclick = e => { const el = e.target.closest('.finding'); if (!el) return; const f = v.findings[+el.dataset.i]; if (f.target && f.target.ids) { sel.clear(); f.target.ids.forEach(id => sel.add(id)); $('chkShowExcluded').checked = true; renderGrid(); } else if (f.target && f.target.samples) { sel.clear(); Store.state.samples.filter(x => f.target.samples.includes(x.name)).forEach(x => sel.add(x.id)); renderGrid(); } };
    $('replicatePanel').innerHTML = [...v.replicates.entries()].map(([c, n]) => `<span class="chip" style="cursor:default"><span class="sw" style="background:${Store.colorFor(c)}"></span>${escapeHtml(c)} <span class="cnt">n=${n}</span></span>`).join('') || '<span class="hint">—</span>';
  }
  function renderToolbar() {
    const s = Store.state;
    const cur = $('selFillColumn').value;
    $('selFillColumn').innerHTML = s.columns.map(c => `<option${c === cur ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');
    $('condList').innerHTML = Store.conditions().map(c => `<option value="${escapeHtml(c)}">`).join('');
  }

  /* ---- tokenizer ---- */
  function renderTokens() {
    const p = $('tokenPanel'); p.hidden = !tokenOpen; if (!tokenOpen) return;
    const s = Store.state, names = Store.included().map(x => x.name);
    if (!names.length) { p.innerHTML = '<div class="hint">Nothing to split — no included samples.</div>'; return; }
    const tt = tokenTable(names, s.options.delimiter);
    if (!tokenRoles) tokenRoles = suggestRoles(tt);
    const preview = tt.rows.slice(0, 4).map(r => `<tr>${tt.cols.map(c => `<td class="${c.constant ? 'const' : 'vary'}">${escapeHtml(r[c.index] == null ? '' : r[c.index])}</td>`).join('')}</tr>`).join('');
    const roles = tt.cols.map(c => `<tr><th>${c.index + 1}</th><td class="${c.constant ? 'const' : 'vary'}">${c.constant ? escapeHtml(c.unique[0] || '∅') + ' <span class="hint">(constant)</span>' : `${c.unique.length} values: ${escapeHtml(c.unique.slice(0, 5).join(', '))}${c.unique.length > 5 ? '…' : ''}`}${c.isWell ? ' <span class="badge">well</span>' : ''}${c.quantity ? ' <span class="badge">quantity</span>' : ''}</td><td><select data-tok="${c.index}">${ROLE_OPTIONS.map(r => `<option value="${r}"${(tokenRoles[c.index] || '') === r ? ' selected' : ''}>${r === '' ? 'ignore' : r === '__new__' ? 'new column…' : r}</option>`).join('')}</select></td></tr>`).join('');
    p.innerHTML = `<h2>Split names on "${escapeHtml(s.options.delimiter)}"</h2><p class="hint">Constant tokens are greyed out. Varying tokens are proposed as metadata; adjust the roles and apply. Dose-like tokens (e.g. 1000ng) are split into a number and a unit column.</p>
      <div class="tablewrap" style="margin-bottom:.6rem"><table class="tokens"><thead><tr>${tt.cols.map(c => `<th>${c.index + 1}</th>`).join('')}</tr></thead><tbody>${preview}</tbody></table></div>
      <div class="tablewrap"><table class="tokens"><thead><tr><th>#</th><th>values</th><th>write to</th></tr></thead><tbody>${roles}</tbody></table></div>
      <div class="row" style="margin-top:.6rem"><button class="primary" id="btnTokApply">Apply to ${names.length} samples</button><button class="ghost" id="btnTokClose">Close</button></div>`;
    p.querySelectorAll('select[data-tok]').forEach(e => e.addEventListener('change', () => { let v = e.value; if (v === '__new__') { v = prompt('New column name'); if (!v || !COLUMN_NAME_RE.test(v)) { e.value = tokenRoles[+e.dataset.tok] || ''; return; } } tokenRoles[+e.dataset.tok] = v; renderTokens(); }));
    $('btnTokClose').addEventListener('click', () => { tokenOpen = false; tokenRoles = null; renderTokens(); });
    $('btnTokApply').addEventListener('click', () => {
      Store.update(st => {
        st.samples.forEach(x => {
          const toks = tokenize(x.name, st.options.delimiter);
          for (const [idx, role] of Object.entries(tokenRoles)) {
            if (!role) continue; const tok = toks[+idx]; if (tok == null) continue;
            if (role === 'dose') { const q = parseQuantity(tok); if (q) { Store.setValue(x.id, 'dose', String(q.value)); if (q.unit) Store.setValue(x.id, 'dose_unit', q.unit); } else Store.setValue(x.id, 'dose', tok); }
            else if (role === 'replicate') Store.setValue(x.id, 'replicate', String(parseInt(tok, 10)));
            else Store.setValue(x.id, role, tok);
          }
        });
        Store.conditions().forEach(c => Store.colorFor(c));
      });
      tokenOpen = false; tokenRoles = null; toast('Tokens applied', 'ok');
    });
  }
  /* ---- rules ---- */
  function renderRules() {
    const p = $('rulePanel'); p.hidden = !ruleOpen; if (!ruleOpen) return;
    const s = Store.state;
    const list = s.rules.map((r, i) => `<div class="row" style="justify-content:space-between;border-top:1px solid var(--line-2);padding:.3rem 0"><span class="mono">${r.type === 'regex' ? '/' + escapeHtml(r.pattern) + '/' : '"' + escapeHtml(r.pattern) + '"'} → ${escapeHtml(r.column)} = ${escapeHtml(r.value)}</span><span><button class="small" data-reapply="${i}">apply</button> <button class="small ghost" data-rmrule="${i}">×</button></span></div>`).join('');
    p.innerHTML = `<h2>Rule fill</h2><p class="hint">Match the sample name and write a value. For regex, capture groups are available as $1, $2… in the value (e.g. pattern <span class="mono">_(\\d+)min_</span>, value <span class="mono">$1</span>).</p>
      <div class="row"><select id="ruleType"><option value="contains">name contains</option><option value="regex">name matches regex</option></select>
      <input type="text" id="rulePattern" placeholder="withEGF" style="width:16ch"><span>→</span>
      <select id="ruleColumn">${s.columns.map(c => `<option>${escapeHtml(c)}</option>`).join('')}<option value="__new__">new column…</option></select>
      <span>=</span><input type="text" id="ruleValue" placeholder="EGF+" style="width:12ch" list="condList">
      <span class="hint" id="rulePreview"></span><button class="primary" id="btnRuleApply">Apply</button><button class="ghost" id="btnRuleClose">Close</button></div>
      ${list ? `<h3>Saved rules</h3>${list}` : ''}`;
    const preview = () => { const m = matchRule(readRule()); $('rulePreview').textContent = m ? `matches ${m.length} of ${s.samples.length}` : 'invalid pattern'; };
    ['ruleType', 'rulePattern'].forEach(id => $(id).addEventListener('input', preview));
    $('ruleColumn').addEventListener('change', e => { if (e.target.value === '__new__') { const v = prompt('New column name'); if (v && COLUMN_NAME_RE.test(v)) { Store.update(st => Store.addColumn(v)); ruleOpen = true; renderRules(); $('ruleColumn').value = v; } else e.target.value = 'condition'; } });
    $('btnRuleClose').addEventListener('click', () => { ruleOpen = false; renderRules(); });
    $('btnRuleApply').addEventListener('click', () => { const r = readRule(); if (!r.pattern) return; const m = matchRule(r); if (!m) { toast('Invalid regex', 'error'); return; } Store.update(st => { st.rules.push(r); applyRule(st, r); }); toast(`Rule applied to ${m.length} samples`, 'ok'); ruleOpen = true; });
    p.querySelectorAll('[data-reapply]').forEach(b => b.addEventListener('click', () => { const r = s.rules[+b.dataset.reapply]; Store.update(st => applyRule(st, r)); toast('Rule re-applied', 'ok'); }));
    p.querySelectorAll('[data-rmrule]').forEach(b => b.addEventListener('click', () => { Store.update(st => st.rules.splice(+b.dataset.rmrule, 1)); ruleOpen = true; }));
    preview();
  }
  const readRule = () => ({ type: $('ruleType').value, pattern: $('rulePattern').value, column: $('ruleColumn').value, value: $('ruleValue').value });
  function matchRule(r) {
    if (!r.pattern) return [];
    if (r.type === 'contains') return Store.state.samples.filter(x => x.name.includes(r.pattern));
    try { const re = new RegExp(r.pattern); return Store.state.samples.filter(x => re.test(x.name)); } catch (e) { return null; }
  }
  function applyRule(st, r) {
    const re = r.type === 'regex' ? new RegExp(r.pattern) : null;
    st.samples.forEach(x => {
      if (re) { const m = re.exec(x.name); if (!m) return; Store.setValue(x.id, r.column, r.value.replace(/\$(\d)/g, (_, g) => m[+g] == null ? '' : m[+g])); }
      else if (x.name.includes(r.pattern)) Store.setValue(x.id, r.column, r.value);
    });
    Store.conditions().forEach(c => Store.colorFor(c));
  }
  function autoReplicate() {
    Store.update(st => {
      const groups = new Map();
      Store.included().forEach(x => { const c = (x.values.condition || '').trim(); if (!c) return; if (!groups.has(c)) groups.set(c, []); groups.get(c).push(x); });
      const wellIdx = x => { const pl = Store.placementOf(x.id); return pl ? wellsRowWise().indexOf(pl.well) : 1000 + x.order; };
      groups.forEach(list => list.sort((a, b) => wellIdx(a) - wellIdx(b)).forEach((x, i) => Store.setValue(x.id, 'replicate', String(i + 1))));
    });
    toast('Replicates numbered', 'ok');
  }

  Pages.table = {
    init() {
      $('btnTokenizer').addEventListener('click', () => { tokenOpen = !tokenOpen; tokenRoles = null; ruleOpen = false; renderTokens(); renderRules(); });
      $('btnRules').addEventListener('click', () => { ruleOpen = !ruleOpen; tokenOpen = false; renderTokens(); renderRules(); });
      $('btnAddColumn').addEventListener('click', () => { const v = prompt('New column name (letters, digits, underscore)'); if (!v) return; if (!COLUMN_NAME_RE.test(v)) { toast('Use a plain identifier', 'error'); return; } Store.update(s => Store.addColumn(v)); });
      $('btnAutoReplicate').addEventListener('click', autoReplicate);
      $('btnFillSelected').addEventListener('click', () => { const col = $('selFillColumn').value, v = $('inpFillValue').value; if (!sel.size) { toast('Select rows first (click the row numbers, shift-click for a range)'); return; } Store.update(s => { sel.forEach(id => Store.setValue(id, col, v)); if (col === 'condition' && v) Store.colorFor(v); }); toast(`${sel.size} rows set`, 'ok'); });
      $('inpFilter').addEventListener('input', renderGrid);
      $('chkShowExcluded').addEventListener('change', renderGrid);
      const g = $('grid');
      g.addEventListener('change', e => {
        const tr = e.target.closest('tr'); if (!tr) return; const id = +tr.dataset.id;
        if (e.target.matches('input.cell')) { const col = e.target.dataset.col, v = e.target.value; Store.update(s => { Store.setValue(id, col, v); if (col === 'condition' && v.trim()) Store.colorFor(v.trim()); }); }
        else if (e.target.matches('.inc')) Store.update(s => { const x = Store.sampleById(id); if (x) x.include = e.target.checked; });
      });
      g.addEventListener('keydown', e => {
        if (!e.target.matches('input.cell')) return;
        if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); const tr = e.target.closest('tr'); const next = e.key === 'ArrowUp' ? tr.previousElementSibling : tr.nextElementSibling;
          if (next) { const inp = next.querySelector(`input.cell[data-col="${e.target.dataset.col}"]`); if (inp) { e.target.blur(); inp.focus(); inp.select(); } }
        }
      });
      g.addEventListener('click', e => {
        const sortBtn = e.target.closest('[data-sort]'); if (sortBtn) { const c = sortBtn.dataset.sort; if (sortCol === c) sortDir = -sortDir; else { sortCol = c; sortDir = 1; } renderGrid(); return; }
        const rm = e.target.closest('[data-rmcol]'); if (rm) { if (confirm(`Remove column "${rm.dataset.rmcol}" and its values?`)) Store.update(s => Store.removeColumn(rm.dataset.rmcol)); return; }
        const num = e.target.closest('td.num'); if (!num) return;
        const rows = visibleSamples(), idx = +num.dataset.idx, id = rows[idx].id;
        if (e.shiftKey && lastClick != null) { const [a, b] = [Math.min(lastClick, idx), Math.max(lastClick, idx)]; for (let i = a; i <= b; i++) sel.add(rows[i].id); }
        else if (sel.has(id)) sel.delete(id); else sel.add(id);
        lastClick = idx; renderGrid();
      });
    },
    render() { renderToolbar(); renderGrid(); renderChecks(); renderTokens(); renderRules(); },
  };
})();
