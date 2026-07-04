import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEnergyMeter, rpmFromEnergy, createFaceDownDetector, ENERGY_FULL } from '../src/mapping.js';

const DT = 1 / 60;

test('energy stays near zero when the phone is still', () => {
  const m = createEnergyMeter();
  let e = 0;
  for (let i = 0; i < 180; i++) e = m.update(9.81, DT);
  assert.ok(e < 0.02, `still energy ${e} should be ~0`);
});

test('energy rises under sustained jolts and stays within 0..1', () => {
  const m = createEnergyMeter();
  let e = 0, max = 0;
  for (let i = 0; i < 120; i++) {
    e = m.update(i % 2 ? 9.81 : 9.81 + ENERGY_FULL, DT); // jolt of ENERGY_FULL every other frame
    assert.ok(e >= 0 && e <= 1, `energy ${e} out of range`);
    max = Math.max(max, e);
  }
  assert.ok(max > 0.3, `pushed energy peaked at ${max}, expected clearly above idle`);
});

test('energy releases slowly, not instantly', () => {
  const m = createEnergyMeter();
  let e = 0;
  for (let i = 0; i < 60; i++) e = m.update(i % 2 ? 9.81 : 9.81 + ENERGY_FULL, DT);
  const built = e;
  for (let i = 0; i < 6; i++) e = m.update(9.81, DT); // 0.1 s of stillness
  assert.ok(e > built * 0.4, `after 0.1s still, energy ${e} collapsed from ${built}`);
  for (let i = 0; i < 90; i++) e = m.update(9.81, DT); // 1.5 s more
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
