import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tiltFromOrientation, rpmFromSpeed, createShakeDetector, TILT_RANGE } from '../src/mapping.js';

const NEUTRAL = { beta: 40, gamma: -5 };

test('neutral grip maps to zero tilt', () => {
  assert.deepEqual(tiltFromOrientation(40, -5, NEUTRAL), { x: 0, y: 0 });
});

test('small wobble inside deadzone maps to zero', () => {
  const t = tiltFromOrientation(42, -3, NEUTRAL);
  assert.equal(t.x, 0);
  assert.equal(t.y, 0);
});

test('full tilt reaches exactly ±1 and clamps beyond', () => {
  assert.equal(tiltFromOrientation(40 + TILT_RANGE, -5, NEUTRAL).y, 1);
  assert.equal(tiltFromOrientation(40 - 90, -5, NEUTRAL).y, -1);
});

test('steer output is monotonic in gamma', () => {
  let prev = -Infinity;
  for (let g = -30; g <= 30; g += 3) {
    const { x } = tiltFromOrientation(40, -5 + g, NEUTRAL);
    assert.ok(x >= prev, `x(${g}) = ${x} < ${prev}`);
    prev = x;
  }
});

test('rpm idles at 0.15 and reaches 1 at max speed, forward or reverse', () => {
  assert.equal(rpmFromSpeed(0, 48), 0.15);
  assert.equal(rpmFromSpeed(48, 48), 1);
  assert.equal(rpmFromSpeed(-48, 48), 1);
});

test('shake fires once then respects cooldown', () => {
  const d = createShakeDetector();
  assert.equal(d.update(30, 1 / 60), true);
  assert.equal(d.update(30, 1 / 60), false);
  for (let i = 0; i < 60; i++) d.update(9.81, 1 / 60);
  assert.equal(d.update(30, 1 / 60), true);
});

test('gentle movement never fires shake', () => {
  const d = createShakeDetector();
  for (let i = 0; i < 120; i++) assert.equal(d.update(11, 1 / 60), false);
});
