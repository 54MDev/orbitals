import { G, PLANET, ROCKET, CAMERA } from './constants.js';
import { stateToElements, elementsToState } from './OrbitalMechanics.js';
import { PART_DEFS, DRAW_FNS } from './parts.js';

const G0 = 9.80665;

export class Rocket {
  constructor() {
    let design = null;
    try { design = JSON.parse(localStorage.getItem('rocketDesign')); } catch {}
    if (design && Array.isArray(design.parts)) {
      const v = design.gridVersion || 1;
      if (v < 2) {
        design = { ...design, parts: design.parts.map(p => ({ ...p, col: p.col * 2, row: p.row * 2 })) };
      }
      if (v < 4) {
        let counter = 0;
        design = {
          ...design,
          parts: design.parts.map(p => ({
            ...p,
            id: p.id ?? `part_${counter++}`,
            ...(p.type === 'engine' && p.enabled == null ? { enabled: true } : {}),
          })),
          stages: design.stages ?? [],
        };
      }
      if (v < 5) {
        // Stage numbering inverted: bottom segment is now the highest stage and
        // fires first. Re-derive stageIndex from positions so stale saves are
        // staged in the correct order.
        const decouplers = design.parts.filter(p => p.type === 'decoupler');
        const decCount = decouplers.length;
        design = {
          ...design,
          parts: design.parts.map(p => {
            if (p.type !== 'engine' && p.type !== 'decoupler') return p;
            const belowCount = decouplers.filter(d => d !== p && d.row > p.row).length;
            return { ...p, stageIndex: decCount - belowCount };
          }),
          stages: undefined,  // rebuilt from parts below
        };
      }
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

    // Per-tank fuel (kg). Each stage's tanks are a separate reservoir: only the
    // tanks feeding the currently-ignited engines drain, so upper-stage fuel is
    // held back until its stage fires. `fuelMass` mirrors the active reservoir.
    this.tankFuel = new Map();
    if (this.parts) {
      for (const p of this.parts) {
        if (p.type === 'tank') this.tankFuel.set(p.id, PART_DEFS.tank.fuelMass);
      }
    }
    this.activeTankIds = null;  // set by _recomputeStageStats()

    // Store the original full bounding-box height so dropped stages scale correctly.
    this._fullGridH = this._computeGridH(this.activeParts);

    // Derive the stage list from the parts' stageIndex values so it always stays
    // consistent with the assignment (rather than trusting a possibly-stale
    // design.stages array). Stage 0 fires last; the highest index fires first.
    const staged = this.parts && this.parts.some(p => p.stageIndex != null);
    if (staged) {
      const maxStage = this.parts.reduce(
        (m, p) => (p.stageIndex != null && p.stageIndex > m ? p.stageIndex : m), 0
      );
      this.stages = Array.from({ length: maxStage + 1 }, (_, i) => ({ index: i }));
    } else {
      this.stages = (design?.stages?.length) ? design.stages : [];
    }

    // Staging state: which stage is currently active, and the set of engine IDs
    // that have been ignited so far (accumulates as stages advance — highest
    // index ignites at launch, then we count down toward stage 0).
    this.activeStageIndex = staged ? this.stages.length - 1 : 0;
    if (this.parts) {
      this.ignitedEngineIds = staged
        ? this._engineIdsForStage(this.activeStageIndex)
        // No staging data (old save / unstaged) — fire all enabled engines.
        : new Set(this.parts.filter(p => p.type === 'engine' && p.enabled !== false).map(p => p.id));
      this._recomputeStageStats();
    } else {
      this.ignitedEngineIds = new Set();
    }

    this.initialFuelMass = this.fuelMass;
    this.state = 'landed';  // 'flying' | 'landed' | 'crashed' | 'rails'
    this.simTime = 0;       // seconds elapsed since game start
    this.railsElements = null;
    this.sas = false;
  }

  get mass() {
    if (!this.activeParts) return this.dryMass + this.fuelMass;
    // Mass counts the fuel still in EVERY attached tank (upper reservoirs too),
    // not just the active stage's reservoir.
    let fuel = 0;
    for (const p of this.activeParts) {
      if (p.type === 'tank') fuel += this.tankFuel.get(p.id) || 0;
    }
    return this.dryMass + fuel;
  }

  _sumTankFuel(ids) {
    let s = 0;
    for (const id of ids) s += this.tankFuel.get(id) || 0;
    return s;
  }

  // IDs of attached tanks in the same physical band (between decouplers) as the
  // given engine rows — i.e. the reservoir that feeds those engines.
  _bandTankIds(engineRows) {
    if (!this.activeParts || engineRows.length === 0) return new Set();
    const minER = Math.min(...engineRows);
    const maxER = Math.max(...engineRows);
    let upper = -Infinity, lower = Infinity;  // nearest decoupler rows above / below
    for (const p of this.activeParts) {
      if (p.type !== 'decoupler') continue;
      if (p.row < minER && p.row > upper) upper = p.row;
      if (p.row > maxER && p.row < lower) lower = p.row;
    }
    const ids = new Set();
    for (const p of this.activeParts) {
      if (p.type === 'tank' && p.row > upper && p.row < lower) ids.add(p.id);
    }
    return ids;
  }

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

  // IDs of enabled engines assigned to the given stage index.
  _engineIdsForStage(stageIndex) {
    if (!this.parts) return new Set();
    return new Set(
      this.parts
        .filter(p => p.type === 'engine' && p.enabled !== false && p.stageIndex === stageIndex)
        .map(p => p.id)
    );
  }

  // Recompute thrust / exhaust velocity from the currently ignited, still-attached engines.
  _recomputeStageStats() {
    if (!this.activeParts) return;
    const ignited = this.activeParts.filter(
      p => p.type === 'engine' && p.enabled !== false && this.ignitedEngineIds.has(p.id)
    );
    this.maxThrust  = ignited.reduce((s, p) => s + PART_DEFS[p.type].thrust, 0);
    this.exhaustVel = (ignited.length > 0 ? PART_DEFS.engine.isp : ROCKET.ISP) * G0;

    // Active reservoir = tanks feeding the currently-ignited engines.
    this.activeTankIds   = this._bandTankIds(ignited.map(p => p.row));
    this.initialFuelMass = this.activeTankIds.size * PART_DEFS.tank.fuelMass;
    this.fuelMass        = this._sumTankFuel(this.activeTankIds);
  }

  // Remaining / capacity fuel (kg) for the reservoir feeding a given engine part.
  engineFuelInfo(part) {
    const ids = this._bandTankIds([part.row]);
    return {
      current:  this._sumTankFuel(ids),
      capacity: ids.size * PART_DEFS.tank.fuelMass,
    };
  }

  // Refill the active reservoir to capacity (dev "infinite fuel").
  refuelActive() {
    if (this.activeTankIds) {
      for (const id of this.activeTankIds) this.tankFuel.set(id, PART_DEFS.tank.fuelMass);
      this.fuelMass = this._sumTankFuel(this.activeTankIds);
    } else {
      this.fuelMass = this.initialFuelMass;
    }
  }

  // Drain the active reservoir by `amount` kg (proportional drain leaves the
  // upper reservoirs untouched).
  _burnFuel(amount) {
    if (!this.activeTankIds || this.activeTankIds.size === 0) {
      this.fuelMass = Math.max(0, this.fuelMass - amount);  // fallback single pool
      return;
    }
    let remaining = amount;
    for (const id of this.activeTankIds) {
      if (remaining <= 0) break;
      const cur  = this.tankFuel.get(id) || 0;
      const take = Math.min(cur, remaining);
      this.tankFuel.set(id, cur - take);
      remaining -= take;
    }
    this.fuelMass = this._sumTankFuel(this.activeTankIds);
  }

  canStage() {
    return this.activeStageIndex > 0;
  }

  // Advance to the next stage: fire the current stage's decoupler (if any, dropping
  // everything below it), ignite the next stage's engines, and recompute thrust/mass.
  // Returns the data needed to construct a dropped Stage object, or null if nothing dropped.
  doStage() {
    if (!this.canStage()) return null;

    let droppedData = null;

    // Fire the decoupler assigned to the current (highest remaining) stage. If
    // several share the stage, the bottom-most (largest row) fires.
    const decoupler = this.activeParts
      .filter(p => p.type === 'decoupler' && p.stageIndex === this.activeStageIndex)
      .reduce((lowest, p) => (!lowest || p.row > lowest.row ? p : lowest), null);

    // Parts strictly above the decoupler stay; decoupler + everything below drops.
    const upper   = decoupler ? this.activeParts.filter(p => (p.row + PART_DEFS[p.type].h) <= decoupler.row) : null;
    const dropped = decoupler ? this.activeParts.filter(p => p.row >= decoupler.row) : null;

    // Only drop if something stays attached — guards against a stray assignment
    // trying to jettison the whole rocket (which would blow up the render math).
    if (decoupler && upper.length > 0 && dropped.length > 0) {
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

      // Update active parts to remaining upper section. Dropped tanks take their
      // fuel with them; the new active reservoir is set by _recomputeStageStats().
      this.activeParts = upper;
      this.dryMass = upper.reduce((s, p) => s + PART_DEFS[p.type].dryMass, 0);

      droppedData = {
        parts: dropped,
        x: dropX, y: dropY,
        vx: this.vx, vy: this.vy,
        simTime: this.simTime,
        rotation: this.rotation,
        originalGridH: fullGridH,
      };
    }

    // Count down to the next stage and ignite its engines.
    this.activeStageIndex--;
    for (const id of this._engineIdsForStage(this.activeStageIndex)) {
      this.ignitedEngineIds.add(id);
    }
    this._recomputeStageStats();

    return droppedData;
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
      this._burnFuel(burnRate * dt);
    }

    const a1 = this._accel();
    this.vx += 0.5 * (a0.x + a1.x) * dt;
    this.vy += 0.5 * (a0.y + a1.y) * dt;

    // Surface collision (per-part hitbox — see _checkSurfaceCollision)
    const col = this._checkSurfaceCollision();
    if (col.hit) {
      const speed = Math.hypot(this.vx, this.vy);  // read before the snap zeroes it
      this.state = speed > ROCKET.CRASH_SPEED ? 'crashed' : 'landed';
      // Push the centre outward along the radial normal by the deepest penetration.
      const r  = Math.hypot(this.x, this.y) || 1;
      const nx = this.x / r;
      const ny = this.y / r;
      this.x += nx * col.penetration;
      this.y += ny * col.penetration;
      this.vx = 0;
      this.vy = 0;
      this.throttle = 0;
      return;
    }

    // Transition to Keplerian rails when engines are off and orbit fully clears the atmosphere
    const enginesOff = this.throttle < 0.01 || this.fuelMass <= 0;
    if (enginesOff) {
      const alt = Math.hypot(this.x, this.y) - PLANET.RADIUS;
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

  // Per-part surface collision. Tests every active part's grid-cell rectangle
  // against the planet circle, so the hitbox shrinks correctly after staging and
  // is accurate at any orientation. Returns the deepest penetration found.
  //
  // Works in the rocket's local part frame — the same frame draw() lays parts out
  // in (+X right, +Y down, cellScaleWorld metres per grid cell). The planet centre
  // is transformed into that frame once, then each part is an axis-aligned rect
  // (rotation preserves distances). No side effects.
  _checkSurfaceCollision() {
    // No builder design (fallback triangle): keep the simple single-radius check.
    if (!this.activeParts || this.activeParts.length === 0) {
      const r = Math.hypot(this.x, this.y);
      const surfaceR = PLANET.RADIUS + ROCKET.LENGTH / 2;
      return { hit: r <= surfaceR, penetration: surfaceR - r };
    }

    const cellScaleWorld = ROCKET.LENGTH / this._fullGridH;

    // Active-parts bounding box (metres) — identical layout to draw().
    let minRow = Infinity, maxRowBottom = -Infinity;
    let minCol = Infinity, maxColRight  = -Infinity;
    for (const p of this.activeParts) {
      const def = PART_DEFS[p.type];
      minRow       = Math.min(minRow,       p.row);
      maxRowBottom = Math.max(maxRowBottom,  p.row + def.h);
      minCol       = Math.min(minCol,        p.col);
      maxColRight  = Math.max(maxColRight,   p.col + def.w);
    }
    const halfW = ((maxColRight - minCol) * cellScaleWorld) / 2;
    const halfH = ((maxRowBottom - minRow) * cellScaleWorld) / 2;

    // Planet centre (world origin) in the local part frame: world→local mirrors
    // the inverse transform in partAtScreenPos (screen flips world +Y, then
    // un-rotate by the rocket's rotation).
    const dx = -this.x;
    const dy = -this.y;
    const cosR = Math.cos(this.rotation);
    const sinR = Math.sin(this.rotation);
    const planetLx =  dx * cosR - dy * sinR;
    const planetLy = -dx * sinR - dy * cosR;

    const R2 = PLANET.RADIUS * PLANET.RADIUS;
    let hit = false;
    let maxPenetration = 0;
    for (const p of this.activeParts) {
      const def = PART_DEFS[p.type];
      const px1 = (p.col - minCol) * cellScaleWorld - halfW;
      const py1 = (p.row - minRow) * cellScaleWorld - halfH;
      const px2 = px1 + def.w * cellScaleWorld;
      const py2 = py1 + def.h * cellScaleWorld;

      // Closest point on this part's rectangle to the planet centre.
      const closestX = Math.max(px1, Math.min(planetLx, px2));
      const closestY = Math.max(py1, Math.min(planetLy, py2));
      const ddx = closestX - planetLx;
      const ddy = closestY - planetLy;
      const distSq = ddx * ddx + ddy * ddy;
      if (distSq < R2) {
        hit = true;
        const penetration = PLANET.RADIUS - Math.sqrt(distSq);
        if (penetration > maxPenetration) maxPenetration = penetration;
      }
    }
    return { hit, penetration: maxPenetration };
  }

  toggleEngine(part) {
    if (!part || part.type !== 'engine') return;
    const enabled = part.enabled === false;  // toggled new state
    part.enabled = enabled;
    if (!enabled) {
      this.ignitedEngineIds.delete(part.id);
    } else if (part.stageIndex == null || part.stageIndex >= this.activeStageIndex) {
      // Re-enabling an engine whose stage has already fired (or is firing) re-ignites it.
      this.ignitedEngineIds.add(part.id);
    }
    this._recomputeStageStats();
  }

  // Returns the active part under screen point (sx, sy), or null.
  // Requires draw() to have been called at least once this session.
  partAtScreenPos(sx, sy, camera, canvasWidth, canvasHeight) {
    if (!this.activeParts || this.activeParts.length === 0) return null;
    if (this._drawCellScale == null) return null;

    const sp  = camera.worldToScreen(this.x, this.y, canvasWidth, canvasHeight);
    const lx  = sx - sp.x;
    const ly  = sy - sp.y;

    // Un-rotate from canvas rotation back to local part frame
    const cosR =  Math.cos(this.rotation);
    const sinR =  Math.sin(this.rotation);
    const rx   =  lx * cosR + ly * sinR;
    const ry   = -lx * sinR + ly * cosR;

    const cs   = this._drawCellScale;
    const minCol = this._drawMinCol;
    const minRow = this._drawMinRow;
    const halfW  = this._drawHalfW;
    const halfH  = this._drawHalfH;

    for (const p of this.activeParts) {
      const def = PART_DEFS[p.type];
      const px1 = (p.col - minCol) * cs - halfW;
      const py1 = (p.row - minRow) * cs - halfH;
      const px2 = px1 + def.w * cs;
      const py2 = py1 + def.h * cs;
      if (rx >= px1 && rx <= px2 && ry >= py1 && ry <= py2) return p;
    }
    return null;
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
      this._drawHalfW     = halfW;
      this._drawHalfH     = halfH;
      this._drawMinCol    = minCol;
      this._drawMinRow    = minRow;
      this._drawCellScale = cellScale;

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
          // Only ignited engines flame. ignitedEngineIds already excludes
          // manually-disabled engines and any stage not yet activated, so an
          // engine stays dark until its stage fires.
          if (!this.ignitedEngineIds.has(p.id)) continue;
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
      this._drawHalfW = wid / 2;
      this._drawHalfH = len / 2;
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

  // Draws a velocity arrow in the current canvas context (world layer, pre-rocket-rotation).
  // Call this immediately after draw(), still inside the world-layer ctx.save()/restore() block.
  drawVelocityArrow(ctx, camera, canvasWidth, canvasHeight) {
    if (this.state !== 'flying' && this.state !== 'rails') return;
    if (ROCKET.LENGTH * camera.zoom < CAMERA.VELOCITY_ARROW_MIN_ROCKET_PX) return;

    const speed = Math.hypot(this.vx, this.vy);
    if (speed < 1) return;

    const sp = camera.worldToScreen(this.x, this.y, canvasWidth, canvasHeight);

    // Velocity direction in world-layer screen coords (y-axis flipped vs world)
    const dirX = this.vx / speed;
    const dirY = -this.vy / speed;

    // Project the (rotated) rocket bounding box onto the velocity direction to find hull extent.
    // Box half-extents are in screen pixels; rotation maps local → world-layer screen.
    const hw = this._drawHalfW ?? ROCKET.WIDTH  * camera.zoom / 2;
    const hh = this._drawHalfH ?? ROCKET.LENGTH * camera.zoom / 2;
    const cosRot = Math.cos(this.rotation);
    const sinRot = Math.sin(this.rotation);
    const hullExtent = hw * Math.abs(cosRot * dirX + sinRot * dirY)
                     + hh * Math.abs(cosRot * dirY - sinRot * dirX);

    const arrowBase = hullExtent + CAMERA.VELOCITY_ARROW_OFFSET_PX;
    const arrowLen  = Math.min(
      CAMERA.VELOCITY_ARROW_MAX_PX,
      Math.max(CAMERA.VELOCITY_ARROW_MIN_PX, speed / CAMERA.VELOCITY_ARROW_SPEED_MAX * CAMERA.VELOCITY_ARROW_MAX_PX)
    );

    const bx = sp.x + dirX * arrowBase;
    const by = sp.y + dirY * arrowBase;
    const tx = bx + dirX * arrowLen;
    const ty = by + dirY * arrowLen;

    // Arrowhead
    const HEAD = 8;
    const px = -dirY, py = dirX;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tx - dirX * HEAD, ty - dirY * HEAD);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - dirX * HEAD + px * HEAD * 0.4, ty - dirY * HEAD + py * HEAD * 0.4);
    ctx.lineTo(tx - dirX * HEAD - px * HEAD * 0.4, ty - dirY * HEAD - py * HEAD * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
