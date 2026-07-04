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

// --- Toy-mode math (v2) ---

export const ENERGY_FULL = 12;          // m/s² of jolt → energy 1.0
const ENERGY_BASE_TAU = 0.5;            // s — baseline tracks gravity + steady tilt
const ENERGY_ATTACK_TAU = 0.08;         // s — fast rise
const ENERGY_RELEASE_TAU = 0.4;         // s — slow fall (survives gaps between floor bumps)

// Smoothed motion energy 0..1 from the magnitude of accelerationIncludingGravity.
// A slow baseline absorbs gravity and steady tilt; the rectified residual (jolts
// from pushing/shaking) is envelope-followed with fast attack, slow release.
export function createEnergyMeter() {
  let baseline = 9.81, energy = 0;
  return {
    update(magnitude, dt) {
      baseline += (magnitude - baseline) * Math.min(1, dt / ENERGY_BASE_TAU);
      const jolt = Math.abs(magnitude - baseline);
      const target = Math.min(1, jolt / ENERGY_FULL);
      const tau = target > energy ? ENERGY_ATTACK_TAU : ENERGY_RELEASE_TAU;
      energy += (target - energy) * Math.min(1, dt / tau);
      return energy;
    },
  };
}

// Engine intensity 0..1 from motion energy; never below the idle chug.
export function rpmFromEnergy(energy, idle = 0.15) {
  return clamp(idle + (1 - idle) * clamp(energy, 0, 1), 0, 1);
}

export const FACEDOWN_ON = -6;   // gravityZ below this → face-down
export const FACEDOWN_OFF = -3;  // and above this → face-up again (hysteresis)

// Hysteresis flip detector. gravityZ = accelerationIncludingGravity.z:
// ≈ +9.81 screen-up, ≈ -9.81 screen-down.
export function createFaceDownDetector() {
  let down = false;
  return {
    update(gravityZ) {
      if (!down && gravityZ < FACEDOWN_ON) down = true;
      else if (down && gravityZ > FACEDOWN_OFF) down = false;
      return down;
    },
  };
}
