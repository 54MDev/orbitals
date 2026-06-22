# Staging System Update

Builder-side staging panel, per-engine enable/disable, and in-game staging integration. Covers every behavior, data model, and edge case.

---

## Phases

Implementation is split into five sequential phases. Each phase is a releasable checkpoint — the game should be playable (no crashes, no broken state) at the end of each one.

### Phase 1 — Data Model & Migration
*Prerequisite for every other phase.*

- Add `id`, `enabled`, `stageIndex` fields to part objects in `builder.js`
- Add `stages` array to the saved design object
- Bump `GRID_VERSION` to 4
- Add `v < 4` migration branch in `migratePartsToCurrentGrid` (assigns IDs, runs auto-assign, defaults `enabled: true`)
- Add `Rocket.js` migration path so old saves don't crash on load
- No visible UI change yet; existing behaviour is preserved

### Phase 2 — Per-Engine Enable/Disable (Feature A)
*Requires Phase 1 (`enabled` field and part `id` on every engine).*

- Replace the right-click delete shortcut with a positioned context menu (`#ctx-menu`)
- Wire "Remove part" and "Enable/Disable engine" actions
- Draw dimmed + red-cross indicator on disabled engines in the builder canvas
- Update `computeDesign()` / `updateStats()` so `maxThrust` and `isp` exclude disabled engines
- Validation: "No engine" error when no enabled engine has a stage assignment

### Phase 3 — Staging Panel + ΔV (Feature B)
*Requires Phase 1 (`stageIndex`, `stages` array) and Phase 2 (`enabled` flag used in ΔV calc and validation).*

- Implement `autoAssignStages()` — position-based band algorithm
- Add STAGING section to right sidebar in `builder.html`
- Render stage rows: badge, editable label, part chips, ΔV display
- Wire AUTO-ASSIGN button, Add stage (+), Delete stage (✕)
- Show "Unassigned" warning row; add validation errors for unassigned engines/decouplers
- Compute per-stage ΔV (Tsiolkovsky, cumulative mass accounting) and total ΔV line

### Phase 4 — In-Game Integration (Feature D)
*Requires Phase 3 (the `stages` array in the saved design must be populated correctly before the rocket can read it).*

- `Rocket` constructor reads `design.stages`, initialises `activeStageIndex` and `ignitedEngineIds`
- `_accel()` sums thrust only from ignited + enabled engines
- `doStage()` advances `activeStageIndex`, ignites next-stage engines, fires the stage's decoupler if present, recomputes mass/thrust
- `canStage()` checks whether a next stage exists
- HUD stage counter changes from `STG 2` to `STG 1/3` format

### Phase 5 — Per-Part Hitbox (Feature C)
*Requires Phase 4 (activeParts must shrink correctly after staging before the per-part collision check is meaningful).*

- Extract `_checkSurfaceCollision()` on `Rocket` — iterates `activeParts`, transforms planet centre into rocket-body frame, tests each part as an axis-aligned rectangle
- Replace the single `surfaceR` constant check with the per-part loop
- Replace hardcoded position snap with penetration-depth push along the radial direction
- Result: collision fires against the actual geometry of whatever parts remain after staging, at any orientation

---

## Table of Contents

