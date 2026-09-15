'use strict';
/* 1 · Samples — import run names from a report (streamed), a queueMaker queue/layout CSV, an existing
   conditions table, or pasted text. */
(() => {
  let pendingFile = null;
  const EXAMPLE = [
    'V:\\Denys_nanoPhos\\PRIDE\\raw_data\\figure2\\20250729_OA4_Evo11_16p3min_DeOl_SA_nanoPhos_dilser_new_withEGF_1000ng_01.raw',
    'V:\\Denys_nanoPhos\\PRIDE\\raw_data\\figure2\\20250729_OA4_Evo11_16p3min_DeOl_SA_nanoPhos_dilser_new_withEGF_1000ng_02.raw',
    'V:\\Denys_nanoPhos\\PRIDE\\raw_data\\figure2\\20250729_OA4_Evo11_16p3min_DeOl_SA_nanoPhos_dilser_new_withEGF_1000ng_03.raw',
    'V:\\Denys_nanoPhos\\PRIDE\\raw_data\\figure2\\20250729_OA4_Evo11_16p3min_DeOl_SA_nanoPhos_dilser_new_woEGF_1000ng_01.raw',
    'V:\\Denys_nanoPhos\\PRIDE\\raw_data\\figure2\\20250729_OA4_Evo11_16p3min_DeOl_SA_nanoPhos_dilser_new_woEGF_1000ng_02.raw',
    'V:\\Denys_nanoPhos\\PRIDE\\raw_data\\figure2\\20250729_OA4_Evo11_16p3min_DeOl_SA_nanoPhos_dilser_new_woEGF_1000ng_03.raw',
  ];
  const opts = () => Store.state.options;
  const status = (msg, kind) => { const e = $('importStatus'); e.textContent = msg || ''; e.style.color = kind === 'error' ? 'var(--red)' : ''; };
  const progress = (frac) => { const p = $('importProgress'); if (frac == null) { p.hidden = true; return; } p.hidden = false; p.firstElementChild.style.width = fmtPct(frac); };

  function engineFromColumn(col) { if (!col) return null; if (/^R[._]FileName$/i.test(col)) return 'SN'; if (col === 'Run' || col === 'File.Name') return 'DIANN'; return null; }
  function addNames(rawNames, source, valuesFn) {
    const items = rawNames.map(r => r.trim()).filter(Boolean).map(r => { const name = normalizeName(r, opts()); return { raw: r, name, values: valuesFn ? valuesFn(r, name) : undefined }; });
    let n = 0;
    Store.update(s => { n = Store.addSamples(items, source); });
    toast(n ? `${n} run${n === 1 ? '' : 's'} added` : 'No new runs (all already present)', n ? 'ok' : '');
    return n;
  }

  async function handleFile(file) {
    pendingFile = null; $('colPicker').hidden = true; progress(null);
    if (/\.parquet$/i.test(file.name)) { status('Parquet cannot be read in the browser. Paste the run names instead (e.g. df["Run"].unique() in Python), or use the server-backed GUI later.', 'error'); return; }
    let head;
    try { head = await readHeaderLine(file); } catch (e) { status(`Could not read file: ${e.message}`, 'error'); return; }
    const cols = head.columns;
    // queueMaker plate-layout grid → active plate layout
    if (looksLikeLayoutGrid(cols)) {
      const res = parseLayoutGrid(await file.text());
      if (res.error) { status(res.error, 'error'); return; }
      Store.update(s => { const p = Store.activePlate(); Object.assign(p.layout, res.wells); Object.values(res.wells).forEach(c => Store.colorFor(c)); });
      status(`Layout imported: ${res.n} wells painted on plate ${Store.activePlate().id}.`); toast('Plate layout imported', 'ok'); return;
    }
    // queueMaker queue export → runs with rack + well
    const qfmt = detectQueueFormat(cols);
    if (qfmt) {
      const res = parseQueueCSV(await file.text());
      if (res.error) { status(res.error, 'error'); return; }
      const racks = [...new Set(res.entries.map(e => e.rack).filter(Boolean))];
      let n = 0;
      Store.update(s => {
        s.meta.source = 'queue'; s.meta.sourceFile = file.name;
        n = Store.addSamples(res.entries.map(e => ({ raw: e.name, name: normalizeName(e.name, opts()), type: e.type, well: e.well, plate: racks.length > 1 ? e.rack : null })), 'queue');
      });
      status(`${qfmt} queue: ${res.entries.length} rows, ${n} new runs, ${racks.length} rack${racks.length === 1 ? '' : 's'} (${racks.join(', ')}). Wells placed on ${racks.length > 1 ? 'one plate per rack' : 'the active plate'}.`);
      toast(`${n} runs imported from queue`, 'ok'); return;
    }
    // an existing conditions table (sample + condition + extras)
    if (cols.includes('sample') && cols.includes('condition')) {
      const { header, rows } = parseDelimited(await file.text());
      const si = header.indexOf('sample');
      const extras = header.filter(h => h !== 'sample' && h !== 'plate' && h !== 'well');
      let n = 0;
      Store.update(s => {
        n = Store.addSamples(rows.filter(r => (r[si] || '').trim()).map(r => { const v = {}; extras.forEach(c => { const x = r[header.indexOf(c)]; if (x != null && x !== '') v[c] = x; }); return { raw: r[si], name: normalizeName(r[si], opts()), values: v }; }), 'conditions');
        extras.forEach(c => Store.addColumn(c));
      });
      status(`Conditions table: ${rows.length} rows, ${n} new samples, columns ${extras.join(', ')}.`); toast('Conditions table imported', 'ok'); return;
    }
    // search-engine report → column picker, then stream
    pendingFile = file;
    const runGuess = guessColumn(cols, RUN_COLUMN_CANDIDATES), condGuess = guessColumn(cols, CONDITION_COLUMN_CANDIDATES);
    const fill = (sel, guess, allowNone) => { sel.innerHTML = (allowNone ? '<option value="">— none —</option>' : '') + cols.map(c => `<option value="${escapeHtml(c)}"${c === guess ? ' selected' : ''}>${escapeHtml(c)}</option>`).join(''); };
    fill($('selRunCol'), runGuess, false); fill($('selCondCol'), condGuess, true);
    $('colPicker').hidden = false;
    status(`${file.name} · ${(file.size / 1e6).toFixed(1)} MB · ${cols.length} columns${runGuess ? ` · run column looks like "${runGuess}"` : ''}. The file is read once as a stream; only unique run names are kept.`);
  }
  async function extract() {
    if (!pendingFile) return;
    const keyColumn = $('selRunCol').value, condColumn = $('selCondCol').value || null;
    $('btnExtract').disabled = true; progress(0);
    try {
      const res = await streamUniqueByColumn(pendingFile, { keyColumn, extraColumns: condColumn ? [condColumn] : [], onProgress: (f, rows) => { progress(f); status(`Reading… ${fmtPct(f)} · ${rows.toLocaleString()} rows`); } });
      const items = res.entries.map(e => {
        const v = {};
        if (condColumn) { const c = e.extra[condColumn] || []; if (c.length === 1 && !/^not defined$/i.test(c[0])) v.condition = c[0]; }
        return { raw: e.key, name: normalizeName(e.key, opts()), values: v };
      });
      let n = 0;
      Store.update(s => { s.meta.source = 'report'; s.meta.sourceFile = pendingFile.name; s.meta.sampleColumn = keyColumn; s.meta.conditionColumn = condColumn; s.meta.engine = engineFromColumn(keyColumn); s.meta.importedAt = new Date().toISOString(); n = Store.addSamples(items, 'report'); });
      const prefilled = items.filter(i => i.values.condition).length;
      status(`Done: ${res.rows.toLocaleString()} rows scanned, ${res.entries.length} unique runs, ${n} new${prefilled ? `, ${prefilled} conditions prefilled from ${condColumn}` : ''}.`);
      toast(`${n} runs imported`, 'ok');
    } catch (e) { status(`Import failed: ${e.message}`, 'error'); }
    finally { $('btnExtract').disabled = false; progress(null); $('colPicker').hidden = true; pendingFile = null; }
  }

  function renderList() {
    const s = Store.state, t = $('sampleList');
    if (!s.samples.length) { t.innerHTML = '<tr><td class="empty">No runs yet. Drop a report or paste names on the left.</td></tr>'; $('sampleSummary').textContent = ''; return; }
    const byType = { sample: 0, blank: 0, qc: 0 }; s.samples.forEach(x => byType[x.type]++);
    $('sampleSummary').textContent = `${s.samples.length} runs · ${byType.sample} samples · ${byType.blank} blanks · ${byType.qc} QC · ${s.samples.filter(x => x.include).length} included` + (s.meta.sourceFile ? ` · from ${s.meta.sourceFile}` : '');
    const rows = s.samples.map(x => {
      const pl = Store.placementOf(x.id);
      return `<tr class="${x.include ? '' : 'excluded'}" data-id="${x.id}">
        <td><input type="checkbox" class="inc" ${x.include ? 'checked' : ''} title="include in export"></td>
        <td><span class="badge ${x.type}">${x.type}</span></td>
        <td class="name">${escapeHtml(x.name)}</td>
        <td class="raw" title="${escapeHtml(x.raw)}">${x.raw !== x.name ? escapeHtml(x.raw) : ''}</td>
        <td class="mono">${pl ? `${s.plates.length > 1 ? pl.plate + ':' : ''}${pl.well}` : ''}</td>
        <td>${x.values.condition ? `<span class="cond-sw" style="background:${Store.colorFor(x.values.condition)}"></span>${escapeHtml(x.values.condition)}` : '<span class="hint">—</span>'}</td>
        <td><button class="small ghost rm" title="remove run">×</button></td></tr>`;
    }).join('');
    t.innerHTML = `<thead><tr><th></th><th>type</th><th>sample (as exported)</th><th>raw</th><th>well</th><th>condition</th><th></th></tr></thead><tbody>${rows}</tbody>`;
  }

  Pages.samples = {
    init() {
      const dz = $('dropZone');
      ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
      dz.addEventListener('drop', e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) handleFile(f); });
      $('fileInput').addEventListener('change', e => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ''; });
      $('btnExtract').addEventListener('click', extract);
      $('btnCancelPick').addEventListener('click', () => { pendingFile = null; $('colPicker').hidden = true; status(''); });
      $('btnPasteImport').addEventListener('click', () => { const lines = $('pasteBox').value.split(/\r?\n/); if (addNames(lines, 'paste')) $('pasteBox').value = ''; });
      $('btnExample').addEventListener('click', () => { $('pasteBox').value = EXAMPLE.join('\n'); });
      ['optStripPath', 'optStripExt', 'optIncludeNonSamples'].forEach(id => $(id).addEventListener('change', () => Store.update(s => { s.options.stripPath = $('optStripPath').checked; s.options.stripExt = $('optStripExt').checked; s.options.includeNonSamples = $('optIncludeNonSamples').checked; }, { record: false, silent: true })));
      $('optDelim').addEventListener('change', () => Store.update(s => { s.options.delimiter = $('optDelim').value || '_'; }, { record: false, silent: true }));
      $('btnIncludeAll').addEventListener('click', () => Store.update(s => s.samples.forEach(x => x.include = true)));
      $('btnIncludeSamplesOnly').addEventListener('click', () => Store.update(s => s.samples.forEach(x => x.include = x.type === 'sample')));
      $('btnClearSamples').addEventListener('click', () => { if (Store.state.samples.length && confirm('Remove all runs? Plate layouts are kept.')) Store.update(s => { s.samples = []; s.plates.forEach(p => p.placement = {}); }); });
      $('sampleList').addEventListener('change', e => { if (!e.target.matches('.inc')) return; const id = +e.target.closest('tr').dataset.id; Store.update(s => { const x = Store.sampleById(id); if (x) x.include = e.target.checked; }); });
      $('sampleList').addEventListener('click', e => { if (!e.target.matches('.rm')) return; const id = +e.target.closest('tr').dataset.id; Store.update(s => Store.removeSample(id)); });
    },
    render() {
      const o = opts();
      $('optStripPath').checked = o.stripPath; $('optStripExt').checked = o.stripExt; $('optIncludeNonSamples').checked = o.includeNonSamples; $('optDelim').value = o.delimiter;
      renderList();
    },
  };
})();
