import { G, PLANET, ROCKET } from './constants.js';
import { stateToElements, elementsToState } from './OrbitalMechanics.js';
import { PART_DEFS, DRAW_FNS } from './parts.js';

const G0 = 9.80665;

export class Rocket {
  constructor() {
    let design = null;
    try { design = JSON.parse(localStorage.getItem('rocketDesign')); } catch {}
    if (design && (design.gridVersion || 1) < 2 && Array.isArray(design.parts)) {
      design = { ...design, parts: design.parts.map(p => ({ ...p, col: p.col * 2, row: p.row * 2 })) };
    }

    this.x = 0;
    this.y = PLANET.RADIUS + ROCKET.LENGTH / 2;  // center is mid-rocket; base sits on surface
    this.vx = 0;
    this.vy = 0;
    // 0 = nose pointing up (+Y world); clockwise positive, matching canvas rotation
    this.rotation = 0;
    this.throttle = 0;

    // All placed parts (never mutated); activeParts shrinks as stages are dropped.
    this.parts       = design ? design.parts : null;
    this.activeParts = this.parts ? [...this.parts] : null;

    this.fuelMass  = design ? design.fuelMass  : ROCKET.FUEL_MASS;
    this.dryMass   = design ? design.dryMass   : ROCKET.DRY_MASS;
    this.maxThrust = design ? design.maxThrust : ROCKET.MAX_THRUST;
    this.exhaustVel = (design ? design.isp : ROCKET.ISP) * G0;

    // Store the original full bounding-box height so dropped stages scale correctly.
    this._fullGridH = this._computeGridH(this.activeParts);

    this.initialFuelMass = this.fuelMass;
    this.state = 'landed';  // 'flying' | 'landed' | 'crashed' | 'rails'
    this.simTime = 0;       // seconds elapsed since game start
    this.railsElements = null;
    this.sas = false;
  }

  get mass() { return this.dryMass + this.fuelMass; }

  // ── Staging ────────────────────────────────────────────────────────────────

  _computeGridH(parts) {
    if (!parts || parts.length === 0) return 1;
    let minRow = Infinity, maxRowBottom = -Infinity;
    for (const p of parts) {
      const def = PART_DEFS[p.type];
      minRow       = Math.min(minRow,       p.row);
      maxRowBottom = Math.max(maxRowBottom,  p.row + def.h);
    }
    return maxRowBottom - minRow;
  }

  canStage() {
    return !!(this.activeParts && this.activeParts.some(p => p.type === 'decoupler'));
  }

