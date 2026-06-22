import { PART_DEFS, DRAW_FNS } from './parts.js';

const COLS = 18;
const ROWS = 32;
const GRID_VERSION = 5;

let _partIdCounter = 0;

function nextPartId() {
  return `part_${_partIdCounter++}`;
}

function syncPartIdCounter(parts) {
  if (!parts) return;
  for (const p of parts) {
    if (typeof p.id === 'string' && p.id.startsWith('part_')) {
      const n = parseInt(p.id.slice(5), 10);
      if (!isNaN(n) && n >= _partIdCounter) _partIdCounter = n + 1;
    }
  }
}

// Assigns stageIndex to all engines and decouplers based on their position.
// KSP convention: the bottom segment fires FIRST and carries the HIGHEST stage
// number; the top (pod) segment fires LAST and is stage 0. So a part's stage is
// (total decouplers) − (decouplers below it). Returns a new parts array.
// When force=false (default), skips parts that already have stageIndex defined
// (including null = explicitly unassigned by the user).
function autoAssignStages(parts, force = false) {
  const decouplers = parts.filter(p => p.type === 'decoupler');
  const decCount = decouplers.length;

  return parts.map(p => {
    if (p.type !== 'engine' && p.type !== 'decoupler') return { ...p };
    if (!force && 'stageIndex' in p) return { ...p };
    const belowCount = decouplers.filter(d => d !== p && d.row > p.row).length;
    return { ...p, stageIndex: decCount - belowCount };
  });
}

function computeStagesFromParts(parts) {
  const map = new Map();
  for (const p of parts) {
    if (p.type !== 'engine' && p.type !== 'decoupler') continue;
    if (p.stageIndex == null) continue;
    if (!map.has(p.stageIndex)) map.set(p.stageIndex, []);
    if (p.id) map.get(p.stageIndex).push(p.id);
  }
  if (map.size === 0) return [{ index: 0, label: 'Stage 1', partIds: [] }];
  const maxIdx = Math.max(...map.keys());
  const stages = [];
  for (let i = 0; i <= maxIdx; i++) {
    stages.push({ index: i, label: `Stage ${i + 1}`, partIds: map.get(i) || [] });
  }
  return stages;
}

// Rebuilds module-level stages from placedParts, preserving user-edited labels.
function refreshStages() {
  const computed = computeStagesFromParts(placedParts);
  stages = computed.map(cs => {
    const existing = stages.find(s => s.index === cs.index);
    return { ...cs, label: existing ? existing.label : cs.label };
  });
}

// Returns stages array with per-stage dv (number|null) added.
//
// This simulates the firing sequence the same way Rocket.doStage() does, so the
// numbers stay correct under any stage assignment (manual or auto). Stages fire
// from the highest index down to 0. Each stage burns the fuel in the contiguous
// physical band that holds its engines (split by decouplers), then its decoupler
// drops everything physically below it among the still-attached parts. Because
// the band boundaries come from sorted decoupler rows — never from stage-number
// order — manual reassignment can't invert a segment and silently zero the ΔV.
function computeStageDv() {
  const g0 = 9.80665;
  const wetMass = parts => parts.reduce((s, p) => {
    const def = PART_DEFS[p.type];
    return s + (def.dryMass || 0) + (def.fuelMass || 0);
  }, 0);

  let attached = placedParts.map(p => ({ ...p }));
  let attachedWet = wetMass(attached);

  const maxStage = placedParts.reduce(
    (m, p) => (p.stageIndex != null && p.stageIndex > m ? p.stageIndex : m), 0
  );

  const dvByStage = new Map();

  for (let S = maxStage; S >= 0; S--) {
    const engines = attached.filter(
      p => p.type === 'engine' && p.enabled !== false && p.stageIndex === S
    );

    // Fuel feeding this stage = fuel in the band that holds its engines, bounded
    // above and below by the nearest decouplers still attached.
    let segFuel = 0;
    if (engines.length > 0) {
      const engineRow = Math.max(...engines.map(p => p.row));
      let upper = -1, lower = ROWS;  // nearest decoupler rows above / below the engines
      for (const p of attached) {
        if (p.type !== 'decoupler') continue;
        if (p.row < engineRow && p.row > upper) upper = p.row;
        if (p.row > engineRow && p.row < lower) lower = p.row;
      }
      for (const p of attached) {
        if (p.type === 'tank' && p.row > upper && p.row < lower)
          segFuel += PART_DEFS[p.type].fuelMass || 0;
      }
    }

    const avgIsp = engines.length > 0
      ? engines.reduce((s, p) => s + (PART_DEFS[p.type].isp || 300), 0) / engines.length
      : 0;

    const m0 = attachedWet;
    const m1 = m0 - segFuel;
    const dv = engines.length > 0 && avgIsp > 0 && segFuel > 0 && m1 > 0
      ? avgIsp * g0 * Math.log(m0 / m1)
      : null;
    dvByStage.set(S, dv);

    // Fire this stage's decoupler (bottom-most if several): drop everything below
    // it. Otherwise the burned fuel still leaves, lightening the upper stages.
    const decRow = attached
      .filter(p => p.type === 'decoupler' && p.stageIndex === S)
      .reduce((r, p) => Math.max(r, p.row), -Infinity);
    if (decRow > -Infinity) {
      const dropped = attached.filter(p => p.row >= decRow);
      const remaining = attached.filter(p => p.row < decRow);
      if (remaining.length > 0) {
        attachedWet -= wetMass(dropped);
        attached = remaining;
      } else {
        attachedWet -= segFuel;
      }
    } else {
      attachedWet -= segFuel;
    }
  }

  return stages.map(stage => ({
    ...stage,
    dv: dvByStage.has(stage.index) ? dvByStage.get(stage.index) : null,
  }));
}

