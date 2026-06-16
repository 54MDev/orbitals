export const G = 6.674e-11;

export const PLANET = {
  RADIUS: 6_000_000,         // meters (~Earth-sized)
  MASS: 5.972e24,            // kg
  ATMOSPHERE_ALTITUDE: 100_000,  // meters above surface
};

export const CAMERA = {
  MIN_LOG_ZOOM: Math.log(5e-6),   // zoomed way out
  MAX_LOG_ZOOM: Math.log(5e-1),   // close to surface
};

export const FIXED_DT = 1 / 60;  // seconds

export const ROCKET = {
  DRY_MASS: 1_000,        // kg
  FUEL_MASS: 9_000,       // kg
  MAX_THRUST: 150_000,    // N  (TWR ~1.35 at launch)
  ISP: 300,               // seconds
  ROTATION_SPEED: 1.5,    // rad/s
  CRASH_SPEED: 50,        // m/s — max safe landing speed
  LENGTH: 1_000,          // meters (game scale — visible at surface zoom)
  WIDTH: 350,             // meters
};

export const PHYSICS_BUBBLE_RADIUS = 5_000; // m — dropped stages within this range exit rails
