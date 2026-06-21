export const G = 6.674e-11;

export const PLANET = {
  RADIUS: 6_000_000,         // meters (~Earth-sized)
  MASS: 5.972e24,            // kg
  ATMOSPHERE_ALTITUDE: 100_000,  // meters above surface
};

export const CAMERA = {
  MIN_LOG_ZOOM: Math.log(5e-6),   // zoomed way out
  MAX_LOG_ZOOM: Math.log(5e-1),   // close to surface
  VELOCITY_ARROW_MIN_ROCKET_PX: 15,   // hide velocity arrow when rocket on-screen length < this
  VELOCITY_ARROW_OFFSET_PX: 50,       // screen-px gap between hull edge and arrow base
  VELOCITY_ARROW_MAX_PX: 100,         // max arrow screen length
  VELOCITY_ARROW_SPEED_MAX: 10_000,   // m/s at which arrow reaches max length
  VELOCITY_ARROW_MIN_PX: 20,          // min arrow screen length when speed > 0
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
