# VAB Polish — Part Sizing & Grid Flush

## Goals

1. Fuel tanks drawn flush with grid (no horizontal inset)
2. Pod → 1 coarse grid space (2×2 fine cells)
3. Engine → 1 coarse grid space (2×2 fine cells)
4. Decoupler → half a coarse grid space (2×1 fine cells)

---

## Current State

Parts are measured in **fine grid cells** (the faint lines, 18×32 grid).  
**Coarse grid lines** appear every 2 cells — a "grid space" visually = 2×2 fine cells.

| Part      | Current size (w×h fine cells) |
|-----------|-------------------------------|
| pod       | 2 × 4                         |
| tank      | 2 × 6 (drawn with ~12% horizontal inset each side) |
| engine    | 2 × 4                         |
| decoupler | 2 × 2                         |

---

## Target Sizes

| Part      | New size (w×h fine cells) | Notes |
|-----------|---------------------------|-------|
| pod       | 2 × 2                     | 1×1 coarse grid space |
| tank      | 2 × 6                     | unchanged height; drawing fix only |
| engine    | 2 × 2                     | 1×1 coarse grid space |
| decoupler | 2 × 1                     | half a coarse grid space |

---

## Changes Required

### 1. `js/parts.js` — PART_DEFS

```js
pod:       { w: 2, h: 2, ... }   // was h: 4
engine:    { w: 2, h: 2, ... }   // was h: 4
decoupler: { w: 2, h: 1, ... }   // was h: 2
// tank: no change to w/h
```

### 2. `js/parts.js` — drawTank

Remove the horizontal inset pad that shrinks the tank body away from cell edges:

```js
// Remove this:
const pad = cw * 0.12;
const tx  = px + pad, tw = cw - pad * 2;

// Replace with:
const tx = px, tw = cw;
```

Also remove the `py + 1` / `ch - 2` vertical insets if present — fill the full bounding box edge-to-edge.

The band/stripe decoration inside the tank can stay; just remove the outer margin.

### 3. Grid system — no structural overhaul needed

Fine-cell snapping already handles arbitrary integer heights.  
A stack of pod(2h) + tank(6h) + decoupler(1h) + engine(2h) = 11 fine cells — all integer boundaries, no fractional positions. Placement and collision detection are unchanged.

### 4. `js/builder.js` — GRID_VERSION bump + migration

Part heights changed, so saved designs will be geometrically wrong (parts no longer overlap the right cells).

- Bump `GRID_VERSION` from `2` → `3`
- Add a migration branch in `migratePartsToCurrentGrid`:
  - Decoupler rows: old designs had decoupler at even rows (aligned to coarse grid). Positions can stay; the part is just shorter now so it won't cover cells it used to.
  - Pod/engine: same — row positions are fine, parts are just half as tall.
  - **No position remapping needed**, but stacked designs may now have gaps between parts. Acceptable — user re-places if needed, or we could tighten the stack by subtracting the height difference per part below.

Simplest safe approach: bump version, skip remapping, add a UI note "Old designs may have gaps — re-stack parts if needed."

---

## Stacking Implications

A typical stock rocket before and after:

```
Before (fine cells):       After:
─ pod       (rows 0–3)     ─ pod       (rows 0–1)
─ tank      (rows 4–9)     ─ tank      (rows 2–7)
─ decoupler (rows 10–11)   ─ decoupler (row 8)
─ engine    (rows 12–15)   ─ engine    (rows 9–10)
```

Total height: 16 → 11 fine cells. Rockets will appear more compact in the VAB and in-flight (since `ROCKET.LENGTH` maps to total grid height in `Rocket.draw()`).

**Action item:** After this change, review whether `ROCKET.LENGTH` or the grid-height scaling in `Rocket.draw()` needs adjustment so rockets don't render too small in-flight.

---

## Out of Scope for This Pass

- Adding a connectivity/adjacency validator (parts must actually touch)
- Sub-cell (fractional) grid positions
- New part types
- Visual art updates to pod/engine sprites for the new aspect ratio
