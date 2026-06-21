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

| Phase | Status |
|---|---|
| 1 — Canvas, world, camera | Done |
| 2 — Rocket, gravity, controls, surface collision | Done |
| 3 — Trajectory predictor | Done |
| 4 — Keplerian Rails | Done |
| 5 — Orbit Display | Done |
| 6 — Builder (VAB), parts palette, staging | Done |
| 7 — SAS, map view, time warp, dropped stage physics | Done |
| 8+ | Not started |

**Next up:** Map screen polish — see `polish-map.md` for planned changes.

---

## File Map

| File | Responsibility |
|---|---|
| `index.html` | Single canvas element, loads `js/main.js` as ES module |
| `builder.html` | Vehicle Assembly Building (VAB) — part placement UI |
| `js/constants.js` | All tunable values — `G`, `PLANET`, `ROCKET`, `CAMERA`, `FIXED_DT` |
| `js/main.js` | Entry point — wires all systems together, game loop callbacks, HUD, map view, VAB building |
| `js/GameLoop.js` | `requestAnimationFrame` loop with fixed-dt accumulator |
| `js/Camera.js` | World→screen transform, logarithmic zoom, scroll-wheel handler |
| `js/Planet.js` | Draws filled circle + atmosphere gradient |
| `js/Starfield.js` | Static star background |
| `js/Rocket.js` | Rocket state machine, Velocity Verlet integration, thrust, parts-based draw, staging |
| `js/Stage.js` | Dropped stage — independent physics, rails transition, parts-based draw |
| `js/Input.js` | Keyboard state via `Set` of held key codes |
| `js/Trajectory.js` | Forward-integrates 500 steps × 10 s/step, draws dashed path + orbit ellipse |
| `js/OrbitalMechanics.js` | State→orbital elements, elements→state reconstruction (Kepler solver) |
| `js/parts.js` | Part definitions (`PART_DEFS`) and draw functions (`DRAW_FNS`) for pod, tank, engine, decoupler |
| `js/builder.js` | VAB grid logic — part placement, validation, save/load designs to localStorage |

---

## Key Constants (`js/constants.js`)

```
G               = 6.674e-11
PLANET.RADIUS   = 6_000_000 m   (~Earth-sized)
PLANET.MASS     = 5.972e24 kg
PLANET.ATMOSPHERE_ALTITUDE = 100_000 m
ROCKET.DRY_MASS = 1_000 kg      (fallback if no builder design saved)
ROCKET.FUEL_MASS = 9_000 kg
ROCKET.MAX_THRUST = 150_000 N   (TWR ~1.35 at launch)
ROCKET.ISP      = 300 s
ROCKET.LENGTH   = 1_000 m       (game scale — used for fallback triangle + cell scaling)
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
landed  →  (W/↑ pressed)                          →  flying
flying  →  (engines off, orbit above atmosphere)   →  rails
flying  →  (surface contact, speed < 50 m/s)       →  landed
flying  →  (surface contact, speed ≥ 50 m/s)       →  crashed
rails   →  (W/↑ pressed — any thrust input)        →  flying
crashed →  (reload)
```

On rails, position is computed analytically from Keplerian orbital elements each frame instead of integrating forces. `rocket.railsElements` holds `{ a, e, omega, prograde, M0, n, t_epoch }`.

Dropped stages (`Stage.js`) have the same flying→rails transition but no thrust. They are stored in `droppedStages[]` in `main.js`. A physics bubble (`PHYSICS_BUBBLE_RADIUS`) forces a rails stage back to Newtonian if it gets close to the active rocket.

---

## Builder (VAB)

`builder.html` + `js/builder.js` — a separate page for designing rockets on a grid.

- Parts: **pod**, **tank**, **engine**, **decoupler** — defined in `js/parts.js` with size, mass, thrust, and ISP values
- Valid designs require exactly one pod at the top, at least one engine at the bottom, and no floating parts
- Design is saved to `localStorage` as `rocketDesign` — `Rocket.js` reads it on construction
- Computed values (fuelMass, dryMass, maxThrust, isp) are derived from the placed parts and stored in the design object

### Rocket rendering from parts

`Rocket.draw()` iterates `activeParts`, computes a bounding box (`minRow`, `maxRowBottom`, `minCol`, `maxColRight`), and scales cell sizes so the full rocket height always maps to `ROCKET.LENGTH * camera.zoom` pixels. `halfH` and `halfW` (screen-space) are available mid-draw for offset calculations. Falls back to a plain triangle if no design is saved.

`Stage.draw()` uses the same approach with `originalGridH` (the full-rocket grid height at the time of staging) to keep part sizes consistent after decoupling.

---

## Rendering Pipeline (each frame, in order)

1. Clear canvas (`#00000a`)
2. Starfield (fixed — doesn't rotate with horizon lock)
3. World layer (rotated for horizon lock near surface):
   - Planet + atmosphere
   - VAB building
   - Trajectory dashes / orbit ellipse
   - Dropped stages
   - Rocket (parts-based or fallback triangle) + engine flames
4. Map overlay: position dots for rocket and dropped stages (rendered when `mapView = true`)
5. HUD overlay (top-left, always upright)
6. Dev panel (top-right)

Camera converts world coords to screen via `camera.worldToScreen(x, y, canvasW, canvasH)`.

---

## Keplerian Rails

`js/OrbitalMechanics.js` exports:

- `stateToElements(x, y, vx, vy, simTime)` → `{ a, e, omega, prograde, M0, n, t_epoch }`
- `elementsToState(elements, t)` → `{ x, y, vx, vy }`

The Kepler equation (eccentric anomaly E) is iterated to convergence inside `elementsToState`. `Trajectory.js` samples 360 points from elements to draw the closed orbit ellipse and finds apoapsis/periapsis for labeled markers.

---

## Map View

Toggled with `M`. Implemented entirely in `main.js`:

- Camera recenters on origin (0, 0) and auto-zooms to fit the current orbit
- Position dots are drawn for the rocket (white, 4px) and dropped stages (grey, 3px)
- Flight camera zoom is saved/restored on map toggle (`_mapSavedLogZoom`)

---

## Controls

| Key | Action |
|---|---|
| W / ↑ | Throttle up (also launches from surface; exits rails) |
| S / ↓ | Throttle down |
| A / ← | Rotate left |
| D / → | Rotate right |
| . (period) | Increase time warp |
| , (comma) | Decrease time warp / cancel warp target |
| Click orbit | Click a point on the rails trajectory to warp there |
| Space | Next stage (drop decoupler + lower parts) |
| T | SAS toggle |
| M | Map view toggle |
| Scroll | Zoom in/out |

**Time warp levels:** flying = 1×/2×/3×; rails = 1×/10×/50×/100×

**Dev panel:** top-right corner in flight — "infinite fuel" toggle. Controlled by `dev.infiniteFuel` flag in `main.js`.
