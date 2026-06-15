# MVP Roadmap — Orbitals

Each phase builds on the last. Nothing in a later phase should be started until the current phase is stable and testable.

---

## Phase 1: Canvas Foundation & World Setup

- **Set up the HTML5 Canvas and game loop**
  - By creating an `index.html` with a fullscreen canvas element
  - By writing a `GameLoop` class that runs `requestAnimationFrame` with a fixed delta time
  - By setting up a basic coordinate system (world space vs screen space) with a camera object

- **Render the planet**
  - By drawing a filled circle representing the Earth analog at the world origin
  - By adding an atmosphere gradient ring at the defined upper atmosphere altitude
  - By scaling world units (meters) to screen pixels via a zoom factor

- **Set up the camera**
  - By implementing a camera that tracks a target position (initially fixed, later follows the rocket)
  - By adding scroll-wheel zoom with logarithmic scaling so the view works from surface to orbit

---

## Phase 2: Rocket Object & Basic Physics

- **Create the rocket object**
  - By defining a `Rocket` class with position, velocity, mass, rotation, thrust, and fuel properties
  - By rendering the rocket as a simple triangle or rectangle on the canvas
  - By placing the rocket on the planet surface at launch position

- **Implement Newtonian gravity**
  - By writing a gravity function that computes `F = G * M * m / r²` each frame
  - By applying the resulting acceleration as a velocity delta using Velocity Verlet integration
  - By verifying the rocket falls correctly toward the planet surface when dropped with no thrust

- **Add thrust and rotation controls**
  - By wiring keyboard inputs (WASD / arrows) to rotation delta and throttle value
  - By computing the thrust vector from rotation angle and throttle level
  - By reducing fuel mass each frame proportional to thrust output (using engine Isp)

- **Add surface collision**
  - By checking rocket altitude against planet radius each frame
  - By stopping physics and displaying a "landed" or "crashed" state on contact

---

## Phase 3: Orbital Mechanics — Active Mode

- **Verify orbital insertion is possible**
  - By launching the rocket, burning prograde, and confirming a stable circular orbit can be achieved with correct physics
  - By logging velocity and altitude each frame to confirm values match expected orbital math

- **Implement atmospheric drag**
  - By defining an atmosphere boundary altitude
  - By applying a drag force proportional to velocity squared and air density (which decreases exponentially with altitude)
  - By confirming low orbits decay and high orbits are stable

---

## Phase 4: Keplerian Rails

- **Extract orbital elements from state vector**
  - By writing a `stateToOrbitalElements(position, velocity, μ)` function that returns semi-major axis, eccentricity, argument of periapsis, and true anomaly
  - By unit-testing this function against known orbit scenarios (circular orbit, elliptical orbit)

- **Implement rails mode**
  - By writing a `positionFromOrbitalElements(elements, t)` function using Kepler's equation to compute position at any time analytically
  - By switching the rocket from active physics to rails the moment engines cut off and orbit clears the atmosphere
  - By computing rocket position each frame from the Keplerian formula instead of integrating forces

- **Implement rails exit**
  - By detecting thrust input while on rails and immediately converting the current analytical position + velocity back to a state vector
  - By resuming Newtonian integration from that state vector

---

## Phase 5: Trajectory Predictor

- **Draw the orbit ellipse**
  - By taking the current orbital elements and drawing the full Keplerian ellipse on the canvas in map view
  - By transforming the ellipse from world space to screen space using the camera

- **Add periapsis and apoapsis markers**
  - By computing Pe and Ap from semi-major axis and eccentricity
  - By rendering labeled markers at those points on the ellipse

- **Active-mode trajectory preview**
  - By forward-integrating the current state vector N steps (using the same gravity + drag math) each frame when thrusting
  - By drawing the resulting path as a dashed line
  - By updating the preview in real time as thrust direction changes

---

## Phase 6: Staging & Multi-Stage Rockets

- **Implement the staging system**
  - By defining the rocket as an ordered list of stages, each containing parts
  - By activating the next stage on Space key press
  - By detaching the current stage as an independent physics object when the decoupler fires
  - By switching engine and fuel references to the next active stage

- **Dropped stage physics**
  - By giving dropped stages their own position, velocity (inherited at separation), and gravity simulation
  - By rendering dropped stages until they re-enter the atmosphere or leave the viewport

---

## Phase 7: Grid-Based Rocket Builder

- **Build the parts palette and grid UI**
  - By rendering a side-panel with available parts (pod, tank, engine, decoupler)
  - By drawing a snap grid in the build area
  - By allowing drag-and-drop placement of parts onto the grid

- **Part stacking and validation**
  - By enforcing vertical stacking rules (engine at bottom, pod at top)
  - By computing total mass, total fuel, and stage order from the assembled configuration
  - By blocking launch if the rocket fails validation (no pod, no engine, no fuel)

- **Save and load rocket designs**
  - By serializing the assembled part list to JSON and writing it to localStorage
  - By loading saved designs back into the builder on page load

---

## Phase 8: Polish & MVP Wrap-Up

- **Map view toggle**
  - By implementing a zoom-out view (M key) that shows the planet, full orbit ellipse, and rocket position simultaneously

- **HUD / flight data display**
  - By rendering a minimal HUD overlay showing altitude, velocity, apoapsis, periapsis, and fuel remaining

- **SAS (stability assist)**
  - By implementing a simple auto-rotation that holds the rocket's current heading when SAS is on (T key)

- **Basic audio (optional)**
  - By adding Web Audio API sound effects for engine ignition, staging, and ambient space silence

---

## Post-MVP (Not Scheduled)

- Firebase / Supabase accounts and cloud saves
- Multiple planets and gravity assists
- Atmospheric heating and reentry effects
- Docking system
- Multiplayer (design TBD)