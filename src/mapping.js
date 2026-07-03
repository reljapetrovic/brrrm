// Pure input-mapping math. No DOM, no Web APIs — everything here runs under `node --test`.

export const TILT_RANGE = 25;   // degrees of tilt for full throttle/steer
export const DEADZONE = 0.12;   // fraction of range ignored around neutral
export const SHAKE_THRESHOLD = 14; // m/s² deviation from gravity
export const SHAKE_COOLDOWN = 0.8; // seconds between shake events

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Deadzone + smoothstep: tiny grip wobble does nothing, full tilt still hits ±1.
function shape(v) {
  v = clamp(v, -1, 1);
  const a = Math.abs(v);
  if (a < DEADZONE) return 0;
  const t = (a - DEADZONE) / (1 - DEADZONE);
  return Math.sign(v) * t * t * (3 - 2 * t);
}

// Raw deviceorientation reading → normalized tilt relative to the neutral
// grip captured at START ENGINE. x = steer (gamma), y = throttle (beta).
export function tiltFromOrientation(beta, gamma, neutral) {
  return {
    x: shape((gamma - neutral.gamma) / TILT_RANGE),
    y: shape((beta - neutral.beta) / TILT_RANGE),
  };
}

// Engine intensity 0..1 from speed; never drops below the idle chug.
export function rpmFromSpeed(speed, maxSpeed, idle = 0.15) {
  return clamp(idle + (1 - idle) * Math.abs(speed) / maxSpeed, 0, 1);
}

// Feed acceleration magnitude every frame; returns true once per shake.
export function createShakeDetector() {
  let cooldown = 0;
  return {
    update(magnitude, dt) {
      cooldown = Math.max(0, cooldown - dt);
      if (cooldown === 0 && Math.abs(magnitude - 9.81) > SHAKE_THRESHOLD) {
        cooldown = SHAKE_COOLDOWN;
        return true;
      }
      return false;
    },
  };
}
