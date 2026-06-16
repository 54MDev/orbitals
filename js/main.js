import { GameLoop } from './GameLoop.js';
import { Camera } from './Camera.js';
import { Planet } from './Planet.js';
import { Starfield } from './Starfield.js';
import { Rocket } from './Rocket.js';
import { Stage } from './Stage.js';
import { Input } from './Input.js';
import { Trajectory, ORBIT_SAMPLES } from './Trajectory.js';
import { PLANET, ROCKET, PHYSICS_BUBBLE_RADIUS } from './constants.js';

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

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  camera.adjustZoom(e.deltaY);
}, { passive: false });

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

  if (e.code === 'Space' && (rocket.state === 'flying' || rocket.state === 'rails')) {
    e.preventDefault();
    // rocket.x/y/vx/vy are always kept current (synced each frame on rails too).
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
  if (dM <= 1e-4) dM += 2 * Math.PI;  // always warp forward; tiny dM → next orbit
  return rocket.simTime + dM / n;
}

// --- Dev panel ---
const dev = { infiniteFuel: false };
const _devButtons = [];  // populated each frame by drawDevPanel()

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  for (const btn of _devButtons) {
    if (cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h) {
      dev[btn.key] = !dev[btn.key];
      return;
    }
  }

  // Rails click-to-warp: find nearest trajectory point within ~20 px
  // Unrotate click coords to match the unrotated worldToScreen space
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
  if (dev.infiniteFuel) rocket.fuelMass = rocket.initialFuelMass;

  // Cap warp to valid levels for current state
  const levels = warpLevels();
  if (!levels.includes(timeWarp)) timeWarp = levels[levels.length - 1];

  let wdt = dt * timeWarp;

  // Stop at warp target (rails click-to-warp)
  if (warpTarget !== null && rocket.state === 'rails') {
    const remaining = warpTarget - rocket.simTime;
    if (remaining <= wdt) {
      wdt = Math.max(remaining, 0);
      warpTarget = null;
      timeWarp = 1;
    }
  }

  // Reset warp if we leave rails
  if (rocket.state !== 'rails' && timeWarp > 3) {
    timeWarp = 1;
    warpTarget = null;
  }

  rocket.update(wdt, input);

  for (const stage of droppedStages) {
    stage.update(wdt);
    // Physics bubble: if a rails stage drifts close to the active rocket, restore Newtonian.
    if (stage.state === 'rails') {
      const dist = Math.hypot(rocket.x - stage.x, rocket.y - stage.y);
      if (dist < PHYSICS_BUBBLE_RADIUS) stage.exitRails();
    }
  }

  camera.update();
  trajectory.compute(rocket);

  // Horizon lock: smoothly reorient to planet surface normal within 100 km
  const rocketDist = Math.hypot(rocket.x, rocket.y);
  const altKm = (rocketDist - PLANET.RADIUS) / 1000;
  const horizonT = Math.max(0, Math.min(1, 1 - (altKm - 50) / 50));  // 0 at 100 km, 1 at ≤50 km
  if (horizonT <= 0) {
    camera.rotation = 0;
  } else {
    // Angle from planet to rocket; rotate camera so that direction points screen-up
    let target = Math.PI / 2 - Math.atan2(rocket.y, rocket.x);
    // Normalize to [-π, π] so lerp from 0 takes the short path
    target = ((target + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    camera.rotation = target * horizonT;
  }
}

const VAB_CENTER_X = -6_000;   // world-space m; right edge sits ~4 km left of launchpad
const VAB_W        = 4_000;    // m — 4× rocket width
const VAB_H        = 2_500;    // m — 2.5× rocket height

function drawVAB(ctx, camera, canvasWidth, canvasHeight) {
  const base = PLANET.RADIUS;
  const bl = camera.worldToScreen(VAB_CENTER_X - VAB_W / 2, base,         canvasWidth, canvasHeight);
  const br = camera.worldToScreen(VAB_CENTER_X + VAB_W / 2, base,         canvasWidth, canvasHeight);
  const tr = camera.worldToScreen(VAB_CENTER_X + VAB_W / 2, base + VAB_H, canvasWidth, canvasHeight);
  const tl = camera.worldToScreen(VAB_CENTER_X - VAB_W / 2, base + VAB_H, canvasWidth, canvasHeight);

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
  ctx.fillStyle = '#00000a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Starfield stays fixed (stars don't spin as the camera reorients)
  starfield.draw(ctx, canvas.width, canvas.height);

  // World layer: rotate around screen center to lock horizon when near surface
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-camera.rotation);
  ctx.translate(-canvas.width / 2, -canvas.height / 2);
  planet.draw(ctx, camera, canvas.width, canvas.height);
  drawVAB(ctx, camera, canvas.width, canvas.height);
  trajectory.draw(ctx, camera, canvas.width, canvas.height);
  for (const stage of droppedStages) stage.draw(ctx, camera, canvas.width, canvas.height);
  rocket.draw(ctx, camera, canvas.width, canvas.height);
  ctx.restore();

  // HUD and dev panel stay upright
  drawHUD();
  drawDevPanel();
}

