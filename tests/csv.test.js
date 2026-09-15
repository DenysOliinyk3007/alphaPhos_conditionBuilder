'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('./_load.js');
test('delimiter detection prefers tab, then semicolon', () => {
  assert.equal(L.detectDelimiter('a\tb\tc'), '\t');
  assert.equal(L.detectDelimiter('a;b;c'), ';');
  assert.equal(L.detectDelimiter('a,b,c'), ',');
});
test('quoted fields round-trip', () => {
  const t = L.toDelimited(['sample', 'condition'], [['s1', 'EGF, high'], ['s2', 'say "hi"']], ',');
  const p = L.parseDelimited(t);
  assert.deepEqual(p.header, ['sample', 'condition']);
  assert.deepEqual(p.rows, [['s1', 'EGF, high'], ['s2', 'say "hi"']]);
});
test('layout grid parses queueMaker shape and exports the same', () => {
  const grid = ',1,2,3,4,5,6,7,8,9,10,11,12\nA,EGF+,EGF+,,,,,,,,,,\nB,EGF-,,,,,,,,,,,\n';
  const r = L.parseLayoutGrid(grid);
  assert.deepEqual(r.wells, { A1: 'EGF+', A2: 'EGF+', B1: 'EGF-' });
  assert.equal(L.looksLikeLayoutGrid(L.parseDelimited(grid).header), true);
  const out = L.toLayoutGrid(r.wells);
  assert.deepEqual(L.parseLayoutGrid(out).wells, r.wells);
  assert.equal(out.split('\n').filter(Boolean).length, 9);
});
test('queue CSV (Thermo) yields rack + well + type', () => {
  const csv = 'File Name,Path,Instrument Method,Position\n20250101_OA4_Eno11_g_SA_DeOl_exp_A1,D:\\,m,S3:A1\n20250101_OA4_Eno11_g_SA_DeOl_exp_blank_1,D:\\,m,S2:A1\n20250101_OA4_Eno11_g_ADIAMA_HeLa_200ng_DeOl_exp_QC_B1,D:\\,m,S2:B1\n';
  const r = L.parseQueueCSV(csv);
  assert.equal(r.format, 'Thermo');
  assert.deepEqual(r.entries.map(e => [e.rack, e.well, e.type]), [['S3', 'A1', 'sample'], ['S2', 'A1', 'blank'], ['S2', 'B1', 'qc']]);
  assert.equal(L.detectQueueFormat(['Sample Name', 'MS Method', 'Vial Position']), 'Sciex');
  assert.equal(L.detectQueueFormat(['R.Condition', 'R.FileName']), null);
});
