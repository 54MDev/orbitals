import { GameLoop } from './GameLoop.js';
import { Camera } from './Camera.js';
import { Planet } from './Planet.js';
import { Starfield } from './Starfield.js';
import { Rocket } from './Rocket.js';
import { Stage } from './Stage.js';
import { Input } from './Input.js';
import { Trajectory, ORBIT_SAMPLES } from './Trajectory.js';
import { PLANET, ROCKET, CAMERA, PHYSICS_BUBBLE_RADIUS } from './constants.js';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

const planet = new Planet();
const camera = new Camera(canvas.width, canvas.height);
const starfield = new Starfield();
const rocket = new Rocket();
const input = new Input();
const trajectory = new Trajectory();
const droppedStages = [];

camera.target = rocket;

// --- Map camera (independent of flight camera) ---
const mapCam = {
  x: 0,
  y: 0,
  _logZoom: Math.log(5e-6),
  rotation: 0,
  lockTarget: 'rocket', // 'rocket' | 'planet' | null
  get zoom() { return Math.exp(this._logZoom); },
  adjustZoom(deltaY) {
    this._logZoom -= deltaY * 0.001;
    this._logZoom = Math.max(CAMERA.MIN_LOG_ZOOM, Math.min(CAMERA.MAX_LOG_ZOOM, this._logZoom));
  },
  worldToScreen(wx, wy, W, H) {
    return {
      x: (wx - this.x) * this.zoom + W / 2,
      y: -(wy - this.y) * this.zoom + H / 2,
    };
  },
  screenToWorld(sx, sy, W, H) {
    return {
      x: (sx - W / 2) / this.zoom + this.x,
      y: -((sy - H / 2) / this.zoom) + this.y,
    };
  },
};

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (mapView) {
    mapCam.adjustZoom(e.deltaY);
  } else {
    camera.adjustZoom(e.deltaY);
  }
}, { passive: false });

// --- Map view & SAS ---
let mapView = false;
let _mapSavedLogZoom = null;

function initMapCamera() {
  _mapSavedLogZoom = camera._logZoom;
  let orbitRadius = PLANET.RADIUS * 1.4;
  if (rocket.state === 'rails' && rocket.railsElements) {
    orbitRadius = rocket.railsElements.a * (1 + rocket.railsElements.e) * 1.2;
  } else if (trajectory.apoPoint) {
    orbitRadius = (trajectory.apoPoint.altKm * 1000 + PLANET.RADIUS) * 1.2;
  }
  const minDim = Math.min(canvas.width, canvas.height);
  mapCam._logZoom = Math.max(CAMERA.MIN_LOG_ZOOM, Math.min(CAMERA.MAX_LOG_ZOOM,
    Math.log(minDim * 0.42 / orbitRadius)));
  mapCam.x = rocket.x;
  mapCam.y = rocket.y;
  mapCam.lockTarget = 'rocket';
}

// --- Map context menu ---
const mapContextMenu = document.getElementById('map-context-menu');

function showContextMenu(cx, cy, items) {
  mapContextMenu.innerHTML = '';
  for (const item of items) {
    if (item.info) {
      const info = document.createElement('div');
      info.className = 'ctx-info';
      info.textContent = item.label;
      if (item.color) info.style.color = item.color;
      mapContextMenu.appendChild(info);
      continue;
    }
    const btn = document.createElement('button');
    btn.textContent = item.label;
    if (item.color) btn.style.color = item.color;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.action) item.action();
      hideContextMenu();
    });
    mapContextMenu.appendChild(btn);
  }
  mapContextMenu.style.display = 'block';
  mapContextMenu.style.left = cx + 'px';
  mapContextMenu.style.top = cy + 'px';
}

function hideContextMenu() {
  mapContextMenu.style.display = 'none';
}

document.addEventListener('click', (e) => {
  if (!mapContextMenu.contains(e.target)) hideContextMenu();
});

// --- Map drag (pan) ---
let mapDrag = null;
let mapDragMoved = false;

const MAP_HIT_RADIUS = 12; // px — click detection radius for rocket / planet dots

function getMapHitTarget(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;

  const rsp = mapCam.worldToScreen(rocket.x, rocket.y, canvas.width, canvas.height);
  if (Math.hypot(sx - rsp.x, sy - rsp.y) < MAP_HIT_RADIUS) return 'rocket';

  const psp = mapCam.worldToScreen(0, 0, canvas.width, canvas.height);
  if (Math.hypot(sx - psp.x, sy - psp.y) < MAP_HIT_RADIUS) return 'planet';

  return null;
}

