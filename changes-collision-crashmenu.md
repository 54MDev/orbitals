# Changes — Per-Part Collision Hitbox & Crash Menu

Working-tree changes on top of commit `a490a84` ("staging update"). Two independent
features. Files touched: `index.html`, `js/Rocket.js`, `js/Stage.js`, `js/main.js`.

This is **Phase 5** of `stagingupdate.md` (dynamic hitbox), plus a usability addition
(crash menu) that wasn't in the original plan.

---

## 1. Per-Part Surface Collision (Feature C / Phase 5)

Replaces the old single-radius check — `r <= PLANET.RADIUS + ROCKET.LENGTH/2` — with a
per-part rectangle test. The hitbox now matches the actual geometry of whatever parts
remain after staging, and is correct at any orientation.

### `Rocket._checkSurfaceCollision()` — `js/Rocket.js`

New method, no side effects. Returns `{ hit, penetration }`.

- **Fallback:** if there's no builder design (`activeParts` empty → plain triangle), it
  keeps the old single-radius check.
- **Otherwise:** works in the rocket's local part frame (the same frame `draw()` lays
  parts out in: +X right, +Y down, `cellScaleWorld = ROCKET.LENGTH / this._fullGridH`
  metres per grid cell).
  1. Builds the active-parts bounding box in metres (identical to `draw()`), giving
     `halfW` / `halfH`.
  2. Transforms the planet centre (world origin) into the local part frame. This mirrors
     the inverse transform in `partAtScreenPos`: screen flips world +Y, then un-rotate by
     `this.rotation`:
     ```js
     planetLx =  dx*cosR - dy*sinR;
     planetLy = -dx*sinR - dy*cosR;   // note the leading minus — Y is mirrored
     ```
  3. For each part, computes the closest point on its axis-aligned rectangle to the
     planet centre. If that point is within `PLANET.RADIUS`, it's a hit; tracks the
     deepest penetration (`PLANET.RADIUS - dist`).

Rotation preserves distances, so testing each part as an axis-aligned rect in the local
frame is exact.

### Collision response — `js/Rocket.js` (in the integrator)

The old code snapped the centre to `surfaceR` along the radius. New code reads `speed`
*before* zeroing velocity, then pushes the centre outward along the radial normal by the
deepest penetration:
```js
this.x += nx * col.penetration;
this.y += ny * col.penetration;
```
State is still `crashed` if `speed > ROCKET.CRASH_SPEED`, else `landed`.

The rails-transition altitude calc was updated to recompute `Math.hypot(this.x, this.y)`
(the old local `r` no longer exists at that point).

### `Stage._checkSurfaceCollision()` — `js/Stage.js`

Same algorithm, simplified (returns a bare boolean — dropped stages don't need
penetration depth, they're just `destroyed` on contact). Uses `this.originalGridH`
instead of `_fullGridH` to keep part sizes consistent after decoupling. Replaces the old
`Math.hypot(this.x, this.y) <= PLANET.RADIUS` check in `step()`.

---

## 2. Crash Menu — `index.html` + `js/main.js`

Replaces the static "CRASHED — reload to retry" HUD text with an interactive overlay so
the player can restart without reloading the page.

### `index.html`

- New `#crash-menu` DOM element (hidden by default, `display:none`): a centered modal
  with a "CRASHED" title, a `RELAUNCH` button, and a `GO TO VAB` link
  (`<a href="builder.html">`).
- Associated CSS (red-bordered panel, blue hover buttons).

### `js/main.js`

- `const rocket = new Rocket()` → **`let rocket`** so it can be reassigned on relaunch.
- `drawHUD()` no longer draws the crash text; instead it toggles the menu each frame:
  `crashMenu.style.display = rocket.state === 'crashed' ? 'flex' : 'none'`.
- New `relaunch()` function (wired to the `#crash-relaunch` button):
  - `rocket = new Rocket()` (re-reads the saved design), `camera.target = rocket`
  - clears `droppedStages`
  - resets `timeWarp = 1`, `warpTarget = null`
  - exits map view if active (restores `_mapSavedLogZoom`)
  - `camera.rotation = 0`, `hideContextMenu()`
- "GO TO VAB" is a plain anchor — the VAB's LAUNCH button returns to `index.html`.

---

## Notes for future agents

- `_checkSurfaceCollision` is duplicated (not shared) between `Rocket` and `Stage` because
  the two classes track grid height differently (`_fullGridH` vs `originalGridH`) and need
  different return shapes. Keep them in sync if you change the collision math.
- The local-frame transform must match `partAtScreenPos` / `draw()`. If you change the
  rocket part-layout convention, update all three.
- `relaunch()` does **not** reload the page, so any module-level state you add that should
  reset on death must be reset there too.
