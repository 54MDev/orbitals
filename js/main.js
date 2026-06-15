import { GameLoop } from './GameLoop.js';
import { Camera } from './Camera.js';
import { Planet } from './Planet.js';
import { Starfield } from './Starfield.js';

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

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  camera.adjustZoom(e.deltaY);
}, { passive: false });

function update(dt) {
  camera.update();
}

function render() {
  ctx.fillStyle = '#00000a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  starfield.draw(ctx, canvas.width, canvas.height);
  planet.draw(ctx, camera, canvas.width, canvas.height);
}

const loop = new GameLoop(update, render);
loop.start();
