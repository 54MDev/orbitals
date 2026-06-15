import { G, PLANET } from './constants.js';

const STEPS = 500;
const DT = 10;  // seconds per prediction step — covers >1 full orbit
export const ORBIT_SAMPLES = 360;

export class Trajectory {
  constructor() {
    this.points = [];
    this._rails = false;  // true when drawn from orbital elements
    this.apoPoint = null;   // { x, y, altKm }
    this.periPoint = null;  // { x, y, altKm } — null when not meaningful
  }

  compute(rocket) {
    this.points = [];
    this._rails = false;
    this.apoPoint = null;
    this.periPoint = null;

    if (rocket.state === 'rails' && rocket.railsElements) {
      this._rails = true;
      this._sampleOrbit(rocket.railsElements);
      this._findApoPerí();
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

    this._findApoPerí();
  }

  _findApoPerí() {
    if (this.points.length < 2) return;

    let apoIdx = 0, periIdx = 0;
    let apoR = 0, periR = Infinity;

    for (let i = 0; i < this.points.length; i++) {
      const r = Math.hypot(this.points[i].x, this.points[i].y);
      if (r > apoR) { apoR = r; apoIdx = i; }
      if (r < periR) { periR = r; periIdx = i; }
    }

    this.apoPoint = {
      x: this.points[apoIdx].x,
      y: this.points[apoIdx].y,
      altKm: (apoR - PLANET.RADIUS) / 1000,
    };

    const periAlt = (periR - PLANET.RADIUS) / 1000;
    const n = this.points.length;
    // For rails, PE is always meaningful (orbit is fully above atmosphere).
    // For flying, only show PE if it's an interior minimum — not the start or end of the arc.
    const isInterior = periIdx > 2 && periIdx < n - 2;
    if (periAlt > 0 && (this._rails || isInterior)) {
      this.periPoint = {
        x: this.points[periIdx].x,
        y: this.points[periIdx].y,
        altKm: periAlt,
      };
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
    ctx.setLineDash([]);
    if (this._rails) {
      ctx.strokeStyle = 'rgba(100, 210, 255, 0.35)';
      ctx.lineWidth = 1;
    } else {
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

    this._drawMarker(ctx, camera, canvasWidth, canvasHeight, this.apoPoint,  'AP', '#ffcc44');
    this._drawMarker(ctx, camera, canvasWidth, canvasHeight, this.periPoint, 'PE', '#44ccff');

    ctx.restore();
  }

  _drawMarker(ctx, camera, W, H, point, label, color) {
    if (!point) return;
    const sp = camera.worldToScreen(point.x, point.y, W, H);
    const s = 6;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(sp.x,     sp.y - s);
    ctx.lineTo(sp.x + s, sp.y);
    ctx.lineTo(sp.x,     sp.y + s);
    ctx.lineTo(sp.x - s, sp.y);
    ctx.closePath();
    ctx.fill();

    ctx.font = '11px monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${label} ${point.altKm.toFixed(0)} km`, sp.x + s + 4, sp.y);
  }
}
