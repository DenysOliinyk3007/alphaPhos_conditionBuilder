'use strict';
/* 4 · Export — conditions.tsv/csv for ap.collapse_sites(condition_df=…), queueMaker layout CSV, project JSON. */
(() => {
  function exportTable() {
    const s = Store.state, withPlate = $('chkExportPlate').checked, multi = s.plates.length > 1;
    const extra = s.columns.filter(c => c !== 'condition');
    const header = ['sample', 'condition', ...extra, ...(withPlate ? (multi ? ['plate', 'well'] : ['well']) : [])];
    const rows = Store.included().slice().sort((a, b) => a.order - b.order).map(x => {
      const pl = Store.placementOf(x.id);
      return [x.name, x.values.condition || '', ...extra.map(c => x.values[c] == null ? '' : x.values[c]), ...(withPlate ? (multi ? [pl ? pl.plate : '', pl ? pl.well : ''] : [pl ? pl.well : '']) : [])];
    });
    return { header, rows };
  }
  function filename() { return $('selFormat').value === 'csv' ? 'conditions.csv' : 'conditions.tsv'; }
  function text() { const { header, rows } = exportTable(); return toDelimited(header, rows, $('selFormat').value === 'csv' ? ',' : '\t'); }
  function snippet() {
    const s = Store.state, csv = $('selFormat').value === 'csv', src = s.meta.sourceFile || 'report.tsv';
    const read = csv ? `pd.read_csv("${filename()}")` : `pd.read_csv("${filename()}", sep="\\t")`;
    const reader = s.meta.engine === 'DIANN' ? `psm = ap.read_diann("${src}")` : s.meta.engine === 'SN' ? `psm = ap.read_spectronaut("${src}")` : `psm = ap.read_spectronaut("${src}")   # or ap.read_diann(...)`;
    return `import pandas as pd\nimport alphaphos as ap\n\ncond_df = ${read}\n${reader}\nadata = ap.collapse_sites(psm, condition_df=cond_df)\n\n# adata.obs now carries: ${['condition', ...s.columns.filter(c => c !== 'condition')].join(', ')}`;
  }
  Pages.export = {
    init() {
      $('selFormat').addEventListener('change', () => Pages.export.render());
      $('chkExportPlate').addEventListener('change', () => Pages.export.render());
      $('btnDownload').addEventListener('click', () => { download(filename(), text(), 'text/tab-separated-values;charset=utf-8'); toast(`${filename()} downloaded`, 'ok'); });
      $('btnCopy').addEventListener('click', async () => toast(await copyText(text()) ? 'Table copied' : 'Copy failed', 'ok'));
      $('btnCopyPy').addEventListener('click', async () => toast(await copyText(snippet()) ? 'Snippet copied' : 'Copy failed', 'ok'));
      $('btnLayoutCSV').addEventListener('click', () => { const p = Store.activePlate(); download(`layout_${p.id}.csv`, toLayoutGrid(p.layout), 'text/csv;charset=utf-8'); toast('Layout CSV downloaded', 'ok'); });
      $('btnSaveProject').addEventListener('click', () => { download('conditions.project.json', JSON.stringify(Store.state, null, 2), 'application/json'); toast('Project saved', 'ok'); });
      $('loadProjectInput').addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return; try { const obj = JSON.parse(await f.text()); if (obj.schema_version !== 1 || !Array.isArray(obj.samples)) throw new Error('not a condition-builder project'); Store.replace(obj); toast('Project loaded', 'ok'); } catch (err) { toast(`Could not load: ${err.message}`, 'error'); } e.target.value = ''; });
    },
    render() {
      const v = validateProject(Store.state), { header, rows } = exportTable();
      $('exportBlock').innerHTML = v.errors ? `<div class="blocked"><b>Export blocked:</b> ${v.findings.filter(f => f.level === 'error').map(f => escapeHtml(f.message)).join(' · ')}. Fix them on the Table tab.</div>` : '';
      $('btnDownload').disabled = !!v.errors || !rows.length; $('btnCopy').disabled = !!v.errors || !rows.length;
      const shown = rows.slice(0, 25);
      $('exportPreview').innerHTML = rows.length ? `<table class="table"><thead><tr>${header.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${shown.map(r => `<tr>${r.map((c, i) => `<td class="${i === 0 ? 'mono' : ''}">${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}${rows.length > shown.length ? `<tr><td colspan="${header.length}" class="hint">… ${rows.length - shown.length} more rows</td></tr>` : ''}</tbody></table>` : '<div class="empty">Nothing to export yet.</div>';
      $('pySnippet').textContent = snippet();
    },
  };
})();