canvas.addEventListener('mousedown', (e) => {
  if (!mapView || e.button !== 0) return;
  mapDrag = { startX: e.clientX, startY: e.clientY, camX: mapCam.x, camY: mapCam.y };
  mapDragMoved = false;
});

canvas.addEventListener('mousemove', (e) => {
  if (!mapDrag) return;
  const dx = e.clientX - mapDrag.startX;
  const dy = e.clientY - mapDrag.startY;
  if (!mapDragMoved && Math.hypot(dx, dy) > 4) {
    mapDragMoved = true;
    mapCam.lockTarget = null;
    hideContextMenu();
  }
  if (mapDragMoved) {
    mapCam.x = mapDrag.camX - dx / mapCam.zoom;
    mapCam.y = mapDrag.camY + dy / mapCam.zoom;
  }
});

canvas.addEventListener('mouseup', (e) => {
  if (!mapView || !mapDrag || e.button !== 0) { mapDrag = null; return; }
  if (!mapDragMoved) {
    const target = getMapHitTarget(e.clientX, e.clientY);
    if (target && mapCam.lockTarget !== target) {
      showContextMenu(e.clientX, e.clientY, [
        { label: 'Lock View', action: () => { mapCam.lockTarget = target; } },
      ]);
    } else {
      hideContextMenu();
    }
  }
  mapDrag = null;
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (mapView) {
    const target = getMapHitTarget(e.clientX, e.clientY);
    if (target && mapCam.lockTarget === target) {
      showContextMenu(e.clientX, e.clientY, [
        { label: 'Unlock', action: () => { mapCam.lockTarget = null; } },
      ]);
    } else {
      hideContextMenu();
    }
    return;
  }

  // Flight mode: right-click engine to toggle it
  if (rocket.state === 'crashed') return;
  const rect = canvas.getBoundingClientRect();
  const sx   = e.clientX - rect.left;
  const sy   = e.clientY - rect.top;
  const part = rocket.partAtScreenPos(sx, sy, camera, canvas.width, canvas.height);
  if (part && part.type === 'engine') {
    const isEnabled = part.enabled !== false;
    showContextMenu(e.clientX, e.clientY, [{
      label:  isEnabled ? 'Disable engine' : 'Enable engine',
      color:  isEnabled ? 'rgba(220, 60, 60, 0.9)' : '#55c87a',
      action: () => { rocket.toggleEngine(part); },
    }]);
  } else {
    hideContextMenu();
  }
});

// --- Time warp ---
const FLYING_WARPS = [1, 2, 3];
const RAILS_WARPS  = [1, 10, 50, 100];
let timeWarp   = 1;
let warpTarget = null;  // simTime to stop warping (rails click-to-warp)

function warpLevels() {
  return rocket.state === 'rails' ? RAILS_WARPS : FLYING_WARPS;
}

function increaseWarp() {
  const levels = warpLevels();
  const idx = levels.indexOf(timeWarp);
  if (idx < levels.length - 1) timeWarp = levels[idx + 1];
}

function decreaseWarp() {
  const levels = warpLevels();
  const idx = levels.indexOf(timeWarp);
  if (idx > 0) timeWarp = levels[idx - 1];
  else timeWarp = 1;
  if (timeWarp === 1) warpTarget = null;
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Period') increaseWarp();
  if (e.code === 'Comma')  decreaseWarp();

  if (e.code === 'KeyT') rocket.sas = !rocket.sas;

  if (e.code === 'KeyM') {
    mapView = !mapView;
    if (mapView) {
      initMapCamera();
    } else {
      if (_mapSavedLogZoom !== null) {
        camera._logZoom = _mapSavedLogZoom;
        _mapSavedLogZoom = null;
      }
      hideContextMenu();
    }
  }

  if (e.code === 'Space' && (rocket.state === 'flying' || rocket.state === 'rails')) {
    e.preventDefault();
    const data = rocket.doStage();
    if (data) droppedStages.push(new Stage(data));
  }
});

