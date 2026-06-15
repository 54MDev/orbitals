import { G, PLANET } from './constants.js';

const STEPS = 500;
const DT = 10;  // seconds per prediction step — covers >1 full orbit

export class Trajectory {
  constructor() {
    this.points = [];
  }

  compute(rocket) {
    this.points = [];
    if (rocket.state !== 'flying') return;

    let x = rocket.x;
    let y = rocket.y;
    let vx = rocket.vx;
    let vy = rocket.vy;

    for (let i = 0; i < STEPS; i++) {
      this.points.push({ x, y });

      const r = Math.hypot(x, y);
      if (r <= PLANET.RADIUS) break;

      const gMag = G * PLANET.MASS / (r * r);
      const ax = -gMag * x / r;
      const ay = -gMag * y / r;

      vx += ax * DT;
      vy += ay * DT;
      x += vx * DT;
      y += vy * DT;
    }
  }

  draw(ctx, camera, canvasWidth, canvasHeight) {
    if (this.points.length < 2) return;

    ctx.save();
    ctx.setLineDash([6, 10]);
    ctx.strokeStyle = 'rgba(100, 210, 255, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const first = camera.worldToScreen(this.points[0].x, this.points[0].y, canvasWidth, canvasHeight);
    ctx.moveTo(first.x, first.y);

    for (let i = 1; i < this.points.length; i++) {
      const sp = camera.worldToScreen(this.points[i].x, this.points[i].y, canvasWidth, canvasHeight);
      ctx.lineTo(sp.x, sp.y);
    }

    ctx.stroke();
    ctx.restore();
  }
}