function drawHUD() {
  ctx.save();
  ctx.font = '13px monospace';
  ctx.textAlign = 'left';

  if (rocket.state === 'flying') {
    const r = Math.hypot(rocket.x, rocket.y);
    const alt = (r - PLANET.RADIUS) / 1000;
    const spd = Math.hypot(rocket.vx, rocket.vy);
    const fuel = (rocket.fuelMass / rocket.initialFuelMass * 100).toFixed(0);

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(`ALT  ${alt.toFixed(1)} km`, 16, 28);
    ctx.fillText(`SPD  ${spd.toFixed(0)} m/s`, 16, 46);
    ctx.fillText(`FUEL ${fuel}%`, 16, 64);
    ctx.fillText(`THR  ${(rocket.throttle * 100).toFixed(0)}%`, 16, 82);
    let hudY = 100;
    if (rocket.canStage()) {
      ctx.fillStyle = 'rgba(255, 220, 80, 0.85)';
      ctx.fillText(`STG  ${rocket.activeParts.filter(p => p.type === 'decoupler').length}  [SPACE]`, 16, hudY);
      hudY += 18;
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

    ctx.fillStyle = 'rgba(100, 210, 255, 0.9)';
    ctx.fillText('— RAILS —', 16, 28);
    ctx.fillText(`ALT  ${alt.toFixed(1)} km`, 16, 46);
    ctx.fillText(`PE   ${periAlt.toFixed(1)} km`, 16, 64);
    ctx.fillText(`AP   ${apoAlt.toFixed(1)} km`, 16, 82);
    ctx.fillText(`PRD  ${period.toFixed(1)} min`, 16, 100);
    ctx.fillText(`ECC  ${e.toFixed(4)}`, 16, 118);

    if (timeWarp > 1) {
      const warpLabel = warpTarget !== null ? `WARP ${timeWarp}× →` : `WARP ${timeWarp}×`;
      ctx.fillStyle = 'rgba(255, 200, 50, 0.9)';
      ctx.fillText(warpLabel, 16, 136);
      ctx.fillStyle = 'rgba(100, 210, 255, 0.55)';
      ctx.fillText('W / ↑  burn to exit rails', 16, 160);
    } else {
      ctx.fillStyle = 'rgba(100, 210, 255, 0.55)';
      ctx.fillText('W / ↑  burn to exit rails', 16, 142);
    }

    // Click-to-warp hint
    if (timeWarp === 1) {
      ctx.fillStyle = 'rgba(100, 210, 255, 0.4)';
      ctx.font = '11px monospace';
      ctx.fillText('click orbit to warp there', 16, 164);
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

  // Warp keys hint (always visible when flying or rails)
  if (rocket.state === 'flying' || rocket.state === 'rails') {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
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
