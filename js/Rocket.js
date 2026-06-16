import { G, PLANET, ROCKET } from './constants.js';
import { stateToElements, elementsToState } from './OrbitalMechanics.js';
import { PART_DEFS, DRAW_FNS } from './parts.js';

const G0 = 9.80665;

export class Rocket {
  constructor() {
    let design = null;
    try { design = JSON.parse(localStorage.getItem('rocketDesign')); } catch {}

    this.x = 0;
    this.y = PLANET.RADIUS + ROCKET.LENGTH / 2;  // center is mid-rocket; base sits on surface
    this.vx = 0;
    this.vy = 0;
    // 0 = nose pointing up (+Y world); clockwise positive, matching canvas rotation
    this.rotation = 0;
    this.throttle = 0;
    this.parts        = design ? design.parts     : null;
    this.dryMass      = design ? design.dryMass   : ROCKET.DRY_MASS;
    this.fuelMass     = design ? design.fuelMass  : ROCKET.FUEL_MASS;
    this.maxThrust    = design ? design.maxThrust : ROCKET.MAX_THRUST;
    this.exhaustVel   = (design ? design.isp : ROCKET.ISP) * G0;
    this.initialFuelMass = this.fuelMass;
    this.state = 'landed';  // 'flying' | 'landed' | 'crashed' | 'rails'
    this.simTime = 0;       // seconds elapsed since game start
    this.railsElements = null;
  }

  get mass() { return this.dryMass + this.fuelMass; }

  update(dt, input) {
    this.simTime += dt;

    if (this.state === 'landed') {
      if (input.held('ArrowUp') || input.held('KeyW')) {
        this.state = 'flying';
        this.throttle = 1;
      }
      return;
    }
    if (this.state === 'crashed') return;

    // --- Keplerian rails ---
    if (this.state === 'rails') {
      if (input.held('ArrowLeft')  || input.held('KeyA')) this.rotation -= ROCKET.ROTATION_SPEED * dt;
      if (input.held('ArrowRight') || input.held('KeyD')) this.rotation += ROCKET.ROTATION_SPEED * dt;

      // Throttle-up exits rails and resumes Newtonian integration
      if ((input.held('ArrowUp') || input.held('KeyW')) && this.fuelMass > 0) {
        const s = elementsToState(this.railsElements, this.simTime);
        this.x = s.x; this.y = s.y; this.vx = s.vx; this.vy = s.vy;
        this.state = 'flying';
        this.throttle = 0;
        return;
      }

      // Advance position analytically
      const s = elementsToState(this.railsElements, this.simTime);
      this.x = s.x; this.y = s.y; this.vx = s.vx; this.vy = s.vy;
      return;
    }

    // --- Newtonian flying ---
    if (input.held('ArrowLeft')  || input.held('KeyA')) this.rotation -= ROCKET.ROTATION_SPEED * dt;
    if (input.held('ArrowRight') || input.held('KeyD')) this.rotation += ROCKET.ROTATION_SPEED * dt;
    if (input.held('ArrowUp')    || input.held('KeyW')) this.throttle = Math.min(1, this.throttle + 2 * dt);
    if (input.held('ArrowDown')  || input.held('KeyS')) this.throttle = Math.max(0, this.throttle - 2 * dt);

    // Velocity Verlet integration
    const a0 = this._accel();
    this.x += this.vx * dt + 0.5 * a0.x * dt * dt;
    this.y += this.vy * dt + 0.5 * a0.y * dt * dt;

    if (this.fuelMass > 0 && this.throttle > 0) {
      const burnRate = (this.throttle * this.maxThrust) / this.exhaustVel;
      this.fuelMass = Math.max(0, this.fuelMass - burnRate * dt);
    }

    const a1 = this._accel();
    this.vx += 0.5 * (a0.x + a1.x) * dt;
    this.vy += 0.5 * (a0.y + a1.y) * dt;

    // Surface collision
    const r = Math.hypot(this.x, this.y);
    const surfaceR = PLANET.RADIUS + ROCKET.LENGTH / 2;  // center altitude when base touches surface
    if (r <= surfaceR) {
      const speed = Math.hypot(this.vx, this.vy);
      this.state = speed > ROCKET.CRASH_SPEED ? 'crashed' : 'landed';
      const ang = Math.atan2(this.y, this.x);
      this.x = Math.cos(ang) * surfaceR;
      this.y = Math.sin(ang) * surfaceR;
      this.vx = 0;
      this.vy = 0;
      this.throttle = 0;
      return;
    }

    // Transition to Keplerian rails when engines are off and orbit fully clears the atmosphere
    const enginesOff = this.throttle < 0.01 || this.fuelMass <= 0;
    if (enginesOff) {
      const alt = r - PLANET.RADIUS;
      if (alt > PLANET.ATMOSPHERE_ALTITUDE) {
        const els = stateToElements(this.x, this.y, this.vx, this.vy, this.simTime);
        if (els !== null) {
          const periapsis = els.a * (1 - els.e) - PLANET.RADIUS;
          if (periapsis > PLANET.ATMOSPHERE_ALTITUDE) {
            this.railsElements = els;
            this.state = 'rails';
            this.throttle = 0;
          }
        }
      }
    }
  }