function migratePartsToCurrentGrid(parts, fromVersion) {
  if (!parts) return parts;
  let result = parts;
  const v = fromVersion || 1;
  if (v < 2) {
    result = result.map(p => ({ ...p, col: p.col * 2, row: p.row * 2 }));
  }
  if (v < 3) {
    // pod/engine h: 4→2, decoupler h: 2→1 — rows below each part shift up
    // Simplest safe migration: keep positions, gaps may appear between parts.
    // User can re-stack if needed.
  }
  if (v < 4) {
    let counter = 0;
    result = result.map(p => ({
      ...p,
      id: p.id ?? `part_${counter++}`,
      ...(p.type === 'engine' && p.enabled == null ? { enabled: true } : {}),
    }));
    result = autoAssignStages(result);
  }
  if (v < 5) {
    // Stage numbering inverted (bottom segment is now the HIGHEST stage). Force a
    // re-assign so old saves fire in the correct order.
    result = autoAssignStages(result, true);
  }
  return result;
}

const canvas = document.getElementById('grid-canvas');
const ctx    = canvas.getContext('2d');

let placedParts       = [];   // { type, col, row }
let stages            = [];   // [{ index, label, partIds }] — authoritative staging state
let selectedType      = 'pod';
let hoverCell         = null; // { col, row } — grid cell under the cursor
let hoveredPartId     = null; // part id hovered in the staging panel
let activePreviewStage = null; // stage index selected in panel for preview (null = all active)

// ── Zoom / pan state ──────────────────────────────────────────────────────────

const MAX_CELL_PX = 300;
let viewZoom = 1.0;
let viewOffX = 0;
let viewOffY = 0;

// ── Layout ────────────────────────────────────────────────────────────────────

