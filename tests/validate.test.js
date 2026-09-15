'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('./_load.js');
const smp = (id, name, cond, extra) => Object.assign({ id, name, include: true, type: 'sample', values: { condition: cond } }, extra || {});
const base = () => ({ columns: ['condition'], samples: [], plates: [{ id: 'P1', layout: {}, placement: {} }] });
const codes = s => L.validateProject(s).findings.map(f => f.code);

test('clean two-condition table has no findings', () => {
  const s = base(); s.samples = [smp(1, 'a1', 'A'), smp(2, 'a2', 'A'), smp(3, 'b1', 'B'), smp(4, 'b2', 'B')];
  assert.deepEqual(codes(s), []);
});
test('empty condition and duplicate names are errors', () => {
  const s = base(); s.samples = [smp(1, 'a1', ''), smp(2, 'a1', 'A'), smp(3, 'b', 'B')];
  const c = codes(s); assert.ok(c.includes('COND_EMPTY')); assert.ok(c.includes('SAMPLE_DUPLICATE'));
  assert.equal(L.validateProject(s).errors, 2);
});
test('singleton conditions warn, reserved columns error, excluded rows ignored', () => {
  const s = base(); s.columns = ['condition', '__block__']; s.samples = [smp(1, 'a', 'A'), smp(2, 'b', 'B'), smp(3, 'c', '', { include: false })];
  const c = codes(s); assert.ok(c.includes('COND_SINGLETON')); assert.ok(c.includes('COL_RESERVED')); assert.ok(!c.includes('COND_EMPTY'));
});
test('plate conflict is reported', () => {
  const s = base(); s.samples = [smp(1, 'a', 'A'), smp(2, 'b', 'A')]; s.plates[0].layout = { A1: 'B' }; s.plates[0].placement = { A1: 1 };
  assert.ok(codes(s).includes('PLATE_CONFLICT'));
});
