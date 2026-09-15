'use strict';
/* 3 · Plate — layout layer (well → condition) painted with a brush; placement layer (well → sample)
   filled by well-ID, in order, or by drag and drop.  Drag-to-paint mechanics follow queueMaker. */
(() => {
  let painting = false, eraser = false, dragId = null;
  const plate = () => Store.activePlate();
  const brush = () => Store.state.ui.paint;

  function paintWell(p, well) {
    if (eraser) delete p.layout[well];
    else if (brush()) { p.layout[well] = brush(); Store.colorFor(brush()); }
  }
  function conflictAt(p, well) {
    const sid = p.placement[well]; if (!sid || !p.layout[well]) return false;
    const x = Store.sampleById(sid); return x && (x.values.condition || '') !== p.layout[well];
  }
  function renderPalette() {
    const s = Store.state, conds = Store.conditions(), counts = {};
    plate() && Object.values(plate().layout).forEach(c => counts[c] = (counts[c] || 0) + 1);
    $('palette').innerHTML = conds.length ? conds.map(c => `<span class="chip" role="button" tabindex="0" aria-pressed="${brush() === c && !eraser}" data-cond="${escapeHtml(c)}"><span class="col"><input type="color" value="${Store.colorFor(c)}" data-color="${escapeHtml(c)}" title="colour"><span>${escapeHtml(c)}</span></span><span class="cnt">${counts[c] || 0} wells</span></span>`).join('') : '<span class="hint">No conditions yet. Add one below or label samples in the table.</span>';
    $('palette').querySelectorAll('.chip').forEach(ch => ch.addEventListener('click', e => { if (e.target.matches('input[type=color]')) return; const c = ch.dataset.cond; eraser = false; Store.update(st => { st.ui.paint = st.ui.paint === c ? null : c; }, { record: false }); }));
    $('palette').querySelectorAll('input[type=color]').forEach(inp => { inp.addEventListener('click', e => e.stopPropagation()); inp.addEventListener('input', () => Store.update(st => { st.palette[inp.dataset.color] = inp.value; }, { record: false })); });
    $('btnEraser').setAttribute('aria-pressed', String(eraser));
    $('brushHint').textContent = eraser ? 'Eraser: click or drag to clear the layout of wells.' : brush() ? `Painting "${brush()}". Click the chip again to stop painting and enable drag-moving of runs.` : 'Pick a condition, then click or drag over wells. Click a row or column header to fill it. With no brush, placed runs can be dragged between wells.';
  }
  function renderGrid() {
    const s = Store.state, p = plate(); if (!p) return;
    const canDrag = !brush() && !eraser;
    let html = '<div class="hdr"></div>' + COLS96.map(c => `<div class="hdr" data-col="${c}">${c}</div>`).join('');
    for (const r of ROWS96) {
      html += `<div class="hdr" data-row="${r}">${r}</div>`;
      for (const c of COLS96) {
        const w = r + c, cond = p.layout[w], sid = p.placement[w], x = sid ? Store.sampleById(sid) : null;
        const cls = ['well', cond ? 'painted' : '', x ? 'placed' : '', conflictAt(p, w) ? 'conflict' : ''].join(' ');
        html += `<div class="${cls}" data-well="${w}" style="${cond ? `background:${Store.colorFor(cond)}` : ''}" ${x && canDrag ? 'draggable="true"' : ''}><span class="lbl">${x ? shortLabel(x) : w}</span></div>`;
      }
    }
    $('plateGrid').innerHTML = html;
    const nLay = Object.keys(p.layout).length, nPl = Object.keys(p.placement).length;
    $('plateInfo').textContent = `${nLay} wells in layout · ${nPl} runs placed`;
    const conf = Object.keys(p.placement).filter(w => conflictAt(p, w)).length;
    $('conflictInfo').textContent = conf ? `${conf} well${conf > 1 ? 's' : ''} disagree with the table` : '';
    $('conflictInfo').style.color = conf ? 'var(--red)' : '';
  }
  function shortLabel(x) { const rep = x.values.replicate; const c = x.values.condition; if (c) return (c.length > 5 ? c.slice(0, 4) + '…' : c) + (rep ? rep : ''); const m = /_(\d{1,3})$/.exec(x.name); return m ? m[1] : '●'; }
  function renderPlates() {
    const s = Store.state;
    $('plateSelect').innerHTML = s.plates.map((p, i) => `<option value="${i}"${i === s.ui.activePlate ? ' selected' : ''}>${escapeHtml(p.id)}</option>`).join('');
    $('btnRemovePlate').disabled = s.plates.length <= 1;
  }
  function renderUnplaced() {
    const list = Store.included().filter(x => !Store.placementOf(x.id));
    $('unplacedCount').textContent = list.length;
    $('unplacedList').innerHTML = list.length ? list.map(x => `<div class="item" draggable="true" data-id="${x.id}" title="${escapeHtml(x.name)}">${x.values.condition ? `<span class="cond-sw" style="background:${Store.colorFor(x.values.condition)}"></span>` : ''}${escapeHtml(x.name)}</div>`).join('') : '<div class="hint">Every included run is placed.</div>';
  }
  function tip(e, well) {
    const t = $('wellTip'), p = plate(); if (!well) { t.style.display = 'none'; return; }
    const sid = p.placement[well], x = sid ? Store.sampleById(sid) : null;
    t.innerHTML = `<b>${well}</b>${p.layout[well] ? ` · layout: ${escapeHtml(p.layout[well])}` : ''}${x ? `<br>${escapeHtml(x.name)}<br>table: ${escapeHtml(x.values.condition || '—')}` : '<br><i>empty</i>'}`;
    t.style.display = 'block'; t.style.left = (e.clientX + 12) + 'px'; t.style.top = (e.clientY + 12) + 'px';
  }
  function place(sampleId, well) {
    Store.update(s => {
      const p = plate();
      s.plates.forEach(q => { for (const [w, id] of Object.entries(q.placement)) if (id === sampleId) delete q.placement[w]; });   // move, not copy
      const occupant = p.placement[well];
      p.placement[well] = sampleId;
      if (occupant && occupant !== sampleId) { const from = Store.placementOf(sampleId); /* swap into the well the dragged run came from, if it had one */ if (dragFromWell && dragFromWell !== well) p.placement[dragFromWell] = occupant; }
    });
  }
  let dragFromWell = null;
  function freeWells(order) { const p = plate(); return order.filter(w => !p.placement[w]); }
  function fillInOrder(order) {
    const list = Store.included().filter(x => !Store.placementOf(x.id)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const wells = freeWells(order); let n = 0;
    Store.update(s => { const p = plate(); list.forEach((x, i) => { if (wells[i]) { p.placement[wells[i]] = x.id; n++; } }); });
    toast(n ? `${n} runs placed` : 'No free wells or nothing to place', n ? 'ok' : 'error');
  }

  Pages.plate = {
    init() {
      const g = $('plateGrid');
      g.addEventListener('mousedown', e => {
        const w = e.target.closest('.well'); if (!w || e.button !== 0) return;
        if (!brush() && !eraser) return;                                 // no brush → drag mode
        e.preventDefault(); painting = true; Store.snapshot();
        paintWell(plate(), w.dataset.well); renderGrid(); renderPalette();
      });
      g.addEventListener('mouseover', e => { const w = e.target.closest('.well'); if (painting && w) { paintWell(plate(), w.dataset.well); renderGrid(); } tip(e, w ? w.dataset.well : null); });
      g.addEventListener('mousemove', e => { const w = e.target.closest('.well'); if (w) tip(e, w.dataset.well); });
      g.addEventListener('mouseleave', () => tip(null, null));
      document.addEventListener('mouseup', () => { if (painting) { painting = false; Store.update(() => {}, { record: false }); } });
      g.addEventListener('click', e => {
        const h = e.target.closest('.hdr'); if (!h || (!brush() && !eraser)) return;
        Store.update(s => { const p = plate(); if (h.dataset.row) COLS96.forEach(c => paintWell(p, h.dataset.row + c)); else if (h.dataset.col) ROWS96.forEach(r => paintWell(p, r + h.dataset.col)); });
      });
      // drag & drop: from the unplaced list or from another well
      g.addEventListener('dragstart', e => { const w = e.target.closest('.well'); if (!w) return; dragId = plate().placement[w.dataset.well]; dragFromWell = w.dataset.well; e.dataTransfer.setData('text/plain', String(dragId)); e.dataTransfer.effectAllowed = 'move'; });
      $('unplacedList').addEventListener('dragstart', e => { const it = e.target.closest('.item'); if (!it) return; dragId = +it.dataset.id; dragFromWell = null; e.dataTransfer.setData('text/plain', it.dataset.id); e.dataTransfer.effectAllowed = 'move'; });
      g.addEventListener('dragover', e => { const w = e.target.closest('.well'); if (!w || dragId == null) return; e.preventDefault(); w.classList.add('over'); });
      g.addEventListener('dragleave', e => { const w = e.target.closest('.well'); if (w) w.classList.remove('over'); });
      g.addEventListener('drop', e => { const w = e.target.closest('.well'); if (!w || dragId == null) return; e.preventDefault(); place(dragId, w.dataset.well); dragId = null; dragFromWell = null; });
      // drop onto the unplaced list = unplace
      $('unplacedList').addEventListener('dragover', e => { if (dragFromWell) e.preventDefault(); });
      $('unplacedList').addEventListener('drop', e => { if (!dragFromWell) return; e.preventDefault(); Store.update(s => { delete plate().placement[dragFromWell]; }); dragId = null; dragFromWell = null; });

      $('btnEraser').addEventListener('click', () => { eraser = !eraser; if (eraser) Store.update(s => { s.ui.paint = null; }, { record: false }); else Pages.plate.render(); });
      $('btnAddCondition').addEventListener('click', () => { const v = $('inpNewCondition').value.trim(); if (!v) return; eraser = false; Store.update(s => { Store.colorFor(v); s.ui.paint = v; }); $('inpNewCondition').value = ''; });
      $('inpNewCondition').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnAddCondition').click(); });
      $('plateSelect').addEventListener('change', e => Store.update(s => { s.ui.activePlate = +e.target.value; }, { record: false }));
      $('btnAddPlate').addEventListener('click', () => Store.update(s => { let n = s.plates.length + 1; while (s.plates.some(p => p.id === 'P' + n)) n++; s.plates.push({ id: 'P' + n, format: 96, layout: {}, placement: {} }); s.ui.activePlate = s.plates.length - 1; }));
      $('btnRemovePlate').addEventListener('click', () => { if (Store.state.plates.length > 1 && confirm(`Remove plate ${plate().id}? Its runs stay in the table, unplaced.`)) Store.update(s => { s.plates.splice(s.ui.activePlate, 1); s.ui.activePlate = Math.max(0, s.ui.activePlate - 1); }); });
      $('btnClearLayout').addEventListener('click', () => Store.update(s => { plate().layout = {}; }));
      $('btnClearPlacement').addEventListener('click', () => Store.update(s => { plate().placement = {}; }));
      $('btnAutoPlace').addEventListener('click', () => {
        let n = 0, taken = 0, none = 0;
        Store.update(s => { const p = plate(); Store.included().filter(x => !Store.placementOf(x.id)).forEach(x => { const w = wellFromName(x.name); if (!w) { none++; return; } if (p.placement[w.well]) { taken++; return; } p.placement[w.well] = x.id; n++; }); });
        toast(`${n} placed by well ID${taken ? `, ${taken} wells already taken` : ''}${none ? `, ${none} names carry no well ID` : ''}`, n ? 'ok' : 'error');
      });
      $('btnFillRowWise').addEventListener('click', () => fillInOrder(wellsRowWise()));
      $('btnFillColWise').addEventListener('click', () => fillInOrder(wellsColumnWise()));
      $('btnApplyLayout').addEventListener('click', () => {
        let n = 0;
        Store.update(s => s.plates.forEach(p => { for (const [w, sid] of Object.entries(p.placement)) { const x = Store.sampleById(sid); if (x && p.layout[w] && x.values.condition !== p.layout[w]) { x.values.condition = p.layout[w]; n++; } } }));
        toast(n ? `${n} conditions written to the table` : 'Table already matches the layout', 'ok');
      });
      $('btnSyncLayout').addEventListener('click', () => {
        let n = 0;
        Store.update(s => s.plates.forEach(p => { for (const [w, sid] of Object.entries(p.placement)) { const x = Store.sampleById(sid); const c = x && (x.values.condition || '').trim(); if (c && p.layout[w] !== c) { p.layout[w] = c; Store.colorFor(c); n++; } } }));
        toast(n ? `${n} wells updated from the table` : 'Layout already matches the table', 'ok');
      });
    },
    render() { renderPlates(); renderPalette(); renderGrid(); renderUnplaced(); },
  };
})();
