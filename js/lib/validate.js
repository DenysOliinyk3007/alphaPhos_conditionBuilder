'use strict';
/* Validation of the conditions table against what alphaPhos.collapse_sites / stats.design accept.
   Findings share one shape with the planned server-side twin: { level, code, message, hint, target } */
const RESERVED_COLUMNS = ['__condition__', '__block__', '__intercept__'];   // alphaphos.stats.design
const COLUMN_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function validateProject(state) {
  const f = [];
  const inc = state.samples.filter(s => s.include);
  const push = (level, code, message, hint, target) => f.push({ level, code, message, hint, target: target || null });

  // duplicate sample names (to_anndata drops duplicates silently — first wins)
  const counts = new Map();
  inc.forEach(s => counts.set(s.name, (counts.get(s.name) || 0) + 1));
  const dups = [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  if (dups.length) push('error', 'SAMPLE_DUPLICATE', `${dups.length} duplicated sample name(s)`, 'alphaPhos keeps only the first row of a duplicated sample. Exclude or rename the extras.', { samples: dups });

  const empty = inc.filter(s => !(s.values.condition || '').trim()).map(s => s.id);
  if (empty.length) push('error', 'COND_EMPTY', `${empty.length} included sample(s) have no condition`, 'Fill them in the table, paint them on the plate, or exclude them.', { ids: empty });

  const ws = inc.filter(s => { const v = s.values.condition || ''; return v !== v.trim() || /\s{2,}/.test(v); }).map(s => s.id);
  if (ws.length) push('warning', 'COND_WHITESPACE', `${ws.length} condition value(s) carry leading/trailing or double spaces`, 'They become distinct factor levels in limma. Trim them.', { ids: ws });

  for (const col of state.columns) {
    if (RESERVED_COLUMNS.includes(col)) push('error', 'COL_RESERVED', `Column "${col}" is reserved by alphaphos.stats.design`, 'Rename the column.', { column: col });
    else if (!COLUMN_NAME_RE.test(col)) push('warning', 'COL_NAME_INVALID', `Column "${col}" is not a plain identifier`, 'Use letters, digits and underscores so it works as a formula term.', { column: col });
    if (col === 'sample') push('error', 'COL_RESERVED', 'A metadata column cannot be called "sample"', 'That name is taken by the sample id column.', { column: col });
  }

  // replicate summary: condition-aware masking is a majority rule over replicates — n = 1 makes it vacuous
  const perCond = new Map();
  inc.forEach(s => { const c = (s.values.condition || '').trim(); if (c) perCond.set(c, (perCond.get(c) || 0) + 1); });
  const singletons = [...perCond.entries()].filter(([, n]) => n === 1).map(([c]) => c);
  if (singletons.length) push('warning', 'COND_SINGLETON', `${singletons.length} condition(s) have a single replicate: ${singletons.join(', ')}`, 'The condition-aware Class I mask needs ≥ 2 replicates per condition to mean anything.', { conditions: singletons });
  if (perCond.size === 1 && inc.length > 1) push('info', 'COND_SINGLE_LEVEL', 'All samples share one condition', 'Fine for collapse; differential expression needs at least two levels.', null);

  // plate conflicts: placed sample whose table condition differs from the layout of its well
  const conflicts = [];
  for (const p of state.plates) for (const [well, sid] of Object.entries(p.placement)) {
    const s = state.samples.find(x => x.id === sid); const lay = p.layout[well];
    if (s && lay && (s.values.condition || '') !== lay) conflicts.push({ plate: p.id, well, sample: s.name, table: s.values.condition || '', layout: lay });
  }
  if (conflicts.length) push('warning', 'PLATE_CONFLICT', `${conflicts.length} well(s) disagree with the table`, 'Apply the plate layout to the table, or sync the layout from the table.', { conflicts });

  const nonSamplesIncluded = inc.filter(s => s.type !== 'sample').length;
  if (nonSamplesIncluded) push('info', 'NONSAMPLE_INCLUDED', `${nonSamplesIncluded} blank/QC run(s) are included`, 'They are exported like samples. Exclude them unless you want them in the AnnData with a condition.', null);

  return { findings: f, replicates: perCond, errors: f.filter(x => x.level === 'error').length, warnings: f.filter(x => x.level === 'warning').length };
}
if (typeof module !== 'undefined') module.exports = { validateProject, RESERVED_COLUMNS, COLUMN_NAME_RE };
