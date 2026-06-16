import { PART_DEFS, DRAW_FNS } from './parts.js';

const COLS = 9;
const ROWS = 16;

const canvas = document.getElementById('grid-canvas');
const ctx    = canvas.getContext('2d');

let placedParts  = [];   // { type, col, row }
let selectedType = 'pod';
let hoverCell    = null; // { col, row } — grid cell under the cursor

// ── Layout ────────────────────────────────────────────────────────────────────

function resize() {
  const sidebar  = document.getElementById('sidebar');
  canvas.width   = window.innerWidth  - sidebar.offsetWidth;
  canvas.height  = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

function cellSize() {
  return Math.floor(Math.min(canvas.width * 0.88 / COLS, canvas.height * 0.88 / ROWS));
}

function gridOrigin() {
  const cs = cellSize();
  return {
    x: Math.floor((canvas.width  - COLS * cs) / 2),
    y: Math.floor((canvas.height - ROWS * cs) / 2),
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

  // Subtle grid lines
  ctx.strokeStyle = 'rgba(55, 105, 175, 0.11)';
  ctx.lineWidth   = 1;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(o.x + c * cs, o.y);
    ctx.lineTo(o.x + c * cs, o.y + gh);
    ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(o.x,      o.y + r * cs);
    ctx.lineTo(o.x + gw, o.y + r * cs);
    ctx.stroke();
  }

  // Grid border
  ctx.strokeStyle = 'rgba(55, 105, 175, 0.28)';
  ctx.lineWidth   = 1.5;
  ctx.strokeRect(o.x, o.y, gw, gh);

  // Placed parts
  for (const part of placedParts) drawPartAt(part.type, part.col, part.row);

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
    const def  = PART_DEFS[p.type];
    dryMass   += def.dryMass  || 0;
    fuelMass  += def.fuelMass || 0;
    maxThrust += def.thrust   || 0;
    if (def.isp) { ispSum += def.isp; engineCount++; }
    if (p.type === 'pod')        hasPod    = true;
    if (p.type === 'engine')     hasEngine = true;
    if ((def.fuelMass || 0) > 0) hasFuel   = true;
  }

  const errors = [];
  if (!hasPod)    errors.push('No pod');
  if (!hasEngine) errors.push('No engine');
  if (!hasFuel)   errors.push('No fuel');

  return {
    parts: placedParts.map(p => ({ ...p })),
    dryMass,
    fuelMass,
    maxThrust,
    isp: engineCount > 0 ? ispSum / engineCount : 300,
    valid: errors.length === 0,
    errors,
  };
}

function updateStats() {
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
}

// ── Input ─────────────────────────────────────────────────────────────────────

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const cell = screenToCell(e.clientX - rect.left, e.clientY - rect.top);
  hoverCell  = cellInBounds(cell.col, cell.row) ? cell : null;
});

canvas.addEventListener('mouseleave', () => { hoverCell = null; });

canvas.addEventListener('click', e => {
  if (!hoverCell) return;
  const { col, row } = hoverCell;
  if (canPlace(selectedType, col, row)) {
    placedParts.push({ type: selectedType, col, row });
    updateStats();
  }
});

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (!hoverCell) return;
  const hit = partAtCell(hoverCell.col, hoverCell.row);
  if (hit) {
    placedParts = placedParts.filter(p => p !== hit);
    updateStats();
  }
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

updateStats();
requestAnimationFrame(render);