// Given a target true anomaly on the current rails orbit, return the next simTime
// the rocket will be at that position.
function nuToSimTime(nu, els) {
  const { e, M0, n, t_epoch } = els;
  const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
  const M_target  = ((E - e * Math.sin(E)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const M_current = ((M0 + n * (rocket.simTime - t_epoch)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  let dM = M_target - M_current;
  if (dM <= 1e-4) dM += 2 * Math.PI;
  return rocket.simTime + dM / n;
}

// --- Dev panel ---
const dev = { infiniteFuel: false };
const _devButtons = [];

canvas.addEventListener('click', (e) => {
  if (mapView) { e.stopPropagation(); return; }  // map clicks handled via mouseup; stop doc listener

  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  for (const btn of _devButtons) {
    if (cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h) {
      dev[btn.key] = !dev[btn.key];
      return;
    }
  }

  // Click an engine to inspect its reservoir's remaining fuel.
  if (rocket.state !== 'crashed') {
    const part = rocket.partAtScreenPos(cx, cy, camera, canvas.width, canvas.height);
    if (part && part.type === 'engine') {
      const { current, capacity } = rocket.engineFuelInfo(part);
      const label = capacity > 0
        ? `Fuel ${Math.round(current)} / ${Math.round(capacity)} kg`
        : 'No tank fuel';
      showContextMenu(e.clientX, e.clientY, [{ info: true, label }]);
      e.stopPropagation();  // keep the document click listener from closing it
      return;
    }
  }

  // Rails click-to-warp
  const ddx = cx - canvas.width / 2;
  const ddy = cy - canvas.height / 2;
  const cosR = Math.cos(camera.rotation);
  const sinR = Math.sin(camera.rotation);
  const ucx = ddx * cosR - ddy * sinR + canvas.width / 2;
  const ucy = ddx * sinR + ddy * cosR + canvas.height / 2;

  if (rocket.state === 'rails' && trajectory.points.length > 0) {
    let bestDist = Infinity, bestIdx = -1;
    for (let i = 0; i < trajectory.points.length; i++) {
      const sp = camera.worldToScreen(trajectory.points[i].x, trajectory.points[i].y, canvas.width, canvas.height);
      const d = Math.hypot(sp.x - ucx, sp.y - ucy);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestDist <= 20 && bestIdx >= 0) {
      const nu = (bestIdx / ORBIT_SAMPLES) * 2 * Math.PI;
      warpTarget = nuToSimTime(nu, rocket.railsElements);
      timeWarp = 100;
    }
  }
});

function update(dt) {
  if (dev.infiniteFuel) rocket.refuelActive();

  const levels = warpLevels();
  if (!levels.includes(timeWarp)) timeWarp = levels[levels.length - 1];

  let wdt = dt * timeWarp;

  if (warpTarget !== null && rocket.state === 'rails') {
    const remaining = warpTarget - rocket.simTime;
    if (remaining <= wdt) {
      wdt = Math.max(remaining, 0);
      warpTarget = null;
      timeWarp = 1;
    }
  }

  if (rocket.state !== 'rails' && timeWarp > 3) {
    timeWarp = 1;
    warpTarget = null;
  }

  rocket.update(wdt, input);

  for (const stage of droppedStages) {
    stage.update(wdt);
    if (stage.state === 'rails') {
      const dist = Math.hypot(rocket.x - stage.x, rocket.y - stage.y);
      if (dist < PHYSICS_BUBBLE_RADIUS) stage.exitRails();
    }
  }

  camera.update();
  trajectory.compute(rocket);

  if (mapView) {
    // Track locked target
    if (mapCam.lockTarget === 'rocket') {
      mapCam.x = rocket.x;
      mapCam.y = rocket.y;
    } else if (mapCam.lockTarget === 'planet') {
      mapCam.x = 0;
      mapCam.y = 0;
    }
  } else {
    // Horizon lock: smoothly reorient to planet surface normal within 100 km
    const rocketDist = Math.hypot(rocket.x, rocket.y);
    const altKm = (rocketDist - PLANET.RADIUS) / 1000;
    const horizonT = Math.max(0, Math.min(1, 1 - (altKm - 50) / 50));
    if (horizonT <= 0) {
      camera.rotation = 0;
    } else {
      let target = Math.PI / 2 - Math.atan2(rocket.y, rocket.x);
      target = ((target + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      camera.rotation = target * horizonT;
    }
  }
}

const VAB_CENTER_X = -6_000;
const VAB_W        = 4_000;
const VAB_H        = 2_500;

function drawVAB(ctx, cam, canvasWidth, canvasHeight) {
  const base = PLANET.RADIUS;
  const bl = cam.worldToScreen(VAB_CENTER_X - VAB_W / 2, base,         canvasWidth, canvasHeight);
  const br = cam.worldToScreen(VAB_CENTER_X + VAB_W / 2, base,         canvasWidth, canvasHeight);
  const tr = cam.worldToScreen(VAB_CENTER_X + VAB_W / 2, base + VAB_H, canvasWidth, canvasHeight);
  const tl = cam.worldToScreen(VAB_CENTER_X - VAB_W / 2, base + VAB_H, canvasWidth, canvasHeight);

  ctx.beginPath();
  ctx.moveTo(bl.x, bl.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(tl.x, tl.y);
  ctx.closePath();
  ctx.fillStyle = '#4a4f58';
  ctx.fill();
  ctx.strokeStyle = '#6a707c';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function render() {
  const activeCam = mapView ? mapCam : camera;

  ctx.fillStyle = '#00000a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  starfield.draw(ctx, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-activeCam.rotation);
  ctx.translate(-canvas.width / 2, -canvas.height / 2);

  planet.draw(ctx, activeCam, canvas.width, canvas.height);

  if (!mapView) {
    drawVAB(ctx, activeCam, canvas.width, canvas.height);
    for (const stage of droppedStages) stage.draw(ctx, activeCam, canvas.width, canvas.height);
    rocket.draw(ctx, activeCam, canvas.width, canvas.height);
    rocket.drawVelocityArrow(ctx, activeCam, canvas.width, canvas.height);
  } else {
    trajectory.draw(ctx, activeCam, canvas.width, canvas.height);
  }

  ctx.restore();

  // Map view: position dots for rocket and dropped stages
  if (mapView) {
    ctx.save();
    for (const stage of droppedStages) {
      const sp = mapCam.worldToScreen(stage.x, stage.y, canvas.width, canvas.height);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200, 200, 200, 0.7)';
      ctx.fill();
    }
    const rsp = mapCam.worldToScreen(rocket.x, rocket.y, canvas.width, canvas.height);
    const rdx = Math.sin(rocket.rotation);   // nose direction in map screen space
    const rdy = -Math.cos(rocket.rotation);
    const rpx = -rdy, rpy = rdx;  // perpendicular
    ctx.beginPath();
    ctx.moveTo(rsp.x + rdx * 7,            rsp.y + rdy * 7);
    ctx.lineTo(rsp.x - rdx * 4 + rpx * 4,  rsp.y - rdy * 4 + rpy * 4);
    ctx.lineTo(rsp.x - rdx * 4 - rpx * 4,  rsp.y - rdy * 4 - rpy * 4);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();
  }

  drawHUD();
  drawDevPanel();
}

function drawHUD() {
  ctx.save();
  ctx.font = '13px monospace';
  ctx.textAlign = 'left';

  const LINE = 18;

  if (rocket.state === 'flying') {
    const r = Math.hypot(rocket.x, rocket.y);
    const alt = (r - PLANET.RADIUS) / 1000;
    const spd = Math.hypot(rocket.vx, rocket.vy);
    const fuel = rocket.initialFuelMass > 0
      ? (rocket.fuelMass / rocket.initialFuelMass * 100).toFixed(0)
      : '0';

    let hudY = 28;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(`ALT  ${alt.toFixed(1)} km`, 16, hudY); hudY += LINE;
    ctx.fillText(`SPD  ${spd.toFixed(0)} m/s`,  16, hudY); hudY += LINE;
    if (trajectory.apoPoint) {
      ctx.fillText(`AP   ${trajectory.apoPoint.altKm.toFixed(1)} km`, 16, hudY); hudY += LINE;
    }
    if (trajectory.periPoint) {
      ctx.fillText(`PE   ${trajectory.periPoint.altKm.toFixed(1)} km`, 16, hudY); hudY += LINE;
    }
    ctx.fillText(`FUEL ${fuel}%`, 16, hudY); hudY += LINE;
    ctx.fillText(`THR  ${(rocket.throttle * 100).toFixed(0)}%`, 16, hudY); hudY += LINE;

    if (rocket.sas) {
      ctx.fillStyle = '#4df';
      ctx.fillText('SAS  ON', 16, hudY); hudY += LINE;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
    }
    if (rocket.stages && rocket.stages.length > 1) {
      ctx.fillStyle = 'rgba(255, 220, 80, 0.85)';
      const hint = rocket.canStage() ? '  [SPACE]' : '';
      // Highest stage fires first; counts down toward stage 0.
      ctx.fillText(`STG ${rocket.activeStageIndex}/${rocket.stages.length - 1}${hint}`, 16, hudY);
      hudY += LINE;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
    }
    if (timeWarp > 1) {
      ctx.fillStyle = 'rgba(255, 200, 50, 0.9)';
      ctx.fillText(`WARP ${timeWarp}×`, 16, hudY);
    }
  } else if (rocket.state === 'rails') {
    const { a, e, n } = rocket.railsElements;
    const r = Math.hypot(rocket.x, rocket.y);
    const alt = (r - PLANET.RADIUS) / 1000;
    const periAlt = (a * (1 - e) - PLANET.RADIUS) / 1000;
    const apoAlt  = (a * (1 + e) - PLANET.RADIUS) / 1000;
    const period  = (2 * Math.PI / n) / 60;

    let hudY = 28;
    ctx.fillStyle = 'rgba(100, 210, 255, 0.9)';
    ctx.fillText('— RAILS —', 16, hudY); hudY += LINE;
    ctx.fillText(`ALT  ${alt.toFixed(1)} km`, 16, hudY); hudY += LINE;
    ctx.fillText(`PE   ${periAlt.toFixed(1)} km`, 16, hudY); hudY += LINE;
    ctx.fillText(`AP   ${apoAlt.toFixed(1)} km`, 16, hudY); hudY += LINE;
    ctx.fillText(`PRD  ${period.toFixed(1)} min`, 16, hudY); hudY += LINE;
    ctx.fillText(`ECC  ${e.toFixed(4)}`, 16, hudY); hudY += LINE;

    if (rocket.sas) {
      ctx.fillStyle = '#4df';
      ctx.fillText('SAS  ON', 16, hudY); hudY += LINE;
    }

    if (timeWarp > 1) {
      const warpLabel = warpTarget !== null ? `WARP ${timeWarp}× →` : `WARP ${timeWarp}×`;
      ctx.fillStyle = 'rgba(255, 200, 50, 0.9)';
      ctx.fillText(warpLabel, 16, hudY); hudY += LINE;
      ctx.fillStyle = 'rgba(100, 210, 255, 0.55)';
      ctx.fillText('W / ↑  burn to exit rails', 16, hudY); hudY += LINE;
    } else {
      ctx.fillStyle = 'rgba(100, 210, 255, 0.55)';
      ctx.fillText('W / ↑  burn to exit rails', 16, hudY); hudY += LINE;
    }

    if (timeWarp === 1) {
      ctx.fillStyle = 'rgba(100, 210, 255, 0.4)';
      ctx.font = '11px monospace';
      ctx.fillText('click orbit to warp there', 16, hudY);
    }
  } else if (rocket.state === 'landed') {
    ctx.fillStyle = 'rgba(200,255,200,0.8)';
    ctx.fillText('W / ↑  launch', 16, 28);
    ctx.fillText('A D / ← →  rotate', 16, 46);
    ctx.fillText('S / ↓  cut throttle', 16, 64);
  } else if (rocket.state === 'crashed') {
    ctx.fillStyle = 'rgba(255,80,80,0.9)';
    ctx.font = '18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CRASHED — reload to retry', canvas.width / 2, canvas.height / 2 + 40);
  }

  if (mapView) {
    ctx.fillStyle = 'rgba(100, 255, 200, 0.85)';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('— MAP VIEW —', canvas.width / 2, 24);
  }

  if (rocket.state === 'flying' || rocket.state === 'rails') {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('T sas   M map', canvas.width - 16, canvas.height - 32);
    ctx.fillText('. warp+    , warp−', canvas.width - 16, canvas.height - 16);
  }

  ctx.restore();
}

function drawDevPanel() {
  const btnW = 100, btnH = 22, padR = 16, padT = 8;
  const buttons = [
    { label: '∞ FUEL', key: 'infiniteFuel' },
  ];

  _devButtons.length = 0;
  ctx.save();
  ctx.font = '11px monospace';

  let x = canvas.width - padR - btnW;
  const y = padT;

  for (const def of buttons) {
    const active = dev[def.key];
    ctx.fillStyle = active ? 'rgba(255, 210, 50, 0.92)' : 'rgba(60, 60, 60, 0.75)';
    ctx.fillRect(x, y, btnW, btnH);
    ctx.fillStyle = active ? '#111' : '#888';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.label, x + btnW / 2, y + btnH / 2);
    _devButtons.push({ key: def.key, x, y, w: btnW, h: btnH });
    x -= btnW + 6;
  }

  ctx.fillStyle = 'rgba(255,210,50,0.45)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('DEV', canvas.width - padR, padT + btnH + 4);

  ctx.restore();
}

const loop = new GameLoop(update, render);
loop.start();
