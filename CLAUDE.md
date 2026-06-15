# CLAUDE.md — Orbitals

2D browser space flight simulator. Vanilla JS + HTML5 Canvas. No physics engine — all orbital mechanics are custom.

---

## How to Run

Open `index.html` directly in Chrome/Firefox (ES module imports require a server for some browsers):

```bash
npx serve .        # or any static file server
python3 -m http.server 8080
```

---

## Current State

Phases 1–3 are complete and stable.

| Phase | Status |
|---|---|
| 1 — Canvas, world, camera | Done |
| 2 — Rocket, gravity, controls, surface collision | Done |
| 3 — Trajectory predictor | Done |
| 4 — Keplerian Rails | Not started |
| 5+ | Not started |

**Next up: Phase 4** — extract orbital elements from state vector, implement rails mode, implement rails exit.

---

## File Map

| File | Responsibility |
|---|---|
| `index.html` | Single canvas element, loads `js/main.js` as ES module |
| `js/constants.js` | All tunable values — `G`, `PLANET`, `ROCKET`, `CAMERA`, `FIXED_DT` |
| `js/main.js` | Entry point — wires all systems together, game loop callbacks, HUD rendering |
| `js/GameLoop.js` | `requestAnimationFrame` loop with fixed-dt accumulator |
| `js/Camera.js` | World→screen transform, logarithmic zoom, scroll-wheel handler |
| `js/Planet.js` | Draws filled circle + atmosphere gradient |
| `js/Starfield.js` | Static star background |
| `js/Rocket.js` | Rocket state machine, Velocity Verlet integration, thrust, draw |
| `js/Input.js` | Keyboard state via `Set` of held key codes |
| `js/Trajectory.js` | Forward-integrates 500 steps × 10 s/step, draws dashed path |

---

## Key Constants (`js/constants.js`)

```
G               = 6.674e-11
PLANET.RADIUS   = 6_000_000 m   (~Earth-sized)
PLANET.MASS     = 5.972e24 kg
PLANET.ATMOSPHERE_ALTITUDE = 100_000 m
ROCKET.DRY_MASS = 1_000 kg
ROCKET.FUEL_MASS = 9_000 kg
ROCKET.MAX_THRUST = 150_000 N   (TWR ~1.35 at launch)
ROCKET.ISP      = 300 s
ROCKET.LENGTH   = 1_000 m       (game scale — visible at surface zoom)
ROCKET.WIDTH    = 350 m
ROCKET.CRASH_SPEED = 50 m/s
ROCKET.ROTATION_SPEED = 1.5 rad/s
FIXED_DT        = 1/60 s
```

---

## Physics Design

- **Integration**: Velocity Verlet (not Euler) — stable for orbital paths
- **Fixed timestep**: 1/60 s accumulator in `GameLoop`; render may run faster
- **Gravity**: `F = G*M*m / r²` computed in `Rocket._accel()` each half-step
- **Thrust**: Tsiolkovsky — burn rate = `(throttle × MAX_THRUST) / (Isp × g0)`; fuel mass deducted each frame
- **World coords**: meters, planet center at origin (0,0); +Y is up
- **Surface collision**: rocket center altitude vs `PLANET.RADIUS + ROCKET.LENGTH/2`; below 50 m/s → landed, above → crashed

---

## Rocket State Machine

```
landed  →  (W/↑ pressed)  →  flying
flying  →  (surface contact, speed < 50 m/s)  →  landed
flying  →  (surface contact, speed ≥ 50 m/s)  →  crashed
crashed →  (reload)
```

---

## Rendering Pipeline (each frame, in order)

1. Clear canvas (`#00000a`)
2. Starfield
3. Planet + atmosphere
4. Trajectory dashes
5. Rocket triangle + flame
6. HUD overlay (top-left)

Camera converts world coords to screen via `camera.worldToScreen(x, y, canvasW, canvasH)`.

---

## Phase 4 Design Notes (Keplerian Rails)

When engines cut off and the orbit clears the atmosphere, switch from Newtonian integration to analytical position from orbital elements:

- `stateToOrbitalElements(pos, vel, μ)` → `{ a, e, ω, ν₀, t₀ }`
- `positionFromOrbitalElements(elements, t)` using Kepler's equation (solve for eccentric anomaly E iteratively, then convert to position)
- Rails exit: on any thrust input, reconstruct `(x, y, vx, vy)` from elements at current `t` and resume Verlet

**Physics bubble (implement in Phase 6 when dropped stages exist):** Objects on rails have no collision geometry — they phase through everything. Fix: each frame, compute the analytical position of every rails object and check distance to the active rocket. If `distance < PHYSICS_BUBBLE_RADIUS` (constant to add in Phase 6, ~500 m), reconstruct that object's state vector and return it to Newtonian integration.

---

## Controls

| Key | Action |
|---|---|
| W / ↑ | Throttle up (also launches from surface) |
| S / ↓ | Throttle down |
| A / ← | Rotate left |
| D / → | Rotate right |
| Space | Next stage (Phase 6+) |
| T | SAS toggle (Phase 8) |
| M | Map view (Phase 8) |
| Scroll | Zoom in/out |
