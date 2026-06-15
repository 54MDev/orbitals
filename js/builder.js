const COLS = 9;
const ROWS = 16;

const PART_DEFS = {
  pod: {
    w: 1, h: 2,
    dryMass: 800,
  },
  tank: {
    w: 1, h: 3,
    dryMass: 200,
    fuelMass: 1_800,
  },
  engine: {
    w: 1, h: 2,
    dryMass: 300,
    thrust: 150_000,
    isp: 300,
  },
  decoupler: {
    w: 1, h: 1,
    dryMass: 50,
  },
};

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
// All receive (ctx, px, py, cw, ch, alpha) — px/py = top-left pixel, cw/ch = pixel size.

function drawPod(ctx, px, py, cw, ch, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;

  const bx = px + cw * 0.15, bw = cw * 0.7;
  const by = py + ch * 0.38, bh = ch * 0.62;

  // Body
  ctx.fillStyle = '#7aaae8';
  ctx.fillRect(bx, by, bw, bh);

  // Subtle side highlight
  ctx.fillStyle = 'rgba(180, 220, 255, 0.1)';
  ctx.fillRect(bx, by, bw * 0.32, bh);

  // Nose cone
  ctx.fillStyle = '#9dc4ff';
  ctx.beginPath();
  ctx.moveTo(px + cw * 0.5,  py + ch * 0.05);
  ctx.lineTo(px + cw * 0.85, py + ch * 0.38);
  ctx.lineTo(px + cw * 0.15, py + ch * 0.38);
  ctx.closePath();
  ctx.fill();

  // Window
  ctx.fillStyle = 'rgba(0, 200, 255, 0.5)';
  ctx.beginPath();
  ctx.arc(px + cw * 0.5, py + ch * 0.57, cw * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(180, 230, 255, 0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Outline
  ctx.strokeStyle = 'rgba(140, 195, 255, 0.28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, bw, bh);

  ctx.restore();
}

function drawTank(ctx, px, py, cw, ch, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;

  const pad = cw * 0.12;
  const tx  = px + pad, tw = cw - pad * 2;

  // Body
  ctx.fillStyle = '#2d5a80';
  ctx.fillRect(tx, py + 1, tw, ch - 2);

  // Side highlight
  ctx.fillStyle = 'rgba(100, 180, 255, 0.1)';
  ctx.fillRect(tx, py + 1, tw * 0.3, ch - 2);

  // Horizontal band lines
  ctx.strokeStyle = 'rgba(80, 160, 220, 0.2)';
  ctx.lineWidth   = 1;
  const bands     = 3;
  for (let i = 1; i < bands; i++) {
    const by = py + 1 + (ch - 2) * (i / bands);
    ctx.beginPath();
    ctx.moveTo(tx, by);
    ctx.lineTo(tx + tw, by);
    ctx.stroke();
  }

  // Border
  ctx.strokeStyle = 'rgba(70, 155, 215, 0.32)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(tx, py + 1, tw, ch - 2);

  ctx.restore();
}

function drawEngine(ctx, px, py, cw, ch, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;

  const splitY = py + ch * 0.5;

  // Housing (wide trapezoid at top)
  const topW = cw * 0.72, midW = cw * 0.42;
  ctx.fillStyle = '#507060';
  ctx.beginPath();
  ctx.moveTo(px + (cw - topW) / 2, py);
  ctx.lineTo(px + (cw + topW) / 2, py);
  ctx.lineTo(px + (cw + midW) / 2, splitY);
  ctx.lineTo(px + (cw - midW) / 2, splitY);
  ctx.closePath();
  ctx.fill();

  // Bell nozzle (widens toward exit)
  const bellW = cw * 0.72;
  ctx.fillStyle = '#3e5848';
  ctx.beginPath();
  ctx.moveTo(px + (cw - midW)  / 2, splitY);
  ctx.lineTo(px + (cw + midW)  / 2, splitY);
  ctx.lineTo(px + (cw + bellW) / 2, py + ch - 1);
  ctx.lineTo(px + (cw - bellW) / 2, py + ch - 1);
  ctx.closePath();
  ctx.fill();

  // Dark nozzle throat
  const throatW = cw * 0.26;
  ctx.fillStyle = '#18241e';
  ctx.beginPath();
  ctx.moveTo(px + (cw - throatW) / 2,       splitY + 1);
  ctx.lineTo(px + (cw + throatW) / 2,       splitY + 1);
  ctx.lineTo(px + (cw + throatW * 1.7) / 2, py + ch - 2);
  ctx.lineTo(px + (cw - throatW * 1.7) / 2, py + ch - 2);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawDecoupler(ctx, px, py, cw, ch, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;

  const pad = cw * 0.06;
  const bh  = ch * 0.5;
  const bx  = px + pad,       bw = cw - pad * 2;
  const by  = py + (ch - bh) / 2;

  // Band body
  ctx.fillStyle = '#a88028';
  ctx.fillRect(bx, by, bw, bh);

  // Diagonal hatch (clipped to band)
  ctx.save();
  ctx.beginPath();
  ctx.rect(bx, by, bw, bh);
  ctx.clip();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.lineWidth   = 2;
  for (let x = -bh; x < bw + bh; x += 9) {
    ctx.beginPath();
    ctx.moveTo(bx + x,      by);
    ctx.lineTo(bx + x + bh, by + bh);
    ctx.stroke();
  }
  ctx.restore();

  // Border
  ctx.strokeStyle = 'rgba(255, 195, 45, 0.5)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(bx, by, bw, bh);

  ctx.restore();
}

const DRAW_FNS = { pod: drawPod, tank: drawTank, engine: drawEngine, decoupler: drawDecoupler };

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

function updateStats() {
  let dryMass = 0, fuelMass = 0, thrust = 0;
  let hasPod = false, hasEngine = false, hasFuel = false;

  for (const p of placedParts) {
    const def  = PART_DEFS[p.type];
    dryMass   += def.dryMass  || 0;
    fuelMass  += def.fuelMass || 0;
    thrust    += def.thrust   || 0;
    if (p.type === 'pod')         hasPod    = true;
    if (p.type === 'engine')      hasEngine = true;
    if ((def.fuelMass || 0) > 0)  hasFuel   = true;
  }

  const total = dryMass + fuelMass;
  const twr   = thrust > 0 && total > 0 ? (thrust / (total * 9.81)).toFixed(2) : '—';

  document.getElementById('stat-mass').textContent   = total   > 0 ? `${(total   / 1000).toFixed(1)} t`  : '—';
  document.getElementById('stat-fuel').textContent   = fuelMass > 0 ? `${(fuelMass / 1000).toFixed(1)} t` : '—';
  document.getElementById('stat-thrust').textContent = thrust  > 0 ? `${(thrust  / 1000).toFixed(0)} kN` : '—';
  document.getElementById('stat-twr').textContent    = twr;

  const errors = [];
  if (!hasPod)    errors.push('No pod');
  if (!hasEngine) errors.push('No engine');
  if (!hasFuel)   errors.push('No fuel');

  const el = document.getElementById('validation');
  if (placedParts.length === 0) {
    el.textContent = 'Place parts to begin';
    el.className   = 'invalid';
  } else if (errors.length === 0) {
    el.textContent = '✓  Ready to launch';
    el.className   = 'valid';
  } else {
    el.textContent = errors.join(' · ');
    el.className   = 'invalid';
  }
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

updateStats();
requestAnimationFrame(render);