function resize() {
  const sidebar      = document.getElementById('sidebar');
  const sidebarRight = document.getElementById('sidebar-right');
  canvas.width  = window.innerWidth  - sidebar.offsetWidth - sidebarRight.offsetWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

function baseCellSize() {
  return Math.floor(Math.min(canvas.width * 0.88 / COLS, canvas.height * 0.88 / ROWS));
}

function cellSize() {
  return baseCellSize() * viewZoom;
}

function gridOrigin() {
  const cs = cellSize();
  return {
    x: Math.floor((canvas.width  - COLS * cs) / 2) + viewOffX,
    y: Math.floor((canvas.height - ROWS * cs) / 2) + viewOffY,
  };
}

// ── Grid helpers ──────────────────────────────────────────────────────────────

function screenToCell(sx, sy) {
  const cs = cellSize();
  const o  = gridOrigin();
  return { col: Math.floor((sx - o.x) / cs), row: Math.floor((sy - o.y) / cs) };
}

function cellInBounds(col, row) {
  return col >= 0 && row >= 0 && col < COLS && row < ROWS;
}

function occupiedCells(part) {
  const def   = PART_DEFS[part.type];
  const cells = [];
  for (let dc = 0; dc < def.w; dc++)
    for (let dr = 0; dr < def.h; dr++)
      cells.push({ col: part.col + dc, row: part.row + dr });
  return cells;
}

function cellOccupied(col, row) {
  return placedParts.some(p => occupiedCells(p).some(c => c.col === col && c.row === row));
}

function partAtCell(col, row) {
  return placedParts.find(p => occupiedCells(p).some(c => c.col === col && c.row === row));
}

function canPlace(type, col, row) {
  const def = PART_DEFS[type];
  if (col < 0 || row < 0 || col + def.w > COLS || row + def.h > ROWS) return false;
  for (let dc = 0; dc < def.w; dc++)
    for (let dr = 0; dr < def.h; dr++)
      if (cellOccupied(col + dc, row + dr)) return false;
  return true;
}

// ── Part draw functions ───────────────────────────────────────────────────────

function drawPartAt(type, col, row, alpha = 1) {
  const def = PART_DEFS[type];
  const cs  = cellSize();
  const o   = gridOrigin();
  DRAW_FNS[type](ctx, o.x + col * cs, o.y + row * cs, def.w * cs, def.h * cs, alpha);
}

// ── Render loop ───────────────────────────────────────────────────────────────

function render() {
  ctx.fillStyle = '#08080f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cs = cellSize();
  const o  = gridOrigin();
  const gw = COLS * cs, gh = ROWS * cs;

  // Fine grid lines (every cell — faint guides for fine snapping)
  ctx.strokeStyle = 'rgba(55, 105, 175, 0.05)';
  ctx.lineWidth   = 1;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(Math.round(o.x + c * cs) + 0.5, o.y);
    ctx.lineTo(Math.round(o.x + c * cs) + 0.5, o.y + gh);
    ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(o.x,      Math.round(o.y + r * cs) + 0.5);
    ctx.lineTo(o.x + gw, Math.round(o.y + r * cs) + 0.5);
    ctx.stroke();
  }

  // Coarse grid lines (every 2 cells — aligns with part boundaries)
  ctx.strokeStyle = 'rgba(55, 105, 175, 0.18)';
  for (let c = 0; c <= COLS; c += 2) {
    ctx.beginPath();
    ctx.moveTo(Math.round(o.x + c * cs) + 0.5, o.y);
    ctx.lineTo(Math.round(o.x + c * cs) + 0.5, o.y + gh);
    ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r += 2) {
    ctx.beginPath();
    ctx.moveTo(o.x,      Math.round(o.y + r * cs) + 0.5);
    ctx.lineTo(o.x + gw, Math.round(o.y + r * cs) + 0.5);
    ctx.stroke();
  }

  // Grid border
  ctx.strokeStyle = 'rgba(55, 105, 175, 0.28)';
  ctx.lineWidth   = 1.5;
  ctx.strokeRect(o.x, o.y, gw, gh);

  // Placed parts
  for (const part of placedParts) {
    const isManuallyDisabled = part.type === 'engine' && part.enabled === false;
    const isStageDimmed = activePreviewStage != null
      && part.type === 'engine'
      && part.stageIndex !== activePreviewStage;
    const isDisabled = isManuallyDisabled || isStageDimmed;
    drawPartAt(part.type, part.col, part.row, isDisabled ? 0.35 : 1);
    if (isManuallyDisabled) {
      const def = PART_DEFS[part.type];
      const px  = o.x + part.col * cs;
      const py  = o.y + part.row * cs;
      const cw  = def.w * cs;
      const ch  = def.h * cs;
      ctx.save();
      ctx.strokeStyle = 'rgba(220, 60, 60, 0.8)';
      ctx.lineWidth   = 2;
      ctx.beginPath(); ctx.moveTo(px,      py);      ctx.lineTo(px + cw, py + ch); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px + cw, py);      ctx.lineTo(px,      py + ch); ctx.stroke();
      ctx.restore();
    }
    if (part.id === hoveredPartId) {
      const def   = PART_DEFS[part.type];
      const px    = o.x + part.col * cs;
      const py    = o.y + part.row * cs;
      const cw    = def.w * cs;
      const ch    = def.h * cs;
      const color = part.type === 'engine' ? '143,208,182' : '226,191,108';
      ctx.save();
      ctx.fillStyle   = `rgba(${color},0.18)`;
      ctx.fillRect(px, py, cw, ch);
      ctx.strokeStyle = `rgba(${color},0.9)`;
      ctx.lineWidth   = 2;
      ctx.strokeRect(px + 1, py + 1, cw - 2, ch - 2);
      ctx.restore();
    }
  }

  // Hover ghost
  if (hoverCell) {
    const { col, row } = hoverCell;
    const def = PART_DEFS[selectedType];
    if (canPlace(selectedType, col, row)) {
      drawPartAt(selectedType, col, row, 0.42);
    } else {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle   = '#ff2828';
      ctx.fillRect(o.x + col * cs, o.y + row * cs, def.w * cs, def.h * cs);
      ctx.restore();
    }
  }

  requestAnimationFrame(render);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function computeDesign() {
  let dryMass = 0, fuelMass = 0, maxThrust = 0, ispSum = 0, engineCount = 0;
  let hasPod = false, hasEngine = false, hasFuel = false;

  for (const p of placedParts) {
    const def = PART_DEFS[p.type];
    dryMass  += def.dryMass  || 0;
    fuelMass += def.fuelMass || 0;
    if (p.type === 'engine' && p.enabled !== false) {
      maxThrust += def.thrust || 0;
      if (def.isp) { ispSum += def.isp; engineCount++; }
      hasEngine = true;
    }
    if (p.type === 'pod')        hasPod  = true;
    if ((def.fuelMass || 0) > 0) hasFuel = true;
  }

  const errors = [];
  if (!hasPod)    errors.push('No pod');
  if (!hasEngine) errors.push('No engine');
  if (!hasFuel)   errors.push('No fuel');

  const unassignedEng = placedParts.filter(p => p.type === 'engine'    && p.stageIndex == null).length;
  const unassignedDcp = placedParts.filter(p => p.type === 'decoupler' && p.stageIndex == null).length;
  if (unassignedEng) errors.push('Unassigned engines');
  if (unassignedDcp) errors.push('Unassigned decouplers');

  return {
    gridVersion: GRID_VERSION,
    parts: placedParts.map(p => ({ ...p })),
    stages: stages.map(s => ({ ...s })),
    dryMass,
    fuelMass,
    maxThrust,
    isp: engineCount > 0 ? ispSum / engineCount : 300,
    valid: errors.length === 0,
    errors,
  };
}

