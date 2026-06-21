# Asset Guide — Orbitals

Reference for creating PNG sprites. Each asset has a recommended canvas size, aspect ratio, color palette (pulled from the procedural fallback code), and a description of the key visual elements to include.

All PNGs go in `assets/` at the project root. The engine loads them via `PART_IMGS` in `js/parts.js` and falls back to the procedural canvas drawing if the file is missing or not loaded yet — so you can add assets one at a time.

---

## Part Sizes (post-polish-vab)

| Part      | Grid cells (w × h) | Aspect ratio | Recommended PNG size |
|-----------|--------------------|--------------|----------------------|
| pod       | 2 × 2              | 1:1 (square) | 256 × 256 px         |
| tank      | 2 × 6              | 1:3 (tall)   | 256 × 768 px         |
| engine    | 2 × 2              | 1:1 (square) | 256 × 256 px         |
| decoupler | 2 × 1              | 2:1 (wide)   | 256 × 128 px         |

Save at the sizes above — the engine scales them to fit at runtime. Use PNG-24 with transparency where noted.

---

## pod.png — Command Pod

**File:** `assets/pod.png`  
**Size:** 256 × 256 px  
**Shape:** Roughly square — nose cone on top, cylindrical body below.

### Layout (top to bottom)
- **Top ~35%** — pointed nose cone. Triangular, slightly rounded tip. Centered horizontally.
- **Bottom ~65%** — rectangular/cylindrical body that fills the width.

### Visual elements
- One circular porthole/window near vertical center of the body. Slightly cyan tinted, with a thin bright rim.
- Subtle vertical highlight stripe on the left edge of the body (glass/metal sheen, ~30% width, low opacity).
- Thin border/outline around the body section (faint, ~30% opacity).

### Colors
| Element         | Value              |
|-----------------|--------------------|
| Body            | `#7aaae8`          |
| Nose cone       | `#9dc4ff`          |
| Window fill     | `rgba(0,200,255,0.5)` |
| Window rim      | `rgba(180,230,255,0.55)` |
| Highlight strip | `rgba(180,220,255,0.1)` |
| Body outline    | `rgba(140,195,255,0.28)` |
| Background      | Transparent        |

### Style notes
- Sci-fi / minimalist. Clean edges, no excessive detail.
- The nose cone should visually narrow to a point at the very top center.
- No landing legs, no RCS thrusters — keep it simple.

---

## tank.png — Fuel Tank

**File:** `assets/tank.png`  
**Size:** 256 × 768 px (tall — 1:3 ratio)  
**Shape:** Tall rectangle. Fills edge-to-edge horizontally (no inset padding — this is the whole point of the polish).

### Layout
- Solid rectangular body from top edge to bottom edge, full width.
- 2–3 horizontal band lines dividing the tank into sections (purely decorative, no functional meaning).
- Subtle vertical highlight on the left third.

### Colors
| Element         | Value              |
|-----------------|--------------------|
| Body            | `#2d5a80`          |
| Highlight strip | `rgba(100,180,255,0.1)` |
| Band lines      | `rgba(80,160,220,0.2)`  |
| Outline         | `rgba(70,155,215,0.32)` |
| Background      | Transparent        |

### Style notes
- Edges flush to the PNG boundary — no margin/padding on any side.
- Industrial, utilitarian look. The bands suggest internal baffles or weld seams.
- Can add a very faint cylindrical shading (slightly lighter center column) to hint at a round cross-section.

---

## engine.png — Rocket Engine

**File:** `assets/engine.png`  
**Size:** 256 × 256 px  
**Shape:** Square. Wide mounting section on top, bell nozzle flaring outward toward the bottom.

### Layout (top to bottom)
- **Top ~50%** — trapezoidal engine mount/combustion chamber. Wider at the top, narrows toward the middle. Spans roughly 72% of total width at the top.
- **Bottom ~50%** — bell nozzle. Starts narrow at the center (throat), flares back out to ~72% width at the bottom edge.
- **Throat** — a dark oval/notch at the midpoint where the two sections meet, roughly 26% of total width.

### Colors
| Element           | Value       |
|-------------------|-------------|
| Upper section     | `#507060`   |
| Bell nozzle       | `#3e5848`   |
| Throat (interior) | `#18241e`   |
| Background        | Transparent |

### Style notes
- The overall silhouette looks like an hourglass or a bell — wide top, narrow waist, wide bottom.
- No fins or mounting hardware needed.
- The dark throat gives a sense of depth into the combustion chamber.
- Can add a faint metallic sheen or heat-discoloration gradient on the bell (slightly lighter near the throat, slightly darker at the exit).

---

## decoupler.png — Stage Decoupler

**File:** `assets/decoupler.png`  
**Size:** 256 × 128 px (wide — 2:1 ratio)  
**Shape:** Wide, short band. Fills the entire bounding box edge-to-edge.

### Layout
- Solid rectangular band filling 100% width and 100% height. No vertical centering offset — full bleed.
- Diagonal hazard stripes across the entire surface (like construction tape / separation ring markings).

### Visual elements
- **Base color band** — fills the whole PNG.
- **Diagonal stripe overlay** — dark semi-transparent diagonal lines at ~45°, spaced ~9px apart (at 256px wide, scale this up proportionally — roughly every 36px). Lines go bottom-left to top-right.
- **Thin bright outline** around the full perimeter.

### Colors
| Element         | Value                     |
|-----------------|---------------------------|
| Base fill       | `#a88028`                 |
| Stripe lines    | `rgba(0,0,0,0.32)`        |
| Outline         | `rgba(255,195,45,0.5)`    |
| Background      | Transparent (outside rect) |

### Style notes
- Amber/gold tone — visually distinct from the blue tanks and green engines so it's easy to spot in a stack.
- The diagonal stripes are a classic "explosive bolt / separation ring" motif. Keep them simple — just dark diagonal lines, no other markings.
- At only 128px tall, keep detail minimal. The stripes and color are the whole read.

---

## Adding More Assets

When new parts are added (fins, nose cones, RCS thrusters, etc.):

1. Add the part definition to `js/parts.js` (`PART_DEFS` and `DRAW_FNS`)
2. Add the image load entry at the top of `js/parts.js` (`PART_IMGS`)
3. Add an entry here in `asset-guide.md` with size, aspect ratio, color palette, and layout description

The procedural fallback in each `draw*` function means the part works in-game before the PNG is ready — draw the PNG whenever you're happy with the procedural version as a reference.
