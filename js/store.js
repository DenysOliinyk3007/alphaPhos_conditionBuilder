'use strict';
/* Single in-memory project state, mirrored to localStorage.  Pages never hold state of their own beyond
   transient UI (selection, open panels).  Shape matches the `conditions` block of the planned
   project.alphaphos.json so the prototype's saved projects stay importable later. */
const PALETTE = ['#2F6F8F', '#D9822B', '#5B8C3E', '#A6478A', '#C9A227', '#4F6BD8', '#C25B4A', '#3E9B95', '#8A6D3B', '#6D6D8F', '#B04E7E', '#4E8AB0', '#7C9A3C', '#9C6B2F'];
const STORE_KEY = 'alphaphos.conditionBuilder.v1';

const Store = {
  state: null,
  listeners: [],
  history: [],
  fresh() {
    return {
      schema_version: 1,
      meta: { source: null, sourceFile: null, sampleColumn: null, conditionColumn: null, engine: null, importedAt: null },
      options: { delimiter: '_', stripPath: true, stripExt: true, includeNonSamples: false },
      columns: ['condition'],
      samples: [],
      plates: [{ id: 'P1', format: 96, layout: {}, placement: {} }],
      palette: {},
      rules: [],
      ui: { tab: 'samples', activePlate: 0, paint: null, theme: 'system' },
      nextId: 1,
    };
  },
  init() { this.state = this.load() || this.fresh(); },
  load() {
    try { const raw = localStorage.getItem(STORE_KEY); if (!raw) return null; const s = JSON.parse(raw); return s && s.schema_version === 1 ? Object.assign(this.fresh(), s) : null; }
    catch (e) { return null; }
  },
  save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(this.state)); } catch (e) { /* file:// private mode etc. */ } },
  subscribe(fn) { this.listeners.push(fn); },
  emit(what) { this.listeners.forEach(fn => fn(this.state, what)); },
  snapshot() { this.history.push(JSON.stringify(this.state)); if (this.history.length > 40) this.history.shift(); },
  /* mutate through here: fn(state) → persisted and broadcast; record=false skips the undo snapshot (drag paints) */
  update(fn, opts) {
    const o = Object.assign({ record: true, silent: false }, opts || {});
    if (o.record) this.snapshot();
    fn(this.state);
    this.save();
    if (!o.silent) this.emit(o.what);
  },
  undo() { const prev = this.history.pop(); if (!prev) return false; this.state = JSON.parse(prev); this.save(); this.emit('undo'); return true; },
  reset() { this.snapshot(); this.state = this.fresh(); this.save(); this.emit('reset'); },
  replace(obj) { this.snapshot(); this.state = Object.assign(this.fresh(), obj); this.save(); this.emit('replace'); },

  /* ---- derived helpers ---- */
  conditions() {
    const s = this.state, set = new Set();
    s.samples.forEach(x => { const c = (x.values.condition || '').trim(); if (c) set.add(c); });
    s.plates.forEach(p => Object.values(p.layout).forEach(c => set.add(c)));
    Object.keys(s.palette).forEach(c => set.add(c));
    return [...set];
  },
  colorFor(cond) {
    const s = this.state;
    if (!s.palette[cond]) { const used = new Set(Object.values(s.palette)); const free = PALETTE.find(c => !used.has(c)) || PALETTE[Object.keys(s.palette).length % PALETTE.length]; s.palette[cond] = free; }
    return s.palette[cond];
  },
  sampleById(id) { return this.state.samples.find(x => x.id === id) || null; },
  included() { return this.state.samples.filter(x => x.include); },
  activePlate() { const s = this.state; return s.plates[Math.min(s.ui.activePlate, s.plates.length - 1)]; },
  placementOf(sampleId) { for (const p of this.state.plates) for (const [w, id] of Object.entries(p.placement)) if (id === sampleId) return { plate: p.id, well: w }; return null; },
  /* add run names (already normalised); dedupe against existing names; returns count added */
  addSamples(items, source) {
    const s = this.state, have = new Set(s.samples.map(x => x.name));
    let n = 0;
    for (const it of items) {
      if (have.has(it.name)) continue;
      have.add(it.name);
      const type = it.type || classifyRun(it.name);
      const smp = { id: s.nextId++, raw: it.raw || it.name, name: it.name, type, include: type === 'sample' || s.options.includeNonSamples, values: { condition: '' }, source: source || null, order: s.samples.length + 1 };
      if (it.values) Object.assign(smp.values, it.values);
      for (const col of Object.keys(smp.values)) if (!s.columns.includes(col)) s.columns.push(col);
      s.samples.push(smp);
      if (it.well) { const p = it.plate ? (s.plates.find(x => x.id === it.plate) || this.ensurePlate(it.plate)) : this.activePlate(); if (!p.placement[it.well]) p.placement[it.well] = smp.id; }
      n++;
    }
    return n;
  },
  ensurePlate(id) { const s = this.state; let p = s.plates.find(x => x.id === id); if (!p) { p = { id, format: 96, layout: {}, placement: {} }; s.plates.push(p); } return p; },
  removeSample(id) { const s = this.state; s.samples = s.samples.filter(x => x.id !== id); s.plates.forEach(p => { for (const [w, sid] of Object.entries(p.placement)) if (sid === id) delete p.placement[w]; }); },
  setValue(id, col, value) { const smp = this.sampleById(id); if (!smp) return; smp.values[col] = value; if (!this.state.columns.includes(col)) this.state.columns.push(col); },
  addColumn(name) { if (!this.state.columns.includes(name)) this.state.columns.push(name); },
  removeColumn(name) { if (name === 'condition') return; this.state.columns = this.state.columns.filter(c => c !== name); this.state.samples.forEach(x => delete x.values[name]); },
};