function updateStats() {
  refreshStages();
  const d     = computeDesign();
  const total = d.dryMass + d.fuelMass;
  const twr   = d.maxThrust > 0 && total > 0 ? (d.maxThrust / (total * 9.81)).toFixed(2) : '—';

  document.getElementById('stat-mass').textContent   = total       > 0 ? `${(total       / 1000).toFixed(1)} t`  : '—';
  document.getElementById('stat-fuel').textContent   = d.fuelMass  > 0 ? `${(d.fuelMass  / 1000).toFixed(1)} t` : '—';
  document.getElementById('stat-thrust').textContent = d.maxThrust > 0 ? `${(d.maxThrust / 1000).toFixed(0)} kN` : '—';
  document.getElementById('stat-twr').textContent    = twr;

  const el = document.getElementById('validation');
  if (placedParts.length === 0) {
    el.textContent = 'Place parts to begin';
    el.className   = 'invalid';
  } else if (d.valid) {
    el.textContent = '✓  Ready to launch';
    el.className   = 'valid';
  } else {
    el.textContent = d.errors.join(' · ');
    el.className   = 'invalid';
  }

  document.getElementById('nav-launch').disabled = !d.valid;
  renderStagingPanel();
}

// ── Staging panel ─────────────────────────────────────────────────────────────

