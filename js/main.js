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

function update(dt) {
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

const loop = new GameLoop(update, render);
loop.start();
