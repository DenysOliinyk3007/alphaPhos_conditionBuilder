'use strict';
/* Run-name handling: normalisation, well-ID extraction, run classification, tokenisation.
   Conventions come from two places:
   - queueMaker (Documents/queueMaker/js/naming.js): {date}_{inst}_Eno{N}_{gradient}_SA_{personal}_{expID}[_{label}]_{well}
     QC runs end in _QC_{well}, blanks in _blank_{n}, 384-translated wells give _Q{1-4}_{well}.
   - alphaPhos (alphaphos.proteome.pairing): _([A-H])(1[0-2]|[1-9])(?:_[^_]+)?$ */
const RAW_EXT_RE = /\.(raw|d|wiff|wiff2|mzml|mzxml|htrms|dia|mgf|tdf|tsf)$/i;
const ROWS96 = ['A','B','C','D','E','F','G','H'];
const COLS96 = Array.from({ length: 12 }, (_, i) => i + 1);
const WELL_STRICT_RE = /_(?:Q([1-4])_)?([A-H])(1[0-2]|[1-9])$/;
const WELL_LOOSE_RE  = /_(?:Q([1-4])_)?([A-H])(1[0-2]|[1-9])(?:_[^_]+)?$/;

function stripPath(s) { return String(s).split(/[\\/]/).pop(); }
function stripExt(s) { return String(s).replace(RAW_EXT_RE, ''); }
function normalizeName(raw, opts) {
  const o = Object.assign({ stripPath: true, stripExt: true }, opts || {});
  let s = String(raw).trim();
  if (o.stripPath) s = stripPath(s);
  if (o.stripExt) s = stripExt(s);
  return s;
}
/* returns { well:'A1', row:'A', col:1, quadrant:1|null } or null.  Strict first (queueMaker names end in the
   well), then the looser alphaPhos form that tolerates one trailing token (e.g. _A1_rerun). */
function wellFromName(name) {
  let m = WELL_STRICT_RE.exec(name) || WELL_LOOSE_RE.exec(name);
  if (!m) return null;
  return { well: m[2] + m[3], row: m[2], col: parseInt(m[3], 10), quadrant: m[1] ? parseInt(m[1], 10) : null };
}
/* same keyword rules as queueMaker's classifyName so both apps agree on what is a blank / QC */
function classifyRun(name) {
  if (/(?:^|[_\s-])blank(?:[_\s-]|$)/i.test(name)) return 'blank';
  if (/(?:^|[_\s-])qc(?:[_\s-]|$)/i.test(name)) return 'qc';
  return 'sample';
}
const QUANTITY_RE = /^(\d+(?:[.,]\d+)?)\s*([a-zA-Zµμ%]*)$/;
function parseQuantity(tok) {
  const m = QUANTITY_RE.exec(String(tok).trim());
  if (!m) return null;
  return { value: parseFloat(m[1].replace(',', '.')), unit: m[2] };
}
function tokenize(name, delim) { return String(name).split(delim || '_'); }
/* token table over many names: per position → unique values, constant?, numeric?, quantity? */
function tokenTable(names, delim) {
  const rows = names.map(n => tokenize(n, delim));
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const cols = [];
  for (let i = 0; i < width; i++) {
    const values = rows.map(r => r[i] == null ? '' : r[i]);
    const unique = [...new Set(values)];
    const nonEmpty = values.filter(v => v !== '');
    const numeric = nonEmpty.length > 0 && nonEmpty.every(v => /^\d+$/.test(v));
    const quantity = !numeric && nonEmpty.length > 0 && nonEmpty.every(v => parseQuantity(v) && parseQuantity(v).unit);
    const isWell = nonEmpty.length > 0 && nonEmpty.every(v => /^[A-H](1[0-2]|[1-9])$/.test(v));
    cols.push({ index: i, values, unique, constant: unique.length <= 1, numeric, quantity, isWell });
  }
  return { rows, cols, width };
}
/* propose column roles for the varying tokens: replicate for all-integer, dose for quantity-with-unit,
   condition for the first remaining categorical token; anything else left unassigned */
function suggestRoles(tt) {
  const roles = {};
  let conditionTaken = false, replicateTaken = false;
  for (const c of tt.cols) {
    if (c.constant || c.isWell) continue;
    if (c.numeric) { if (!replicateTaken) { roles[c.index] = 'replicate'; replicateTaken = true; } continue; }
    if (c.quantity) { roles[c.index] = 'dose'; continue; }
    if (!conditionTaken) { roles[c.index] = 'condition'; conditionTaken = true; }
  }
  return roles;
}
function wellSortKey(well) { const m = /^([A-P])(\d+)$/.exec(well); return m ? [m[1].charCodeAt(0), parseInt(m[2], 10)] : [999, 999]; }
function wellsRowWise() { const out = []; for (const r of ROWS96) for (const c of COLS96) out.push(r + c); return out; }
function wellsColumnWise() { const out = []; for (const c of COLS96) for (const r of ROWS96) out.push(r + c); return out; }
if (typeof module !== 'undefined') module.exports = { RAW_EXT_RE, ROWS96, COLS96, stripPath, stripExt, normalizeName, wellFromName, classifyRun, parseQuantity, tokenize, tokenTable, suggestRoles, wellSortKey, wellsRowWise, wellsColumnWise };