function formatDv(dv) {
  return Math.round(dv).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function svgIcon(type) {
  if (type === 'engine') {
    return `<svg class="pico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M9 4 h6 v4 l3.5 11 h-13 l3.5-11 z"/><line x1="6" y1="19" x2="18" y2="19"/></svg>`;
  }
  if (type === 'decoupler') {
    return `<svg class="pico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="5" y="6.5" width="14" height="3.2" rx="0.6"/><rect x="5" y="14.3" width="14" height="3.2" rx="0.6"/><line x1="4.5" y1="12" x2="19.5" y2="12" stroke-dasharray="2 2"/></svg>`;
  }
  return '';
}

let _dragSrcIndex = null;
let _dragPartId   = null;

function clearDragHighlight(stack) {
  stack.querySelectorAll('.stg-row').forEach(r => r.classList.remove('drag-over'));
}

function movePartToStage(partId, stageIndex) {
  placedParts = placedParts.map(p =>
    p.id === partId ? { ...p, stageIndex } : p
  );
  updateStats();
}

function makeTile(part) {
  const tile = document.createElement('span');
  tile.className = `stg-tile${part.type === 'engine' ? ' is-engine' : ' is-decoupler'}`;
  tile.title = part.type.charAt(0).toUpperCase() + part.type.slice(1);
  tile.innerHTML = svgIcon(part.type);
  tile.draggable = true;
  tile.dataset.partId = part.id;

  tile.addEventListener('mouseenter', () => { hoveredPartId = part.id; });
  tile.addEventListener('mouseleave', () => { hoveredPartId = null; });

  tile.addEventListener('dragstart', e => {
    e.stopPropagation();
    _dragPartId   = part.id;
    _dragSrcIndex = null;
    e.dataTransfer.effectAllowed = 'move';
    tile.style.opacity = '0.4';
  });
  tile.addEventListener('dragend', () => {
    tile.style.opacity = '';
    hoveredPartId = null;
    clearDragHighlight(document.getElementById('stg-stack'));
  });

  return tile;
}

function reorderStage(fromIndex, toIndex) {
  const order = stages.map(s => s.index).sort((a, b) => a - b);
  const fromPos = order.indexOf(fromIndex);
  const toPos   = order.indexOf(toIndex);
  if (fromPos === -1 || toPos === -1) return;
  order.splice(fromPos, 1);
  order.splice(toPos, 0, fromIndex);

  const remap = new Map(order.map((oldIdx, newIdx) => [oldIdx, newIdx]));
  placedParts = placedParts.map(p =>
    p.stageIndex != null && remap.has(p.stageIndex)
      ? { ...p, stageIndex: remap.get(p.stageIndex) }
      : p
  );
  stages = stages.map(s => ({ ...s, index: remap.get(s.index) ?? s.index }));
  updateStats();
}

function renderStagingPanel() {
  const dvStages = computeStageDv();
  const stack = document.getElementById('stg-stack');
  stack.innerHTML = '';

  const maxDv = Math.max(0, ...dvStages.map(s => s.dv ?? 0));

  // Highest stage fires first → show it at the top of the list (KSP convention).
  const ordered = [...dvStages].sort((a, b) => b.index - a.index);
  for (const stage of ordered) {
    const hasEngine = placedParts.some(
      p => p.type === 'engine' && p.stageIndex === stage.index && p.enabled !== false
    );
    const stageParts = placedParts.filter(
      p => (p.type === 'engine' || p.type === 'decoupler') && p.stageIndex === stage.index
    );

    const row = document.createElement('div');
    row.className = activePreviewStage === stage.index ? 'stg-row is-active' : 'stg-row';
    row.dataset.stageIndex = stage.index;

    row.addEventListener('dragover', e => {
      if (_dragPartId == null && _dragSrcIndex == null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearDragHighlight(stack);
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', e => {
      if (!row.contains(e.relatedTarget)) row.classList.remove('drag-over');
    });
    row.addEventListener('drop', e => {
      e.preventDefault();
      const targetIndex = parseInt(row.dataset.stageIndex);
      if (_dragPartId != null) {
        movePartToStage(_dragPartId, targetIndex);
        _dragPartId = null;
      } else if (_dragSrcIndex != null && _dragSrcIndex !== targetIndex) {
        reorderStage(_dragSrcIndex, targetIndex);
        _dragSrcIndex = null;
      }
      clearDragHighlight(stack);
    });

    // Top bar: stage number + optional Δv box — click to set preview stage
    const topbar = document.createElement('div');
    topbar.className = 'stg-topbar';
    topbar.style.cursor = 'pointer';
    topbar.title = 'Click to preview this stage';
    topbar.addEventListener('click', () => {
      activePreviewStage = activePreviewStage === stage.index ? null : stage.index;
      document.getElementById('stg-cur-val').textContent =
        activePreviewStage != null ? String(activePreviewStage) : 'none';
      renderStagingPanel();
    });

    const numEl = document.createElement('span');
    numEl.className = 'stg-num';
    numEl.textContent = stage.index;
    topbar.appendChild(numEl);

    if (hasEngine && stage.dv != null) {
      const barPct = maxDv > 0 ? (stage.dv / maxDv * 100).toFixed(1) : '0';
      const dvBox = document.createElement('div');
      dvBox.className = 'stg-dv';
      dvBox.innerHTML =
        `<div class="stg-dv-top">` +
          `<span class="stg-dv-k">ΔV</span>` +
          `<span class="stg-dv-v">${formatDv(stage.dv)} <small>m/s</small></span>` +
        `</div>` +
        `<div class="stg-dv-bar"><i style="width:${barPct}%"></i></div>`;
      topbar.appendChild(dvBox);
    }

    // Icon row: one tile per part instance + stage-reorder grip
    const iconrow = document.createElement('div');
    iconrow.className = 'stg-iconrow';

    const icons = document.createElement('div');
    icons.className = 'stg-icons';
    for (const part of stageParts) {
      icons.appendChild(makeTile(part));
    }

    const grip = document.createElement('span');
    grip.className = 'stg-grip';
    grip.title = 'Drag to reorder stage';
    grip.draggable = true;
    grip.addEventListener('dragstart', e => {
      e.stopPropagation();
      _dragSrcIndex = stage.index;
      _dragPartId   = null;
      e.dataTransfer.effectAllowed = 'move';
      row.style.opacity = '0.45';
    });
    grip.addEventListener('dragend', () => {
      row.style.opacity = '';
      clearDragHighlight(stack);
      _dragSrcIndex = null;
    });

    iconrow.append(icons, grip);
    row.append(topbar, iconrow);
    stack.appendChild(row);
  }

  const totalDv = dvStages.reduce((sum, s) => sum + (s.dv ?? 0), 0);
  document.getElementById('stat-total-dv').textContent =
    dvStages.some(s => s.dv != null) ? `${formatDv(totalDv)} m/s` : '—';
}

function addStage() {
  placedParts = placedParts.map(p => {
    if ((p.type === 'engine' || p.type === 'decoupler') && p.stageIndex != null)
      return { ...p, stageIndex: p.stageIndex + 1 };
    return p;
  });
  stages = [
    { index: 0, label: 'Stage 1', partIds: [] },
    ...stages.map(s => ({ ...s, index: s.index + 1 })),
  ];
  updateStats();
}

function deleteStage(index) {
  placedParts = placedParts.map(p => {
    if (p.type !== 'engine' && p.type !== 'decoupler') return p;
    if (p.stageIndex === index) return { ...p, stageIndex: null };
    if (p.stageIndex != null && p.stageIndex > index) return { ...p, stageIndex: p.stageIndex - 1 };
    return p;
  });
  stages = stages
    .filter(s => s.index !== index)
    .map(s => s.index > index ? { ...s, index: s.index - 1 } : s);
  updateStats();
}

// ── Input ─────────────────────────────────────────────────────────────────────

let panStart  = null; // { x, y, offX, offY } — set on mousedown
let wasDragged = false;

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  e.stopPropagation();
  hideCtxMenu();
  const rect = canvas.getBoundingClientRect();
  const mx   = e.clientX - rect.left;
  const my   = e.clientY - rect.top;

  const factor  = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  const maxZoom = MAX_CELL_PX / baseCellSize();
  const newZoom = Math.max(1, Math.min(maxZoom, viewZoom * factor));

  if (newZoom === viewZoom) return;

  // Keep the world point under the cursor fixed during zoom
  const cs_old = baseCellSize() * viewZoom;
  const cs_new = baseCellSize() * newZoom;
  const ox_old = Math.floor((canvas.width  - COLS * cs_old) / 2) + viewOffX;
  const oy_old = Math.floor((canvas.height - ROWS * cs_old) / 2) + viewOffY;
  const cellX  = (mx - ox_old) / cs_old;
  const cellY  = (my - oy_old) / cs_old;

  if (newZoom === 1) {
    viewOffX = 0;
    viewOffY = 0;
  } else {
    viewOffX = mx - cellX * cs_new - Math.floor((canvas.width  - COLS * cs_new) / 2);
    viewOffY = my - cellY * cs_new - Math.floor((canvas.height - ROWS * cs_new) / 2);
  }
  viewZoom = newZoom;
}, { passive: false });

canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  panStart   = { x: e.clientX, y: e.clientY, offX: viewOffX, offY: viewOffY };
  wasDragged = false;
});

canvas.addEventListener('mousemove', e => {
  if (panStart) {
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    if (!wasDragged && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) wasDragged = true;
    if (wasDragged) {
      viewOffX = panStart.offX + dx;
      viewOffY = panStart.offY + dy;
    }
  }

  const rect = canvas.getBoundingClientRect();
  const cell = screenToCell(e.clientX - rect.left, e.clientY - rect.top);
  hoverCell  = cellInBounds(cell.col, cell.row) ? cell : null;
});

canvas.addEventListener('mouseup', () => { panStart = null; });

canvas.addEventListener('mouseleave', () => { hoverCell = null; panStart = null; });

canvas.addEventListener('click', e => {
  if (wasDragged) return;
  if (!hoverCell) return;
  const { col, row } = hoverCell;
  if (canPlace(selectedType, col, row)) {
    const newPart = {
      type: selectedType, col, row,
      id: nextPartId(),
      ...(selectedType === 'engine' ? { enabled: true } : {}),
    };
    placedParts.push(newPart);
    placedParts = autoAssignStages(placedParts);
    updateStats();
  }
});

// ── Context menu ──────────────────────────────────────────────────────────────

