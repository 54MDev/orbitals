import { GameLoop } from './GameLoop.js';
import { Camera } from './Camera.js';
import { Planet } from './Planet.js';
import { Starfield } from './Starfield.js';
import { Rocket } from './Rocket.js';
import { Input } from './Input.js';
import { Trajectory } from './Trajectory.js';
import { PLANET, ROCKET } from './constants.js';

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

camera.target = rocket;

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  camera.adjustZoom(e.deltaY);
}, { passive: false });

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
    }
  }
});

function update(dt) {
  if (dev.infiniteFuel) rocket.fuelMass = ROCKET.FUEL_MASS;
  rocket.update(dt, input);
  camera.update();
  trajectory.compute(rocket);
}

function render() {
  ctx.fillStyle = '#00000a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  starfield.draw(ctx, canvas.width, canvas.height);
  planet.draw(ctx, camera, canvas.width, canvas.height);
  trajectory.draw(ctx, camera, canvas.width, canvas.height);
  rocket.draw(ctx, camera, canvas.width, canvas.height);

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
    const fuel = (rocket.fuelMass / ROCKET.FUEL_MASS * 100).toFixed(0);

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(`ALT  ${alt.toFixed(1)} km`, 16, 28);
    ctx.fillText(`SPD  ${spd.toFixed(0)} m/s`, 16, 46);
    ctx.fillText(`FUEL ${fuel}%`, 16, 64);
    ctx.fillText(`THR  ${(rocket.throttle * 100).toFixed(0)}%`, 16, 82);
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
    ctx.fillStyle = 'rgba(100, 210, 255, 0.55)';
    ctx.fillText('W / ↑  burn to exit rails', 16, 142);
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
