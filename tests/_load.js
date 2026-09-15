'use strict';
/* Load the classic-script libs into THIS realm (so assert.deepStrictEqual sees native prototypes) and
   collect their exports on one object.  Each lib ends with a one-line module.exports guard that we rewrite. */
const fs = require('fs'), path = require('path'), vm = require('vm');
globalThis.__CB = {};
for (const f of ['csv.js', 'names.js', 'tsv-stream.js', 'validate.js', 'layout-csv.js', 'queue-csv.js']) {
  let src = fs.readFileSync(path.join(__dirname, '..', 'js', 'lib', f), 'utf8');
  src = src.replace(/if \(typeof module !== 'undefined'\) module\.exports = (\{[^\n]*\});/, 'Object.assign(globalThis.__CB, $1);');
  vm.runInThisContext(src, { filename: f });
}
module.exports = globalThis.__CB;