let _ctxTarget = null;

function hideCtxMenu() {
  document.getElementById('ctx-menu').style.display = 'none';
  _ctxTarget = null;
}

function showCtxMenu(clientX, clientY, part) {
  _ctxTarget = part;
  const menu = document.getElementById('ctx-menu');
  menu.innerHTML = '';

  const addItem = (label, color, action) => {
    const btn = document.createElement('button');
    btn.className   = 'ctx-item';
    btn.textContent = label;
    if (color) btn.style.color = color;
    btn.addEventListener('click', () => { action(); hideCtxMenu(); });
    menu.appendChild(btn);
  };

  addItem('Remove part', null, () => {
    placedParts = placedParts.filter(p => p !== _ctxTarget);
    updateStats();
  });

  if (part.type === 'engine') {
    if (part.enabled !== false) {
      addItem('Disable engine', 'rgba(220, 60, 60, 0.9)', () => {
        _ctxTarget.enabled = false;
        updateStats();
      });
    } else {
      addItem('Enable engine', '#55c87a', () => {
        _ctxTarget.enabled = true;
        updateStats();
      });
    }
  }

  menu.style.left    = `${clientX}px`;
  menu.style.top     = `${clientY}px`;
  menu.style.display = 'block';
}

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (wasDragged) return;
  const rect = canvas.getBoundingClientRect();
  const cell = screenToCell(e.clientX - rect.left, e.clientY - rect.top);
  const hit  = cellInBounds(cell.col, cell.row) ? partAtCell(cell.col, cell.row) : null;
  if (hit) {
    showCtxMenu(e.clientX, e.clientY, hit);
  } else {
    hideCtxMenu();
  }
});

document.addEventListener('click', e => {
  const menu = document.getElementById('ctx-menu');
  if (menu.style.display !== 'none' && !menu.contains(e.target)) hideCtxMenu();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') hideCtxMenu();
});

