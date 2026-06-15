# Technical Specification — Orbitals (2D Browser Space Flight Simulator)

## Overview

A 2D space flight simulator running natively in the browser, inspired by Space Flight Simulator and Kerbal Space Program. Built with vanilla JavaScript and HTML5 Canvas. No rigid-body physics engines. All orbital mechanics are custom-built.

---

## Target Environment

| Property | Value |
|---|---|
| Platform | Browser (Chrome, Firefox) |
| Rendering | HTML5 Canvas 2D |
| Language | Vanilla JavaScript (ES6+) |
| UI Library | Lightweight CSS framework or dat.GUI for menus/buttons only |
| Save System | localStorage (MVP) — no accounts, no cloud |
| Multiplayer | Not in scope for MVP |

---

## System 1: Physics Engine

### Gravity Simulation
- Custom Newtonian gravity loop — no third-party rigid-body engines (no Matter.js, Cannon.js, etc.)
- Gravity force calculated each frame: `F = G * M * m / r²`
- Applied to the rocket as a velocity delta every tick
- Single gravitational body (Earth analog) for MVP
- Planet has a fixed mass, radius, and surface altitude

### Integration Method
- Velocity Verlet or RK4 integration for active physics (more stable than Euler for orbital paths)
- Time step: fixed small delta (e.g. 1/60s) to keep simulation deterministic

### Atmosphere
- Simple atmospheric model: drag increases as altitude decreases below a defined threshold
- Atmosphere has a defined upper boundary (e.g. 100km analog)
- Heating is post-MVP

---

## System 2: Hybrid Orbital Mechanics

### Active Physics Mode
- Runs when engines are firing
- Frame-by-frame Newtonian integration (gravity + thrust vectors each tick)
- Rocket position and velocity updated every frame

### Keplerian Rails Mode
- Runs when engines are off AND the orbit does not intersect the atmosphere
- Rocket is placed "on rails" — position computed analytically from orbital elements, not stepped frame by frame
- Eliminates drift and floating-point error accumulation over long coasting arcs

### Mode Switch Logic
| Trigger | Transition |
|---|---|
| Engine cut-off + orbit clears atmosphere | Active → Rails |
| Thrust applied (any amount) | Rails → Active |
| Orbit decays into atmosphere | Rails → Active |

### Orbital Elements Stored on Rails
- Semi-major axis (a)
- Eccentricity (e)
- Argument of periapsis (ω)
- True anomaly at engine cut-off (ν₀)
- Time of engine cut-off (t₀)

Position on rails is derived from these elements using Kepler's equation at any given time `t`.

---

## System 3: Trajectory Predictor

- Draws the predicted orbit path on screen at all times when in orbit
- When in rails mode: draws the full Keplerian ellipse analytically (exact)
- When in active mode (thrusting): recalculates trajectory forward N steps using the current state vector and projects the resulting path
- Trajectory updates in real time as thrust direction or magnitude changes
- Shows periapsis and apoapsis markers on the orbit ellipse

---

## System 4: Rocket & Parts

### Rocket Object Properties
| Property | Type | Notes |
|---|---|---|
| position | Vector2 | x, y in world coordinates |
| velocity | Vector2 | m/s |
| mass | float | kg, decreases as fuel burns |
| rotation | float | radians |
| thrust | float | N, current engine output |
| fuel | float | kg remaining |

### MVP Part Types
| Part | Function |
|---|---|
| Command Pod | Top of rocket, required — sets control point |
| Fuel Tank | Stores fuel mass, feeds connected engine |
| Engine | Converts fuel to thrust, has Isp and thrust rating |
| Decoupler | Separates stages; drops spent parts |

### Staging
- Stages fire in sequence (bottom to top)
- Decoupler fires, detaches lower stage, next engine activates
- Dropped stages become independent physics objects (simplified, no propulsion)

### Grid-Based Builder
- Parts snap to a grid
- Drag and drop from a parts palette
- Stack assembled vertically (2D side view)
- Builder validates: must have at minimum one pod + one engine + one fuel tank

---

## System 5: Controls

| Input | Action |
|---|---|
| W / Up Arrow | Throttle up |
| S / Down Arrow | Throttle down |
| A / Left Arrow | Rotate left |
| D / Right Arrow | Rotate right |
| Space | Activate next stage |
| T | Toggle SAS (stability assist) |
| M | Toggle map view |
| Scroll | Zoom in/out |

---

## System 6: Camera & Rendering

- Camera follows the active rocket
- Zoom scales smoothly (logarithmic scale to handle surface → orbit range)
- Map view: zoomed-out view showing the planet, orbit ellipse, and rocket position
- World units: meters (1px ≠ 1m; scale factor applied at render time)
- Planet rendered as a filled circle with a surface color and atmosphere gradient ring

---

## Out of Scope for MVP

- Firebase / Supabase (accounts, cloud saves)
- Multiplayer
- Multiple planets / gravity assists
- Atmospheric heating / reentry effects
- Docking
- EVA / crew mechanics
- Mod support