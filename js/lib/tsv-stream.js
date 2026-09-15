'use strict';
/* Streaming column extraction from very large search-engine reports (multi-GB Spectronaut / DIA-NN TSV).
   Reads the File in slices through a TextDecoder and keeps only the unique values of the requested
   columns; the file is never held in memory.  Browser-only (uses Blob.slice). */
async function readHeaderLine(file, maxBytes) {
  const buf = await file.slice(0, Math.min(file.size, maxBytes || 1 << 20)).text();
  const nl = buf.indexOf('\n');
  const line = (nl >= 0 ? buf.slice(0, nl) : buf).replace(/\r$/, '').replace(/^﻿/, '');
  const delim = detectDelimiter(line);
  return { line, delim, columns: splitDelimited(line, delim).map(s => s.trim()) };
}
/* opts: { keyColumn, extraColumns: [], onProgress(fraction, rows), chunkSize }
   resolves { header, delim, rows, entries: [{ key, extra: {col: Set→Array} }] } in first-appearance order */
async function streamUniqueByColumn(file, opts) {
  const o = Object.assign({ extraColumns: [], chunkSize: 8 * 1024 * 1024 }, opts);
  const head = await readHeaderLine(file);
  const keyIdx = head.columns.indexOf(o.keyColumn);
  if (keyIdx < 0) throw new Error(`Column "${o.keyColumn}" not found in header`);
  const extraIdx = o.extraColumns.map(c => head.columns.indexOf(c));
  const simple = !head.line.includes('"');          // fast path: no quoted fields → plain split
  const decoder = new TextDecoder('utf-8');
  const seen = new Map();
  let carry = '', rows = 0, offset = 0, first = true;
  while (offset < file.size) {
    const slice = file.slice(offset, Math.min(file.size, offset + o.chunkSize));
    const text = decoder.decode(new Uint8Array(await slice.arrayBuffer()), { stream: true });
    offset += o.chunkSize;
    const buf = carry + text;
    const lines = buf.split('\n');
    carry = lines.pop();
    for (let i = 0; i < lines.length; i++) {
      if (first) { first = false; continue; }                       // header
      const line = lines[i];
      if (!line) continue;
      const cells = simple ? line.split(head.delim) : splitDelimited(line.replace(/\r$/, ''), head.delim);
      rows++;
      const key = (cells[keyIdx] || '').replace(/\r$/, '').trim();
      if (!key) continue;
      let e = seen.get(key);
      if (!e) { e = { key, extra: {} }; o.extraColumns.forEach(c => e.extra[c] = new Set()); seen.set(key, e); }
      extraIdx.forEach((idx, j) => { if (idx >= 0) { const v = (cells[idx] || '').replace(/\r$/, '').trim(); if (v) e.extra[o.extraColumns[j]].add(v); } });
    }
    if (o.onProgress) o.onProgress(Math.min(1, offset / file.size), rows);
  }
  if (carry.trim() && !first) {
    const cells = simple ? carry.split(head.delim) : splitDelimited(carry, head.delim);
    const key = (cells[keyIdx] || '').trim();
    if (key && !seen.has(key)) { const e = { key, extra: {} }; o.extraColumns.forEach((c, j) => { e.extra[c] = new Set(); const v = (cells[extraIdx[j]] || '').trim(); if (v) e.extra[c].add(v); }); seen.set(key, e); }
    rows++;
  }
  const entries = [...seen.values()].map(e => ({ key: e.key, extra: Object.fromEntries(Object.entries(e.extra).map(([k, s]) => [k, [...s]])) }));
  return { header: head.columns, delim: head.delim, rows, entries };
}
/* which header column most likely holds the run name, per engine */
const RUN_COLUMN_CANDIDATES = ['R.FileName', 'R_FileName', 'Run', 'File.Name', 'Raw file', 'Spectrum File', 'run', 'sample', 'Sample'];
const CONDITION_COLUMN_CANDIDATES = ['R.Condition', 'R_Condition', 'condition', 'Condition'];
function guessColumn(columns, candidates) { for (const c of candidates) if (columns.includes(c)) return c; return null; }
if (typeof module !== 'undefined') module.exports = { readHeaderLine, streamUniqueByColumn, RUN_COLUMN_CANDIDATES, CONDITION_COLUMN_CANDIDATES, guessColumn };