document.querySelectorAll('.part-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedType = btn.dataset.part;
    document.querySelectorAll('.part-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

document.getElementById('clear-btn').addEventListener('click', () => {
  placedParts = [];
  updateStats();
});

document.getElementById('nav-launch').addEventListener('click', () => {
  const design = computeDesign();
  if (!design.valid) return;
  localStorage.setItem('rocketDesign', JSON.stringify(design));
  window.location.href = 'index.html';
});

// ── Save / Load designs ───────────────────────────────────────────────────────

const DESIGNS_KEY = 'savedDesigns';

function getSavedDesigns() {
  try { return JSON.parse(localStorage.getItem(DESIGNS_KEY)) || []; }
  catch { return []; }
}

function putSavedDesigns(designs) {
  localStorage.setItem(DESIGNS_KEY, JSON.stringify(designs));
}

function saveDesign() {
  const nameEl = document.getElementById('design-name');
  const name   = nameEl.value.trim() || 'Untitled';
  const designs = getSavedDesigns();
  const existing = designs.findIndex(d => d.name === name);
  const design = computeDesign();
  const entry = { name, ...design, savedAt: Date.now() };
  if (existing >= 0) designs[existing] = entry;
  else designs.push(entry);
  putSavedDesigns(designs);
  renderSavedList();
}

function loadSavedDesign(index) {
  const designs = getSavedDesigns();
  if (!designs[index]) return;
  placedParts = migratePartsToCurrentGrid(designs[index].parts, designs[index].gridVersion).map(p => ({ ...p }));
  syncPartIdCounter(placedParts);
  stages = Array.isArray(designs[index].stages) ? designs[index].stages.map(s => ({ ...s })) : [];
  document.getElementById('design-name').value = designs[index].name;
  updateStats();
}

function deleteSavedDesign(index) {
  const designs = getSavedDesigns();
  designs.splice(index, 1);
  putSavedDesigns(designs);
  renderSavedList();
}

function renderSavedList() {
  const list    = document.getElementById('saved-list');
  const designs = getSavedDesigns();
  list.innerHTML = '';
  if (designs.length === 0) {
    const p = document.createElement('p');
    p.className   = 'no-designs';
    p.textContent = 'No saved designs';
    list.appendChild(p);
    return;
  }
  designs.forEach((d, i) => {
    const row = document.createElement('div');
    row.className = 'design-row';
    row.innerHTML =
      `<span class="design-row-name">${d.name}</span>` +
      `<div class="design-row-actions">` +
        `<button class="design-load">LOAD</button>` +
        `<button class="design-del">✕</button>` +
      `</div>`;
    row.querySelector('.design-load').addEventListener('click', () => { loadSavedDesign(i); renderSavedList(); });
    row.querySelector('.design-del').addEventListener('click', () => deleteSavedDesign(i));
    list.appendChild(row);
  });
}

document.getElementById('save-btn').addEventListener('click', saveDesign);
document.getElementById('design-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveDesign();
});

// Restore builder state from last active design on page load
(function restoreDesign() {
  try {
    const saved = localStorage.getItem('rocketDesign');
    if (saved) {
      const d = JSON.parse(saved);
      if (Array.isArray(d.parts) && d.parts.length > 0) {
        placedParts = migratePartsToCurrentGrid(d.parts, d.gridVersion).map(p => ({ ...p }));
        syncPartIdCounter(placedParts);
      }
      if (Array.isArray(d.stages)) stages = d.stages.map(s => ({ ...s }));
    }
  } catch { /* ignore corrupt data */ }
})();

document.getElementById('auto-assign-btn').addEventListener('click', () => {
  placedParts = autoAssignStages(placedParts, true);
  stages = [];
  updateStats();
});
document.getElementById('add-stage-btn').addEventListener('click', addStage);

document.querySelector('.stg-reset').addEventListener('click', () => {
  placedParts = placedParts.map(p => {
    if (p.type !== 'engine' && p.type !== 'decoupler') return p;
    const { stageIndex, ...rest } = p;
    return rest;
  });
  stages = [];
  activePreviewStage = null;
  document.getElementById('stg-cur-val').textContent = 'none';
  updateStats();
});

updateStats();
renderSavedList();
requestAnimationFrame(render);
