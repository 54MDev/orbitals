# Builder Design — Orbitals VAB

Reference for extending the vehicle assembly builder. Read this before adding new part types, new screens, or new builder features.

---

## Files

| File | Role |
|---|---|
| `builder.html` | Builder page — sidebar (HTML/CSS) + grid canvas |
| `js/builder.js` | All builder logic: grid, placement, part drawing, stats, input |

The builder is a completely separate page from the flight sim (`index.html` / `js/main.js`). They share nothing at runtime — data passes between them via `localStorage`.

---

## Data Model

### Placed part
```js
{ type: 'pod' | 'tank' | 'engine' | 'decoupler', col: Number, row: Number }
```
`col` / `row` are the top-left grid cell of the part. The grid is `COLS=9` wide by `ROWS=16` tall.

### Part definition (`PART_DEFS` in `builder.js`)
```js
{
  w:        Number,   // width in grid cells (currently always 1)
  h:        Number,   // height in grid cells
  dryMass:  Number,   // kg
  fuelMass: Number,   // kg (omit or 0 if part carries no fuel)
  thrust:   Number,   // N  (omit or 0 if part produces no thrust)
  isp:      Number,   // seconds (include when thrust is set)
}
```

### Current parts

| Key | w×h | Dry mass | Fuel | Thrust |
|---|---|---|---|---|
| `pod` | 1×2 | 800 kg | — | — |
| `tank` | 1×3 | 200 kg | 1 800 kg | — |
| `engine` | 1×2 | 300 kg | — | 150 kN, Isp 300 s |
| `decoupler` | 1×1 | 50 kg | — | — |

---

## Adding a New Part Type

Three steps, all in `js/builder.js`:

### 1. Add an entry to `PART_DEFS`
```js
const PART_DEFS = {
  // ... existing parts ...
  srb: {
    w: 1, h: 4,
    dryMass:  500,
    fuelMass: 4_000,
    thrust:   200_000,
    isp:      250,
  },
};
```

### 2. Write a draw function
The signature is always:
```js
function drawSrb(ctx, px, py, cw, ch, alpha) { ... }
```
- `px`, `py` — top-left pixel of the part's bounding box on the canvas
- `cw`, `ch` — pixel width and height (`def.w * cellSize()` and `def.h * cellSize()`)
- `alpha` — 0–1; use `ctx.save() / ctx.globalAlpha = alpha / ctx.restore()` wrapper

Register it in the `DRAW_FNS` map:
```js
const DRAW_FNS = {
  pod, tank, engine, decoupler,
  srb: drawSrb,   // ← add here
};
```

### 3. Add a button in `builder.html`
```html
<button class="part-btn" data-part="srb" style="--part-color:#e06030">
  Solid Rocket Booster
  <span class="part-sub">4 000 kg fuel · 200 kN</span>
</button>
```
The `data-part` value must match the key in `PART_DEFS`. The `--part-color` CSS variable sets the selected left-border color.

That's it — stats, validation, ghost preview, and placement all pick up the new part automatically.

---

## Grid System

```
Origin (0,0) is top-left of the grid.
+Y is down (screen space).
The grid is centered in the canvas area each frame.
```

Key functions:
- `cellSize()` — computed from canvas dimensions; never hardcoded
- `gridOrigin()` → `{ x, y }` — top-left pixel of the grid
- `screenToCell(sx, sy)` → `{ col, row }` — mouse pos to grid cell
- `canPlace(type, col, row)` — checks bounds + collision
- `occupiedCells(part)` — all cells a placed part covers

---

## Stats & Validation

`updateStats()` iterates `placedParts`, sums `dryMass`, `fuelMass`, `thrust`, and computes:
- **TWR** = `thrust / (totalMass × 9.81)` at full fuel
- **Validation** — requires at least one `pod`, one `engine`, and one part with `fuelMass > 0`

Validation lives entirely in `updateStats()` — no separate validator needed for simple rules.

---

## localStorage Contract (Phase 6b)

When the builder hands off to the flight screen it will write:

```js
localStorage.setItem('rocketDesign', JSON.stringify({
  parts: placedParts,   // array of { type, col, row }
  stats: {
    dryMass, fuelMass, thrust, isp,
  },
}));
```

The flight screen reads this key on load and constructs the `Rocket` with derived values instead of the constants in `js/constants.js`.

---

## Planned Extensions (later phases)

- **Phase 6b** — Launch button: validate, serialize to localStorage, redirect to `index.html`; "Back to Builder" button in the flight screen
- **Phase 6c** — Named saves: `localStorage.setItem('rocketSave_<name>', ...)`, list in sidebar
- **Future** — Part variants (small/large tank), radial attachments (w > 1), drag-and-drop reorder, custom Isp/thrust sliders
