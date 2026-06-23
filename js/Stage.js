import { G, PLANET, ROCKET } from './constants.js';
import { stateToElements, elementsToState } from './OrbitalMechanics.js';
import { PART_DEFS, DRAW_FNS } from './parts.js';

// An independent dropped stage — no thrust, subject only to gravity.
export class Stage {
  constructor({ parts, x, y, vx, vy, simTime, rotation, originalGridH }) {
    this.parts        = parts;
    this.x            = x;
    this.y            = y;
    this.vx           = vx;
    this.vy           = vy;
    this.simTime      = simTime;
    this.rotation     = rotation;
    this.originalGridH = originalGridH;
    this.mass         = parts.reduce((s, p) => s + PART_DEFS[p.type].dryMass, 0);
    this.state        = 'flying'; // 'flying' | 'rails' | 'destroyed'
    this.railsElements = null;
  }

  update(dt) {
    if (this.state === 'destroyed') return;
    this.simTime += dt;

    if (this.state === 'rails') {
      const s = elementsToState(this.railsElements, this.simTime);
      this.x = s.x; this.y = s.y; this.vx = s.vx; this.vy = s.vy;
      return;
    }

    const a0 = this._accel();
    this.x += this.vx * dt + 0.5 * a0.x * dt * dt;
    this.y += this.vy * dt + 0.5 * a0.y * dt * dt;
    const a1 = this._accel();
    this.vx += 0.5 * (a0.x + a1.x) * dt;
    this.vy += 0.5 * (a0.y + a1.y) * dt;

    if (this._checkSurfaceCollision()) {
      this.state = 'destroyed';
      return;
    }

    const r   = Math.hypot(this.x, this.y);
    const alt = r - PLANET.RADIUS;
    if (alt > PLANET.ATMOSPHERE_ALTITUDE) {
      const els = stateToElements(this.x, this.y, this.vx, this.vy, this.simTime);
      if (els !== null && els.a * (1 - els.e) - PLANET.RADIUS > PLANET.ATMOSPHERE_ALTITUDE) {
        this.railsElements = els;
        this.state = 'rails';
      }
    }
  }

  exitRails() {
    if (this.state !== 'rails') return;
    const s = elementsToState(this.railsElements, this.simTime);
    this.x = s.x; this.y = s.y; this.vx = s.vx; this.vy = s.vy;
    this.state = 'flying';
    this.railsElements = null;
  }

  _accel() {
    const r = Math.hypot(this.x, this.y);
    const g = G * PLANET.MASS / (r * r);
    return { x: -g * this.x / r, y: -g * this.y / r };
  }

  // Per-part surface collision (same approach as Rocket._checkSurfaceCollision):
  // transform the planet centre into this stage's local part frame and test each
  // part as an axis-aligned rectangle. A dropped stage is destroyed on contact.
  _checkSurfaceCollision() {
    const cellScaleWorld = ROCKET.LENGTH / this.originalGridH;

    let minRow = Infinity, maxRowBottom = -Infinity;
    let minCol = Infinity, maxColRight  = -Infinity;
    for (const p of this.parts) {
      const def = PART_DEFS[p.type];
      minRow       = Math.min(minRow,       p.row);
      maxRowBottom = Math.max(maxRowBottom,  p.row + def.h);
      minCol       = Math.min(minCol,        p.col);
      maxColRight  = Math.max(maxColRight,   p.col + def.w);
    }
    const halfW = ((maxColRight - minCol) * cellScaleWorld) / 2;
    const halfH = ((maxRowBottom - minRow) * cellScaleWorld) / 2;

    const dx = -this.x;
    const dy = -this.y;
    const cosR = Math.cos(this.rotation);
    const sinR = Math.sin(this.rotation);
    const planetLx =  dx * cosR - dy * sinR;
    const planetLy = -dx * sinR - dy * cosR;

    const R2 = PLANET.RADIUS * PLANET.RADIUS;
    for (const p of this.parts) {
      const def = PART_DEFS[p.type];
      const px1 = (p.col - minCol) * cellScaleWorld - halfW;
      const py1 = (p.row - minRow) * cellScaleWorld - halfH;
      const px2 = px1 + def.w * cellScaleWorld;
      const py2 = py1 + def.h * cellScaleWorld;
      const closestX = Math.max(px1, Math.min(planetLx, px2));
      const closestY = Math.max(py1, Math.min(planetLy, py2));
      const ddx = closestX - planetLx;
      const ddy = closestY - planetLy;
      if (ddx * ddx + ddy * ddy < R2) return true;
    }
    return false;
  }

  draw(ctx, camera, canvasWidth, canvasHeight) {
    if (this.state === 'destroyed') return;
    const sp = camera.worldToScreen(this.x, this.y, canvasWidth, canvasHeight);

    // Use the same scale as the original full rocket so part sizes match.
    const len       = Math.max(ROCKET.LENGTH * camera.zoom, 1);
    const cellScale = len / this.originalGridH;

    let minRow = Infinity, maxRowBottom = -Infinity;
    let minCol = Infinity, maxColRight  = -Infinity;
    for (const p of this.parts) {
      const def = PART_DEFS[p.type];
      minRow       = Math.min(minRow,       p.row);
      maxRowBottom = Math.max(maxRowBottom,  p.row + def.h);
      minCol       = Math.min(minCol,        p.col);
      maxColRight  = Math.max(maxColRight,   p.col + def.w);
    }
    const stageH = maxRowBottom - minRow;
    const stageW = maxColRight  - minCol;
    const halfW  = (stageW * cellScale) / 2;

    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.rotate(this.rotation);

    for (const p of this.parts) {
      const def = PART_DEFS[p.type];
      const px  = (p.col - minCol) * cellScale - halfW;
      const py  = (p.row - minRow) * cellScale - (stageH * cellScale) / 2;
      DRAW_FNS[p.type](ctx, px, py, def.w * cellScale, def.h * cellScale, 0.8);
    }

    ctx.restore();
  }
}
