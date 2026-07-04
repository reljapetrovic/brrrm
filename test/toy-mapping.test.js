import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEnergyMeter, rpmFromEnergy, createFaceDownDetector } from '../src/mapping.js';

const DT = 1 / 60;

// The energy meter is fed the accelerationIncludingGravity VECTOR (ax, ay, az).
// Held level and still, gravity is all on z ≈ 9.81. Moving the phone through space
// adds a linear-acceleration vector on top; the meter must see that motion.

test('energy stays near zero when the phone is still (held level)', () => {
  const m = createEnergyMeter();
  let e = 0;
  for (let i = 0; i < 180; i++) e = m.update(0, 0, 9.81, DT);
  assert.ok(e < 0.02, `still energy ${e} should be ~0`);
});

test('a gentle horizontal push through space registers (regression: was deaf to translation)', () => {
  // Phone held level (gravity on z), pushed back-and-forth horizontally on x at a
  // GENTLE 2 m/s². The old magnitude-based meter peaked ~0.01 here — invisible.
  const m = createEnergyMeter();
  let peak = 0;
  for (let i = 0; i < 180; i++) {
    const aH = 2 * Math.sin(i * 0.35);
    peak = Math.max(peak, m.update(aH, 0, 9.81, DT));
  }
  assert.ok(peak > 0.3, `gentle horizontal push peaked at ${peak}, expected > 0.3 (should clearly drive)`);
});

test('a static tilt (held at an angle, not moving) does NOT rev the engine', () => {
  // Constant acceleration vector = held still at a tilt. The baseline tracks it,
  // so the residual (motion) is ~0. Prevents false revving from just holding tilted.
  const m = createEnergyMeter();
  let e = 0;
  for (let i = 0; i < 180; i++) e = m.update(4.9, 0, 8.5, DT); // ~30° tilt, unmoving
  assert.ok(e < 0.05, `static tilt should not rev, got ${e}`);
});

test('energy stays within 0..1 under vigorous motion', () => {
  const m = createEnergyMeter();
  for (let i = 0; i < 180; i++) {
    const e = m.update(15 * Math.sin(i), 0, 9.81, DT);
    assert.ok(e >= 0 && e <= 1, `energy ${e} out of range`);
  }
});

test('energy releases slowly, not instantly', () => {
  const m = createEnergyMeter();
  let e = 0;
  for (let i = 0; i < 60; i++) e = m.update(i % 2 ? 0 : 5, 0, 9.81, DT); // build via horizontal push
  const built = e;
  for (let i = 0; i < 6; i++) e = m.update(0, 0, 9.81, DT); // 0.1 s of stillness
  assert.ok(e > built * 0.4, `after 0.1s still, energy ${e} collapsed from ${built}`);
  for (let i = 0; i < 90; i++) e = m.update(0, 0, 9.81, DT); // 1.5 s more
  assert.ok(e < 0.1, `after settling, energy ${e} should be low`);
});

test('rpmFromEnergy floors at idle and tops at 1', () => {
  assert.equal(rpmFromEnergy(0), 0.15);
  assert.equal(rpmFromEnergy(1), 1);
  assert.equal(rpmFromEnergy(2), 1);     // clamps high
  assert.equal(rpmFromEnergy(-1), 0.15); // clamps low to idle floor
});

test('face-down detector flips with hysteresis', () => {
  const d = createFaceDownDetector();
  assert.equal(d.update(9.81), false);   // face up
  assert.equal(d.update(-9.81), true);   // flipped down
  assert.equal(d.update(-4), true);      // still down inside hysteresis band
  assert.equal(d.update(-2), false);     // back up past the off threshold
  for (let i = 0; i < 20; i++) assert.equal(d.update(0.2 * (i % 2 ? 1 : -1)), false); // noise near 0 doesn't toggle
});
