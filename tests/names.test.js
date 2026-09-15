'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('./_load.js');
const EGF = '20250729_OA4_Evo11_16p3min_DeOl_SA_nanoPhos_dilser_new_withEGF_1000ng_01';

test('normalizeName strips Windows paths and raw extensions', () => {
  assert.equal(L.normalizeName('V:\\Denys\\raw\\' + EGF + '.raw'), EGF);
  assert.equal(L.normalizeName('/data/run/x_A1.d'), 'x_A1');
  assert.equal(L.normalizeName(EGF + '.raw', { stripExt: false }), EGF + '.raw');
});
test('wellFromName handles queueMaker suffixes and the alphaPhos loose form', () => {
  assert.deepEqual(L.wellFromName('20250101_X_SA_DeOl_exp_A1'), { well: 'A1', row: 'A', col: 1, quadrant: null });
  assert.deepEqual(L.wellFromName('x_QC_H12'), { well: 'H12', row: 'H', col: 12, quadrant: null });
  assert.equal(L.wellFromName('x_Q3_B7').quadrant, 3);
  assert.equal(L.wellFromName('x_B7_rerun').well, 'B7');
  assert.equal(L.wellFromName(EGF), null);
  assert.equal(L.wellFromName('x_A13'), null);
});
test('classifyRun matches queueMaker keywords', () => {
  assert.equal(L.classifyRun('x_blank_3'), 'blank');
  assert.equal(L.classifyRun('20250101_OA4_Eno11_g_ADIAMA_HeLa_200ng_DeOl_exp_QC_A1'), 'qc');
  assert.equal(L.classifyRun(EGF), 'sample');
  assert.equal(L.classifyRun('x_qcsomething'), 'sample');
});
test('tokenTable + suggestRoles on the EGF names', () => {
  const names = ['withEGF_1000ng_01', 'withEGF_200ng_02', 'woEGF_1000ng_01', 'woEGF_200ng_02'].map(s => '20250729_OA4_' + s);
  const tt = L.tokenTable(names, '_');
  assert.equal(tt.width, 5);
  assert.equal(tt.cols[0].constant, true);
  assert.equal(tt.cols[2].constant, false);
  assert.equal(tt.cols[3].quantity, true);
  assert.equal(tt.cols[4].numeric, true);
  assert.deepEqual(L.suggestRoles(tt), { 2: 'condition', 3: 'dose', 4: 'replicate' });
});
test('parseQuantity', () => {
  assert.deepEqual(L.parseQuantity('1000ng'), { value: 1000, unit: 'ng' });
  assert.deepEqual(L.parseQuantity('2.5uM'), { value: 2.5, unit: 'uM' });
  assert.equal(L.parseQuantity('withEGF'), null);
});
test('well orders', () => {
  assert.equal(L.wellsRowWise()[1], 'A2'); assert.equal(L.wellsColumnWise()[1], 'B1'); assert.equal(L.wellsRowWise().length, 96);
});
