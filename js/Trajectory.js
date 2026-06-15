import { G, PLANET } from './constants.js';

const STEPS = 500;
const DT = 10;  // seconds per prediction step — covers >1 full orbit
const ORBIT_SAMPLES = 360;

export class Trajectory {
  constructor() {
    this.points = [];
    this._rails = false;  // true when drawn from orbital elements
  }

  compute(rocket) {
    this.points = [];
    this._rails = false;

    if (rocket.state === 'rails' && rocket.railsElements) {
      this._rails = true;
      this._sampleOrbit(rocket.railsElements);
      return;
    }

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

  _sampleOrbit(els) {
    const { a, e, omega, prograde } = els;
    const p = a * (1 - e*e);
    for (let i = 0; i <= ORBIT_SAMPLES; i++) {
      const nu = (i / ORBIT_SAMPLES) * 2 * Math.PI;
      const r = p / (1 + e * Math.cos(nu));
      const theta = omega + prograde * nu;
      this.points.push({ x: r * Math.cos(theta), y: r * Math.sin(theta) });
    }
  }

  draw(ctx, camera, canvasWidth, canvasHeight) {
    if (this.points.length < 2) return;

    ctx.save();
    if (this._rails) {
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(100, 210, 255, 0.35)';
      ctx.lineWidth = 1;
    } else {
      ctx.setLineDash([6, 10]);
      ctx.strokeStyle = 'rgba(100, 210, 255, 0.55)';
      ctx.lineWidth = 1.5;
    }
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
