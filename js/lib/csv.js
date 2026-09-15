'use strict';
/* CSV / TSV primitives. Delimiter detection and quoting follow the same rules as queueMaker
   (Documents/queueMaker/js/io.js) so files round-trip between the two apps. */
function splitDelimited(line, delim) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
function detectDelimiter(line) {
  const c = { ',': 0, ';': 0, '\t': 0 };
  for (const ch of line) if (ch in c) c[ch]++;
  if (c['\t'] > 0 && c['\t'] >= c[','] && c['\t'] >= c[';']) return '\t';
  if (c[';'] > c[',']) return ';';
  return ',';
}
function csvCell(v, delim = ',') {
  const s = v == null ? '' : String(v);
  return (s.includes(delim) || /["\n\r]/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function stripBom(text) { return text.replace(/^﻿/, '').replace(/\r/g, ''); }
/* whole-text parse: { header, rows (arrays), delim } — for small files (queue CSV, layout grid, conditions.tsv) */
function parseDelimited(text, delim) {
  const lines = stripBom(text).split('\n').filter(l => l.trim().length);
  if (!lines.length) return { header: [], rows: [], delim: delim || ',' };
  const d = delim || detectDelimiter(lines[0]);
  const header = splitDelimited(lines[0], d).map(s => s.trim());
  const rows = lines.slice(1).map(l => splitDelimited(l, d));
  return { header, rows, delim: d };
}
function toDelimited(header, rows, delim) {
  const lines = [header.map(h => csvCell(h, delim)).join(delim)];
  for (const r of rows) lines.push(r.map(c => csvCell(c, delim)).join(delim));
  return lines.join('\n') + '\n';
}
if (typeof module !== 'undefined') module.exports = { splitDelimited, detectDelimiter, csvCell, stripBom, parseDelimited, toDelimited };