  // Detach the lowermost stage (below the lowest active decoupler).
  // Returns the data needed to construct a Stage object, or null if not stageable.
  doStage() {
    if (!this.canStage()) return null;

    // Find the lowest decoupler (highest row index = toward engine).
    const decouplers = this.activeParts.filter(p => p.type === 'decoupler');
    const lowest     = decouplers.reduce((a, b) => a.row > b.row ? a : b);

    // Parts strictly above the decoupler stay; decoupler + everything below drops.
    const upper   = this.activeParts.filter(p => (p.row + PART_DEFS[p.type].h) <= lowest.row);
    const dropped = this.activeParts.filter(p => p.row >= lowest.row);

    // Compute world-space center offsets before mutating activeParts.
    const fullGridH       = this._fullGridH;
    const cellScaleWorld  = ROCKET.LENGTH / fullGridH;
    const fullMinRow      = this.activeParts.reduce((m, p) => Math.min(m, p.row), Infinity);
    const fullMaxRowBot   = this.activeParts.reduce((m, p) => Math.max(m, p.row + PART_DEFS[p.type].h), -Infinity);
    const fullCenterRow   = (fullMinRow + fullMaxRowBot) / 2;

    // Dropped stage center row.
    const dropMinRow    = dropped.reduce((m, p) => Math.min(m, p.row), Infinity);
    const dropMaxRowBot = dropped.reduce((m, p) => Math.max(m, p.row + PART_DEFS[p.type].h), -Infinity);
    const dropCenterRow = (dropMinRow + dropMaxRowBot) / 2;

    // Remaining rocket center row.
    const remMinRow    = upper.length ? upper.reduce((m, p) => Math.min(m, p.row), Infinity) : fullCenterRow;
    const remMaxRowBot = upper.length ? upper.reduce((m, p) => Math.max(m, p.row + PART_DEFS[p.type].h), -Infinity) : fullCenterRow;
    const remCenterRow = (remMinRow + remMaxRowBot) / 2;

    // In the rocket's local frame, increasing row = toward engine = "local down".
    // World "local down" direction = (-sin(rot), -cos(rot)).
    const sinR = Math.sin(this.rotation);
    const cosR = Math.cos(this.rotation);

    const dropDelta = dropCenterRow - fullCenterRow;
    const dropX = this.x - sinR * dropDelta * cellScaleWorld;
    const dropY = this.y - cosR * dropDelta * cellScaleWorld;

    const remDelta = remCenterRow - fullCenterRow;
    this.x -= sinR * remDelta * cellScaleWorld;
    this.y -= cosR * remDelta * cellScaleWorld;

    // Update active parts to remaining upper section.
    this.activeParts = upper;

    // Recompute rocket properties from remaining parts.
    const engines = upper.filter(p => p.type === 'engine');
    const tanks   = upper.filter(p => p.type === 'tank');
    this.dryMass   = upper.reduce((s, p) => s + PART_DEFS[p.type].dryMass, 0);
    this.maxThrust = engines.reduce((s, p) => s + PART_DEFS[p.type].thrust, 0);
    this.exhaustVel = (engines.length > 0 ? PART_DEFS.engine.isp : ROCKET.ISP) * G0;
    const tankCap = tanks.reduce((s, p) => s + PART_DEFS[p.type].fuelMass, 0);
    this.fuelMass = Math.min(this.fuelMass, tankCap);
    this.initialFuelMass = this.fuelMass;

    return {
      parts: dropped,
      x: dropX, y: dropY,
      vx: this.vx, vy: this.vy,
      simTime: this.simTime,
      rotation: this.rotation,
      originalGridH: fullGridH,
    };
  }

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
      if (!this.sas) {
        if (input.held('ArrowLeft')  || input.held('KeyA')) this.rotation -= ROCKET.ROTATION_SPEED * dt;
        if (input.held('ArrowRight') || input.held('KeyD')) this.rotation += ROCKET.ROTATION_SPEED * dt;
      }

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
    if (!this.sas) {
      if (input.held('ArrowLeft')  || input.held('KeyA')) this.rotation -= ROCKET.ROTATION_SPEED * dt;
      if (input.held('ArrowRight') || input.held('KeyD')) this.rotation += ROCKET.ROTATION_SPEED * dt;
    }
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

    if (this.activeParts && this.activeParts.length > 0) {
      // Bounding box of the ACTIVE parts, scaled to the original full-rocket height
      // so that the part sizes remain consistent after staging.
      const cellScale = len / this._fullGridH;

      let minRow = Infinity, maxRowBottom = -Infinity;
      let minCol = Infinity, maxColRight  = -Infinity;
      for (const p of this.activeParts) {
        const def = PART_DEFS[p.type];
        minRow       = Math.min(minRow,       p.row);
        maxRowBottom = Math.max(maxRowBottom,  p.row + def.h);
        minCol       = Math.min(minCol,        p.col);
        maxColRight  = Math.max(maxColRight,   p.col + def.w);
      }
      const activeH = maxRowBottom - minRow;
      const gridW   = maxColRight  - minCol;
      const halfW   = (gridW * cellScale) / 2;
      const halfH   = (activeH * cellScale) / 2;

      for (const p of this.activeParts) {
        const def = PART_DEFS[p.type];
        const px  = (p.col - minCol) * cellScale - halfW;
        const py  = (p.row - minRow) * cellScale - halfH;
        DRAW_FNS[p.type](ctx, px, py, def.w * cellScale, def.h * cellScale,
          this.state === 'crashed' ? 0.5 : 1);
      }

      if (this.throttle > 0 && this.fuelMass > 0 && this.state === 'flying') {
        for (const p of this.activeParts) {
          if (p.type !== 'engine') continue;
          const def       = PART_DEFS[p.type];
          const px        = (p.col - minCol) * cellScale - halfW;
          const engineBot = (p.row - minRow + def.h) * cellScale - halfH;
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