1. [Overview](#overview)
2. [Data Model Changes](#data-model-changes)
3. [Feature A — Per-Engine Enable/Disable](#feature-a--per-engine-enabledisable)
4. [Feature B — Staging Hierarchy Panel](#feature-b--staging-hierarchy-panel)
5. [Feature C — Dynamic Hitbox After Staging](#feature-c--dynamic-hitbox-after-staging)
6. [Feature D — In-Game Integration](#feature-d--in-game-integration)
7. [Delta-V Calculation](#delta-v-calculation)
7. [Saved Design Format](#saved-design-format)
8. [Migration from Old Designs](#migration-from-old-designs)
9. [Files Touched](#files-touched)

---

## Overview

This update adds three interlocking systems:

- **Per-engine enable/disable** — right-click context menu on any engine in the builder canvas; disabled engines contribute zero thrust and show a visual indicator
- **Staging hierarchy panel** — KSP-style staging column in the right sidebar; stages are sequence events, each holding a set of engines to ignite and optionally a decoupler to fire; the panel shows computed delta-V per stage
- **In-game integration** — `Rocket.js` reads the staging data from the design; Space advances the active stage, firing only the engines assigned to that stage and the stage's decoupler

These are separate but connected: enable/disable is an override that prevents an engine from ever firing regardless of its stage assignment. Staging controls *when* enabled engines ignite.

---

## Data Model Changes

### Part objects

Every part in `placedParts` (and in saved designs) gains two new optional fields:

```js
{
  type: 'engine',
  col: 8,
  row: 14,
  id: 'part_3',        // NEW — stable unique ID, assigned when part is placed
  enabled: true,       // NEW — only on engines; true = engine participates in thrust; default true
  stageIndex: 0,       // NEW — engines and decouplers only; which stage this part fires in; default computed from position
}
```

- `id` is a string `'part_N'` where N is a monotonically increasing counter per session. Survives save/load. Pod and tank parts have `id` too but no `enabled` or `stageIndex`.
- `enabled` field only exists on parts with `type === 'engine'`. It is never set on pods, tanks, or decouplers.
- `stageIndex` is a zero-based integer. Stage 0 fires first (launch). Stage 1 fires on first Space press. Stage 2 fires on second Space press, and so on. Only engines and decouplers carry `stageIndex`.

### Design object (what gets saved to `localStorage`)

```js
{
  gridVersion: 4,               // bumped from 3
  parts: [ ...partObjects ],    // now includes id, enabled, stageIndex fields
  stages: [
    {
      index: 0,                 // 0 = fires first (launch stage)
      label: 'Stage 1',        // display name; user-editable
      partIds: ['part_3', 'part_5'],   // IDs of engines + decouplers that fire in this stage
    },
    ...
  ],
  dryMass,
  fuelMass,
  maxThrust,                   // now = sum of ENABLED engines only (consistent with staging at launch)
  isp,
  valid,
  errors,
}
```

The `stages` array is ordered by `index` (ascending = fires first to last). It must be kept in sync with `stageIndex` fields on parts — they are redundant but both are maintained for easy lookup.

---

## Feature A — Per-Engine Enable/Disable

### Right-click context menu

Currently `contextmenu` on the canvas deletes the hovered part immediately. This changes to:

1. `contextmenu` fires → identify `partAtCell(hoverCell)`.
2. If no part hit → do nothing (keep `e.preventDefault()`).
3. If part hit → show a positioned HTML menu at `(e.clientX, e.clientY)`. Do **not** delete the part automatically.

#### Menu options by part type

| Part type | Menu items |
|---|---|
| pod | "Remove part" |
| tank | "Remove part" |
| decoupler | "Remove part" |
| engine (enabled) | "Remove part" · "Disable engine" |
| engine (disabled) | "Remove part" · "Enable engine" |

"Remove part" performs the existing deletion logic. "Enable/Disable engine" toggles `part.enabled` and calls `updateStats()` + re-renders the staging panel.

#### Context menu HTML structure

The menu is a `<div id="ctx-menu">` element created once in `builder.html` and positioned via `style.left` / `style.top`. It is hidden (`display: none`) by default and shown on right-click. It is dismissed by:
- Clicking anywhere outside the menu
- Pressing Escape
- Scrolling the canvas
- A second right-click (opens a fresh menu)

CSS: dark background (`#1a1a2a`), 1px border (`rgba(80, 130, 220, 0.4)`), monospace font, 12px, no shadows. Each menu item is a `<button>` that clears and hides the menu after its action. "Remove part" text is normal white. "Disable engine" / "Enable engine" text uses the same color scheme as the enabled/disabled indicator (see below).

#### Visual indicator on disabled engines

When an engine has `enabled: false`, the `drawPartAt` call for that engine passes `alpha = 0.35` (strongly dimmed). On top of the dimmed engine, a red diagonal cross is drawn in canvas space over the engine's bounding box:

```
two lines from (px, py) → (px+cw, py+ch)
            and (px+cw, py) → (px, py+ch)
strokeStyle = 'rgba(220, 60, 60, 0.8)'
lineWidth = 2
```

Enabled engines show no extra indicator (normal render).

#### Stats impact

`computeDesign()` changes:
- `maxThrust` = sum of thrust from **enabled** engines only
- `isp` = average ISP of **enabled** engines only (disabled engines excluded from count)
- The "No engine" validation error triggers when there are no enabled engines with a stage assignment

---

## Feature B — Staging Hierarchy Panel

### Stage concept

A **stage** is a sequence event. Each stage contains:
- Zero or more **engines** — ignite when this stage fires
- Zero or one **decoupler** — separates when this stage fires (if present)

At launch, Stage 0 fires automatically (its engines run from launch). Pressing Space fires Stage 1 (ignites Stage 1 engines, fires Stage 1 decoupler if assigned). Pressing Space again fires Stage 2, and so on.

An empty stage (no parts assigned) is valid — pressing Space advances past it with no effect. This lets the user add timing beats or reserve slots for future parts.

### Auto-assignment algorithm

Auto-assignment runs whenever `placedParts` changes (part placed, removed, or type changed). It does **not** override manually set `stageIndex` values unless the user explicitly clicks "Auto-assign stages" in the panel.

Auto-assign logic:

1. Collect all decouplers, sorted by `row` ascending (top of grid = low row = top of rocket).
2. Number stages from bottom of rocket upward:
   - Parts **below** the lowest decoupler (highest row number) → `stageIndex = 0` (fires first)
   - Parts **between** the lowest and second-lowest decoupler → `stageIndex = 1`
   - … and so on for each band between adjacent decouplers
   - Parts **above** the highest decoupler → highest `stageIndex` (fires last, stays with pod)
   - The decoupler itself → same `stageIndex` as the parts below it (it fires when that stage fires, separating the lower segment)

3. Engines and decouplers get `stageIndex` assigned. Pod and tank parts get no `stageIndex`.

**Example** (3-stage rocket, bottom to top):
```
[engine A] row 30  → stageIndex 0  (launch — fires from lift-off)
[tank]     row 24
[decoupler]row 22  → stageIndex 0  (fires with stage 0 to separate bottom segment)
[engine B] row 18  → stageIndex 1
[tank]     row 12
[decoupler]row 10  → stageIndex 1
[engine C] row 6   → stageIndex 2
[tank]     row 2
[pod]      row 0
```

Stage 0 (launch): engine A fires, then decoupler at row 22 separates.
Stage 1: engine B fires, then decoupler at row 10 separates.
Stage 2: engine C fires, no decoupler.

### Staging panel UI (right sidebar)

Location: in `builder.html`'s right sidebar, below the existing stats/validation block and above the save/load section. A horizontal rule separates it.

Panel heading: `STAGING` in the same monospace uppercase style as other sidebar headings.

An "Auto-assign" button at the top of the panel re-runs the auto-assignment algorithm, overwriting all existing `stageIndex` values. Label: `AUTO-ASSIGN`.

#### Stage list

Each stage is a row in the panel, rendered from lowest index (fires first) at the top to highest at the bottom. This is intentional: visually the first-to-fire stage is at the top of the list.

Each stage row contains:
- **Stage badge**: `STG 0`, `STG 1`, etc. — small colored badge (same blue as grid lines)
- **Label** (editable): a single-line `<input type="text">` showing e.g. `Stage 1`. Width ~80px. On blur or Enter, updates `stage.label`. Placeholder: `Stage N`.
- **Part chips**: a horizontal list of small icon chips for each engine/decoupler assigned to this stage. Each chip shows the part type abbreviation (`ENG`, `DCP`) and a number if there are multiple of the same type (e.g., `ENG×2`). Chips are read-only in this version — dragging between stages is **not** in scope for this update; use "Auto-assign" or remove/re-add parts.
- **ΔV display**: right-aligned, format `Δv 1234 m/s`. Shows `—` if the stage has no enabled engines or no fuel in its segment.
- **Add stage above** button: `+` icon at the top of the stage list inserts a new empty stage at index 0, bumping all others up. This allows the user to add a no-op delay stage before launch.
- **Delete stage** button: `✕` on each row. Removes the stage entry and sets all parts in that stage to `stageIndex = null` (unassigned). Unassigned parts are shown in a special "Unassigned" row at the bottom of the panel in red, signaling the user they need to auto-assign or manually reassign.

An "Unassigned" row appears at the bottom if any engines or decouplers have `stageIndex = null`. It shows red part chips and the text `⚠ Not staged`. The validation error block adds `"Unassigned engines/decouplers"` to the error list when this row is non-empty.

#### Panel height

The staging panel has a max height of `240px` with `overflow-y: auto` — scrolls internally if many stages. This avoids pushing the save/load section off screen.

### Validation additions

New errors added to `computeDesign()`:

- `"Unassigned engines"` — one or more engines have `stageIndex === null`
- `"Unassigned decouplers"` — one or more decouplers have `stageIndex === null`

These block the launch button (`nav-launch` stays disabled).

---

## Feature C — Per-Part Hitbox

### Problem

`surfaceR` at [Rocket.js:185](js/Rocket.js#L185) is a single radius computed from `ROCKET.LENGTH / 2` — a constant that never changes and treats the rocket as if it were a point at its center with a fixed reach to the ground. This fails in two ways:

1. After staging, the remaining parts are smaller but the radius is unchanged, so collision fires before any part actually touches the surface (or long after, depending on orientation).
2. Even on a fresh rocket, the hitbox is one number derived from the overall rocket height, not from where the actual parts sit. If the rocket is tilted, the real lowest corner of any part could be very different from what `ROCKET.LENGTH / 2` assumes.

Per-part hitbox fixes both: each active part's grid-cell bounding box is tested against the planet circle individually, using the same coordinate transform that `draw()` already computes.

---

### Coordinate systems

`draw()` establishes a local 2D frame at the rocket center by calling `ctx.translate(sp.x, sp.y)` then `ctx.rotate(this.rotation)`. Parts are then drawn at positions:

```js
const cellScale = ROCKET.LENGTH * camera.zoom / this._fullGridH;   // screen px per grid cell
const px = (p.col - minCol) * cellScale - halfW;   // local canvas X (right = +)
const py = (p.row - minRow) * cellScale - halfH;   // local canvas Y (down = +)
```

For physics, the same formula applies in **world meters** by substituting `cellScaleWorld = ROCKET.LENGTH / this._fullGridH` (no `camera.zoom`).

Canvas `+Y` is down; world `+Y` is up. To convert a draw-local position `(lx, ly)` to a **rocket-body frame** position `(bx, by)` where `+Y` aligns with world up:

```
bx = lx
by = -ly
```

To convert a rocket-body position to **world coordinates**:

```
worldX = rocket.x + bx * cos(rotation) - by * sin(rotation)
worldY = rocket.y + bx * sin(rotation) + by * cos(rotation)
```

(`rotation = 0` means nose pointing in world `+Y`; the thrust formula `ay += a * cos(rotation)` confirms this.)

---

### Per-part check: rotated rectangle vs circle

The planet is a circle of radius `PLANET.RADIUS` centred at world origin `(0, 0)`.

Rather than transforming each part to world space and back, it is cheaper to transform the planet centre into the rocket-body frame once, then test every part as an axis-aligned rectangle there (rotation preserves distances).

**Planet centre in rocket-body frame:**

```js
const dx = 0 - rocket.x;          // world vector from rocket to planet
const dy = 0 - rocket.y;
const cosR = Math.cos(rocket.rotation);
const sinR = Math.sin(rocket.rotation);
// rotate by -rotation to enter rocket-body frame
const planetBx =  dx * cosR + dy * sinR;
const planetBy = -dx * sinR + dy * cosR;
```

**Per-part rectangle in rocket-body frame:**

Using the same `minCol`, `minRow`, `halfWworld`, `halfHworld` derived from `activeParts` (identical to what `draw()` computes, but in world meters):

```js
const cellScaleWorld = ROCKET.LENGTH / rocket._fullGridH;

// bounding box of activeParts
let minRow = Infinity, maxRowBottom = -Infinity;
let minCol = Infinity, maxColRight  = -Infinity;
for (const p of activeParts) {
  const def = PART_DEFS[p.type];
  minRow       = Math.min(minRow,      p.row);
  maxRowBottom = Math.max(maxRowBottom, p.row + def.h);
  minCol       = Math.min(minCol,      p.col);
  maxColRight  = Math.max(maxColRight,  p.col + def.w);
}
const halfWworld = ((maxColRight - minCol) * cellScaleWorld) / 2;
const halfHworld = ((maxRowBottom - minRow) * cellScaleWorld) / 2;

// for each part:
const lx = (p.col - minCol) * cellScaleWorld - halfWworld;   // draw-local left edge
const ly = (p.row - minRow) * cellScaleWorld - halfHworld;   // draw-local top edge
const pw = def.w * cellScaleWorld;
const ph = def.h * cellScaleWorld;

// convert to body frame (+Y = up)
const bodyMinX = lx;
const bodyMaxX = lx + pw;
const bodyMinY = -(ly + ph);   // draw bottom → body top (Y flipped)
const bodyMaxY = -ly;           // draw top  → body bottom
```

**Closest point on part rectangle to planet centre:**

```js
const closestX = Math.max(bodyMinX, Math.min(planetBx, bodyMaxX));
const closestY = Math.max(bodyMinY, Math.min(planetBy, bodyMaxY));
const distSq   = (closestX - planetBx) ** 2 + (closestY - planetBy) ** 2;
```

If `distSq < PLANET.RADIUS ** 2` → this part is intersecting the planet.

**Penetration depth for that part:**

```js
const penetration = PLANET.RADIUS - Math.sqrt(distSq);
```

---

### Collision response (snap)

Find the maximum penetration across all parts that are intersecting. Push the rocket centre outward along the radial direction by that amount:

```js
const r   = Math.hypot(rocket.x, rocket.y);
const nx  = rocket.x / r;    // outward unit normal (planet → rocket)
const ny  = rocket.y / r;

rocket.x += nx * maxPenetration;
rocket.y += ny * maxPenetration;
rocket.vx = 0;
rocket.vy = 0;
```

This replaces the current hardcoded snap at [Rocket.js:190–191](js/Rocket.js#L190). Speed is still read before the snap to determine landed vs crashed; that logic is unchanged.

---

### Where this code lives

Extract a private method `_checkSurfaceCollision()` on `Rocket` that returns `{ hit: bool, penetration: number }`. Call it from `update()` in place of the current `r <= surfaceR` block. The method has no side effects — it only reads `this.activeParts`, `this.x`, `this.y`, `this.rotation`, `this._fullGridH`.

Caching: `minCol`, `minRow`, `halfWworld`, `halfHworld`, and `cellScaleWorld` are the same across all parts per frame. Compute them once at the top of `_checkSurfaceCollision()` before the per-part loop.

---

### Initial placement

The constructor sets `this.y = PLANET.RADIUS + ROCKET.LENGTH / 2`. At construction all parts are active, `_fullGridH` equals the full bounding box height, and `halfHworld = ROCKET.LENGTH / 2`, so the lowest part's bottom edge in rocket-body frame sits at `-halfHworld = -ROCKET.LENGTH / 2` — exactly on the surface when `this.y = PLANET.RADIUS + ROCKET.LENGTH / 2`. No change needed here.

---

### Result

After staging the dropped segment is gone from `activeParts`, so `_checkSurfaceCollision()` only tests the parts that are actually still on the rocket, in their correct positions. The collision fires exactly when a real part corner or edge enters the planet circle, regardless of how many stages have been dropped or what angle the rocket is at.

---

## Feature D — In-Game Integration

### Design reading in `Rocket.js`

`Rocket` constructor changes:

```js
this.stages = design ? design.stages : [{ index: 0, label: 'Stage 1', partIds: [] }];
this.activeStageIndex = 0;
```

`activeParts` is initialized as before (all parts). A new derived state `activeEngineIds` is computed each time the stage advances:

```js
// Set of part IDs for engines that are currently ignited
this.ignitedEngineIds = new Set(
  this.parts
    .filter(p => p.type === 'engine' && p.enabled !== false && p.stageIndex === 0)
    .map(p => p.id)
);
```

### Thrust calculation changes

`_accel()` currently uses `this.maxThrust`. After this update it uses:

```js
const activeThrust = this.activeParts
  .filter(p => p.type === 'engine' && this.ignitedEngineIds.has(p.id))
  .reduce((sum, p) => sum + PART_DEFS[p.type].thrust, 0);
```

`exhaustVel` similarly uses only ignited engines' ISP.

### `doStage()` changes

When Space is pressed, `doStage()` now:

1. Finds the current `activeStageIndex`. Fires the decoupler (if any) assigned to this stage — splits `activeParts` as before (parts below decoupler are dropped).
2. Increments `activeStageIndex`.
3. Ignites all engines in the new stage (adds their IDs to `ignitedEngineIds`).
4. Recomputes `dryMass`, `maxThrust`, `exhaustVel` from remaining `activeParts` filtered by `ignitedEngineIds`.

If the stage has no decoupler, `doStage()` still advances the stage index and ignites next-stage engines, but does **not** split the rocket.

`canStage()` returns true when `activeStageIndex < stages.length - 1` (there is a next stage to advance to).

### HUD changes

The existing HUD line:
```
STG  2  [SPACE]
```

Changes to:
```
STG 1/3  [SPACE]
```
— showing current stage / total stages.

---

## Delta-V Calculation

Delta-V for each stage uses the Tsiolkovsky rocket equation: **ΔV = Isp × g₀ × ln(m₀ / m₁)**

Where:
- `g₀ = 9.80665 m/s²`
- `m₀` = wet mass at the start of this stage firing
- `m₁` = m₀ minus the fuel in this stage's segment tanks
- `Isp` = average ISP of the **enabled** engines assigned to this stage

### Segment fuel scope

The fuel tanks available to a stage are those in its physical segment: between the decoupler that fires with this stage and the decoupler below the previous stage (or the bottom of the rocket if this is Stage 0).

Specifically, for Stage N:
- Lower boundary: the row of the Stage N decoupler (if any), or bottom of rocket
- Upper boundary: the row of the Stage (N-1) decoupler (exclusive), or top of rocket

All tanks whose rows fall within this range contribute their `fuelMass`.

### Cumulative mass accounting

Stages are computed in fire order (Stage 0 first):

```
Stage 0:
  m0 = total wet mass of entire rocket
  fuel_0 = sum of fuelMass of tanks in Stage 0 segment
  m1 = m0 - fuel_0
  ΔV_0 = Isp_0 × g0 × ln(m0 / m1)

Stage 1:
  m0 = total wet mass - (mass of Stage 0 segment, i.e., all parts whose stageIndex <= 0 that get dropped)
      Note: Stage 0 segment mass = sum of dryMass + fuelMass of all parts in Stage 0 segment
  fuel_1 = sum of fuelMass of tanks in Stage 1 segment
  m1 = m0 - fuel_1
  ΔV_1 = Isp_1 × g0 × ln(m0 / m1)

... repeat for each stage
```

If a stage has no enabled engines → ΔV = 0 (shown as `—`).
If m1 <= 0 (impossible case) → shown as `—`.
If m0 = m1 (no fuel) → ΔV = 0, shown as `—`.

### Display

In the staging panel, each stage row shows:
```
STG 0  Stage 1  [ENG] [DCP]      Δv 2340 m/s
```

Below the staging panel, a total ΔV line:
```
Total Δv:  4820 m/s
```

This replaces no existing stat — it is additive below the panel.

---

## Saved Design Format

### gridVersion bump: 3 → 4

`GRID_VERSION` in `builder.js` increments to `4`.

Full example of a v4 design object:

```json
{
  "gridVersion": 4,
  "parts": [
    { "type": "pod",       "col": 8, "row": 0,  "id": "part_0" },
    { "type": "tank",      "col": 8, "row": 2,  "id": "part_1" },
    { "type": "engine",    "col": 8, "row": 8,  "id": "part_2", "enabled": true, "stageIndex": 0 },
    { "type": "decoupler", "col": 8, "row": 10, "id": "part_3", "stageIndex": 0 },
    { "type": "tank",      "col": 8, "row": 11, "id": "part_4" },
    { "type": "engine",    "col": 8, "row": 17, "id": "part_5", "enabled": true, "stageIndex": 1 }
  ],
  "stages": [
    { "index": 0, "label": "Stage 1", "partIds": ["part_2", "part_3"] },
    { "index": 1, "label": "Stage 2", "partIds": ["part_5"] }
  ],
  "dryMass": 1650,
  "fuelMass": 3600,
  "maxThrust": 300000,
  "isp": 300,
  "valid": true,
  "errors": []
}
```

---

## Migration from Old Designs

`migratePartsToCurrentGrid` in `builder.js` gets a new `v < 4` branch:

```js
if (v < 4) {
  // Assign stable IDs (parts had none before v4)
  result = result.map((p, i) => ({ ...p, id: `part_${i}` }));

  // Run auto-assignment to compute stageIndex for engines/decouplers
  result = autoAssignStages(result);

  // All engines default to enabled
  result = result.map(p => p.type === 'engine' ? { ...p, enabled: true } : p);

  // Build stages array from the assigned stageIndex values
  // (computeStagesFromParts() derives the stages[] array from part.stageIndex fields)
}
```

Designs loaded from `savedDesigns` in localStorage also go through this migration when loaded.

The `rocketDesign` key (the active design) likewise migrates when `Rocket.js` reads it — `Rocket.js` applies the same ID assignment and stage reconstruction so it doesn't crash on old saves.

---

## Files Touched

| File | Changes |
|---|---|
| `builder.html` | Add `#ctx-menu` div, staging panel section in sidebar, total ΔV stat row |
| `js/builder.js` | Context menu logic, per-engine enable/disable toggle, staging panel render, auto-assign algorithm, delta-V computation, `computeDesign()` and `updateStats()` updates, part ID counter, v4 migration |
| `js/Rocket.js` | Read `stages`, `ignitedEngineIds`, `activeStageIndex`; add `_checkSurfaceCollision()` per-part hitbox method; remove hardcoded `surfaceR`; update collision snap to penetration-push; update `_accel()` thrust calc; update `doStage()` for staged ignition; update `canStage()` |
| `js/main.js` | Update HUD stage display to `N/Total` format |
| `js/parts.js` | No changes |
| `js/constants.js` | No changes |

---

## Open Items Before Implementation

None — all design decisions resolved. Decisions made during planning:

| Question | Decision |
|---|---|
| Engine-to-stage assignment | Auto from position; user can trigger re-assign |
| Fuel scope for ΔV | Tanks in that stage's physical segment |
| Enable/disable vs staging | Two separate systems; disabled = never fires regardless of stage |
| Staging panel location | Right sidebar, below stats |
