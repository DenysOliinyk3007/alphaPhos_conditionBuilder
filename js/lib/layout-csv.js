'use strict';
/* queueMaker plate-layout grid: header ",1,2,…,12", one row per plate row A–H, cell text = condition/name.
   Import mirrors queueMaker/js/io.js importLayout; export writes the same shape so queueMaker can read it back. */
function parseLayoutGrid(text) {
  const { header, rows } = parseDelimited(text);
  if (!header.length || rows.length < 1) return { error: 'Need a header row (columns) plus at least one well row (A–H).' };
  const cols = header.slice(1).map(h => /^\d+$/.test(h.trim()) ? String(parseInt(h, 10)) : h.trim());
  const wells = {};
  let n = 0;
  for (const r of rows) {
    const row = (r[0] || '').trim().toUpperCase();
    if (!ROWS96.includes(row)) continue;
    cols.forEach((c, i) => {
      if (!COLS96.map(String).includes(c)) return;
      const raw = (r[i + 1] || '').trim();
      if (raw) { wells[row + c] = raw; n++; }
    });
  }
  if (!n) return { error: 'No named wells found — expected a plate grid (rows A–H down, columns 1–12 across).' };
  return { wells, n };
}
function toLayoutGrid(layout, delim) {
  const d = delim || ',';
  const header = ['', ...COLS96.map(String)];
  const rows = ROWS96.map(r => [r, ...COLS96.map(c => layout[r + c] || '')]);
  return toDelimited(header, rows, d);
}
/* heuristics on a parsed header to tell layout grids and queue exports apart from search-engine reports */
function looksLikeLayoutGrid(header) {
  const h = header.map(s => s.trim());
  return h[0] === '' && h.slice(1, 4).every(x => /^\d+$/.test(x));
}
if (typeof module !== 'undefined') module.exports = { parseLayoutGrid, toLayoutGrid, looksLikeLayoutGrid };
