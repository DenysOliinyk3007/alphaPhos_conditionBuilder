'use strict';
/* queueMaker queue exports (queueMaker/js/queue.js buildQueue):
   Thermo: File Name, Path, Instrument Method, Position ("S3:A1")
   Sciex : Sample Name, MS Method, LC Method, Rack Type, Rack Position, Plate Type, Plate Position, Vial Position, Data File
   Bruker: Vial ("S3-A1"), Sample ID, Method Set, Separation Method, Injection Method, MS Method, Processing Method */
function detectQueueFormat(header) {
  const h = header.map(s => s.trim());
  if (h.includes('File Name') && h.includes('Position')) return 'Thermo';
  if (h.includes('Sample Name') && h.includes('Vial Position')) return 'Sciex';
  if (h.includes('Vial') && h.includes('Sample ID')) return 'Bruker';
  return null;
}
function parseQueueCSV(text) {
  const { header, rows } = parseDelimited(text);
  const fmt = detectQueueFormat(header);
  if (!fmt) return { error: 'Not a queueMaker queue export (expected Thermo, Sciex or Bruker columns).' };
  const col = name => header.findIndex(h => h.trim() === name);
  const entries = [];
  for (const r of rows) {
    let name, rack = null, well = null;
    if (fmt === 'Thermo') { name = r[col('File Name')]; const pos = (r[col('Position')] || '').split(':'); rack = pos[0] || null; well = pos[1] || null; }
    else if (fmt === 'Sciex') { name = r[col('Sample Name')]; rack = r[col('Rack Position')] || null; well = r[col('Vial Position')] || null; }
    else { name = r[col('Sample ID')]; const v = (r[col('Vial')] || '').split('-'); rack = v[0] || null; well = v[1] || null; }
    name = (name || '').trim();
    if (!name) continue;
    entries.push({ name, rack, well: well ? well.trim().toUpperCase() : null, type: classifyRun(name), order: entries.length + 1 });
  }
  return { format: fmt, entries };
}
if (typeof module !== 'undefined') module.exports = { detectQueueFormat, parseQueueCSV };
