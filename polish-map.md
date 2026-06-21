# Polish & Map Screen Changes

## 1. Flight Screen — Remove Trajectory Line

Remove the dashed trajectory prediction line from the main flight view (`index.html`). The `Trajectory.js` draw call should be suppressed during normal flight. The trajectory system itself stays intact — it moves to the map screen.

---

## 2. Flight Screen — Add Velocity Arrow

Replace the trajectory line with a velocity arrow drawn directly on the rocket.

- Logically originates from the **center of the rocket**, but the visible arrow starts at the **outermost point of the rocket hull in the velocity direction**, plus a **~50px screen-space offset** so it never clips into geometry — a taller rocket pushes the arrow further out. The bounding box (`halfH`, `halfW`) is already computed each frame in `Rocket.draw()` from the active parts grid, so the offset can be derived directly from that
- Points in the **direction of the current velocity vector**
- Arrow length: **clamped linear** — scales proportionally with speed up to a tunable max screen length
- Color: **white**
- Shown in **all flight states** — powered flight and rails both
- **Disappears when zoomed out** past the point where the rocket is no longer clearly visible (zoom threshold TBD during implementation)

---

## 3. Map Screen — Trajectory Line

The trajectory prediction line (currently in the flight screen) moves to the map screen (`M` key).

- Same forward-integration logic from `Trajectory.js`
- Displayed on the map at all times (flight and rails)
- Orbit ellipse (rails mode) also shown on the map

---

## 4. Map Screen — Free Look Camera

The map screen gets its own independent camera, decoupled from the flight camera.

- **Zoom**: scroll wheel zooms in/out freely, not tied to the rocket's position
- **Pan**: click and drag to pan anywhere in the world
- Starting view centers on the current scene (rocket + planet visible)
- Zoom range should be wide enough to see the full orbit and zoom into surface detail

---

## 5. Map Screen — Camera Lock

Clicking on an object in the map view locks the camera to follow that object.

Objects that can be locked onto:
- Rocket
- Planet / Earth
- (Future: other bodies)

Behavior:
- Map **opens locked to the rocket** by default
- **Right-clicking** a locked object shows a context menu with "Unlock"
- **Clicking on an object** (rocket or planet) while unlocked shows a context menu with "Lock View"
- **Clicking and dragging to pan breaks the lock** and returns to free look

---

## 6. Builder — Finer Grid Resolution

The current builder grid is 9 × 16 cells. Cell size is derived from canvas dimensions (`Math.min(canvas.width * 0.88 / COLS, canvas.height * 0.88 / ROWS)`), so at a typical window size each cell is ~50 px — snapping feels coarse.

Goal: double (or more) the grid resolution so placement is visually precise, while keeping the same logical part sizes.

Approach:
- Increase `COLS` and `ROWS` by a multiplier (e.g. ×2 → 18 × 32, or ×3 → 27 × 48)
- Scale every part's `w` and `h` in `PART_DEFS` by the same multiplier so their physical footprint is unchanged
- `cellSize()` formula stays the same — cells are now smaller, snapping is finer
- All `occupiedCells`, `canPlace`, save/load logic is grid-coordinate-based and should continue to work unchanged
- Choose a multiplier that keeps cells at least 12–15 px at default zoom (avoids blur; plays nicely with zoom below)
- Part definitions need a migration path if old designs are stored in localStorage with old grid coords — either a version field or a conversion on load

---

## 7. Builder — Zoom

Add scroll-wheel zoom to the builder canvas so you can zoom into a specific region when placing fine parts, and zoom out to see the full rocket.

Behavior:
- **Scroll wheel** zooms in/out, centered on the cursor position (zoom-to-pointer)
- Zoom scales the effective `cellSize` — cells get larger as you zoom in, smaller as you zoom out
- **Min zoom**: whole grid fits in the canvas (same as current default behavior — no clipping)
- **Max zoom**: cells no larger than ~80–100 px (prevents cells from becoming comically large)
- **Pan**: when zoomed in, click-and-drag on empty grid space pans the view; dragging onto a part still places/removes
- Grid lines, hover ghost, and part rendering all derive from the same zoom-scaled `cellSize`, so no separate render path is needed
- Zoom level resets to fit-all when the builder page loads
