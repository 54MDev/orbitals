import { G, PLANET } from './constants.js';

const MU = G * PLANET.MASS;

// Convert Cartesian state vector to Keplerian orbital elements.
// Returns null if orbit is hyperbolic, radial, or degenerate.
export function stateToElements(x, y, vx, vy, simTime) {
  const r = Math.hypot(x, y);
  const v2 = vx*vx + vy*vy;
  const h = x*vy - y*vx;  // signed angular momentum (z-component)

  if (Math.abs(h) < 1) return null;  // radial / degenerate trajectory

  const energy = v2/2 - MU/r;
  if (energy >= 0) return null;  // hyperbolic or parabolic escape

  const a = -MU / (2*energy);

  // Eccentricity vector via e = (v × h)/μ − r̂
  const ex = vy*h/MU - x/r;
  const ey = -vx*h/MU - y/r;
  const e = Math.hypot(ex, ey);

  const omega = e < 1e-8 ? 0 : Math.atan2(ey, ex);

  // True anomaly: cos(ν) from dot product, sin(ν) from cross product (sign flipped for retrograde)
  let nu;
  if (e < 1e-8) {
    // Circular — ω=0, so ν equals the actual position angle in the direction of motion
    const theta = Math.atan2(y, x);
    nu = h >= 0 ? theta : -theta;
  } else {
    const cosNu = Math.max(-1, Math.min(1, (ex*x + ey*y) / (e*r)));
    const sinNu = (ex*y - ey*x) / (e*r) * Math.sign(h);
    nu = Math.atan2(sinNu, cosNu);
  }
  nu = ((nu % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI);

  // True anomaly → eccentric anomaly → mean anomaly
  const E = 2 * Math.atan2(Math.sqrt(1-e) * Math.sin(nu/2), Math.sqrt(1+e) * Math.cos(nu/2));
  const M0 = E - e * Math.sin(E);
  const n = Math.sqrt(MU / (a*a*a));

  return { a, e, omega, M0, n, prograde: Math.sign(h), t_epoch: simTime };
}

// Reconstruct Cartesian state vector from orbital elements at simulation time t.
export function elementsToState(els, simTime) {
  const { a, e, omega, M0, n, prograde, t_epoch } = els;
  const p = a * (1 - e*e);

  // Mean anomaly at current time, normalised to [0, 2π)
  let M = M0 + n * (simTime - t_epoch);
  M = ((M % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI);

  // Kepler's equation  M = E − e·sin E,  solved by Newton–Raphson
  let E = M;
  for (let i = 0; i < 50; i++) {
    const dE = (M - E + e*Math.sin(E)) / (1 - e*Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-12) break;
  }

  // True anomaly from eccentric anomaly
  const nu = 2 * Math.atan2(Math.sqrt(1+e) * Math.sin(E/2), Math.sqrt(1-e) * Math.cos(E/2));
  const nuN = ((nu % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI);

  const r    = p / (1 + e * Math.cos(nuN));
  const theta = omega + prograde * nuN;  // actual angle from +x axis

  const x = r * Math.cos(theta);
  const y = r * Math.sin(theta);

  // Velocity: decompose into radial (outward) and tangential (CCW)
  // v_r = |h|·e·sin(ν)/p,  v_θ = h·(1+e·cos(ν))/p  (CCW positive)
  const hMag = Math.sqrt(MU * p);
  const h    = prograde * hMag;
  const vr   = hMag * e * Math.sin(nuN) / p;
  const vt   = h * (1 + e * Math.cos(nuN)) / p;

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const vx = vr * cosT - vt * sinT;
  const vy = vr * sinT + vt * cosT;

  return { x, y, vx, vy };
}