  _accel() {
    const r = Math.hypot(this.x, this.y);
    const gMag = G * PLANET.MASS / (r * r);
    let ax = -gMag * this.x / r;
    let ay = -gMag * this.y / r;

    if (this.throttle > 0 && this.fuelMass > 0) {
      const a = (this.throttle * this.maxThrust) / this.mass;
      ax += a * Math.sin(this.rotation);
      ay += a * Math.cos(this.rotation);
    }
    return { x: ax, y: ay };
  }

  draw(ctx, camera, canvasWidth, canvasHeight) {
    const sp  = camera.worldToScreen(this.x, this.y, canvasWidth, canvasHeight);
    const len = Math.max(ROCKET.LENGTH * camera.zoom, 1);
    const wid = Math.max(ROCKET.WIDTH  * camera.zoom, 0.4);

    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.rotate(this.rotation);

    if (this.parts && this.parts.length > 0) {
      // Compute bounding box in grid units
      let minRow = Infinity, maxRowBottom = -Infinity;
      let minCol = Infinity, maxColRight  = -Infinity;
      for (const p of this.parts) {
        const def = PART_DEFS[p.type];
        minRow      = Math.min(minRow,      p.row);
        maxRowBottom = Math.max(maxRowBottom, p.row + def.h);
        minCol      = Math.min(minCol,      p.col);
        maxColRight  = Math.max(maxColRight,  p.col + def.w);
      }
      const gridH     = maxRowBottom - minRow;
      const gridW     = maxColRight  - minCol;
      const cellScale = len / gridH;
      const halfW     = (gridW * cellScale) / 2;

      // Draw all parts
      for (const p of this.parts) {
        const def = PART_DEFS[p.type];
        const px  = (p.col - minCol) * cellScale - halfW;
        const py  = (p.row - minRow) * cellScale - len / 2;
        const cw  = def.w * cellScale;
        const ch  = def.h * cellScale;
        DRAW_FNS[p.type](ctx, px, py, cw, ch, this.state === 'crashed' ? 0.5 : 1);
      }

      // Flames at each engine's nozzle
      if (this.throttle > 0 && this.fuelMass > 0 && this.state === 'flying') {
        for (const p of this.parts) {
          if (p.type !== 'engine') continue;
          const def       = PART_DEFS[p.type];
          const px        = (p.col - minCol) * cellScale - halfW;
          const engineBot = (p.row - minRow + def.h) * cellScale - len / 2;
          const cw        = def.w * cellScale;
          const flameLen  = len * this.throttle * (0.6 + 0.4 * Math.random());
          const cx        = px + cw / 2;
          ctx.beginPath();
          ctx.moveTo(cx - cw / 4, engineBot);
          ctx.lineTo(cx,          engineBot + flameLen);
          ctx.lineTo(cx + cw / 4, engineBot);
          ctx.fillStyle = 'rgba(255, 160, 40, 0.9)';
          ctx.fill();
        }
      }
    } else {
      // Fallback: triangle when no builder design is saved
      ctx.beginPath();
      ctx.moveTo(0, -len / 2);
      ctx.lineTo(-wid / 2, len / 2);
      ctx.lineTo(wid / 2,  len / 2);
      ctx.closePath();
      ctx.fillStyle = this.state === 'crashed' ? '#f44' : '#ddd';
      ctx.fill();

      if (this.throttle > 0 && this.fuelMass > 0 && this.state === 'flying') {
        const flameLen = len * this.throttle * (0.6 + 0.4 * Math.random());
        ctx.beginPath();
        ctx.moveTo(-wid / 4, len / 2);
        ctx.lineTo(0,         len / 2 + flameLen);
        ctx.lineTo(wid / 4,  len / 2);
        ctx.fillStyle = 'rgba(255, 160, 40, 0.9)';
        ctx.fill();
      }
    }

    ctx.restore();

    if (this.state === 'landed' || this.state === 'crashed') {
      ctx.save();
      ctx.fillStyle = this.state === 'crashed' ? '#f44' : '#8f8';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.state.toUpperCase(), sp.x, sp.y - len - 8);
      ctx.restore();
    }
  }
}
