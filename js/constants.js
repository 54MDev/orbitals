export const G = 6.674e-11;

export const PLANET = {
  RADIUS: 6_000_000,         // meters (~Earth-sized)
  MASS: 5.972e24,            // kg
  ATMOSPHERE_ALTITUDE: 100_000,  // meters above surface
};

export const CAMERA = {
  MIN_LOG_ZOOM: Math.log(5e-6),   // zoomed way out
  MAX_LOG_ZOOM: Math.log(5e-2),   // close to surface
};

export const FIXED_DT = 1 / 60;  // seconds
