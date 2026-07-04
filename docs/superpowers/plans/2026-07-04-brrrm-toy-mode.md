# Brrrm v2 Toy Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Brrrm into a toy: the phone *becomes* a reactive tractor (pushed on the floor inside a home-built brick, or handheld). Toy mode is the default; the v1 field game survives behind a parent long-press.

**Architecture:** Additive on the v1 engine. New pure math (motion-energy meter, energy→RPM, face-down detector) in `mapping.js`; sensor bus gains `motionEnergy`/`rotRate`/`faceDown`; audio gains six one-shot patches; a new `toy.js` scene owns the big reactive tractor in two views (top-down default, side); `main.js` routes a quick START tap → toy mode and a 2 s long-press → field mode. Renderer, world, and the field vehicle are untouched.

**Tech Stack:** Vanilla JS (ES modules), Canvas 2D, Web Audio, PWA. Zero dependencies, no bundler. `node --test` for pure math; headless Chrome (puppeteer-core + system Chrome) for runtime verification.

**Spec:** `docs/superpowers/specs/2026-07-04-brrrm-toy-mode-design.md` — read it first.

## Global Constraints

- **Zero dependencies, zero build step.** Hand-written ES modules loaded via `<script type="module">`. No package.json in the repo.
- **Colors ONLY from the 16-color DawnBringer `PALETTE`** in `renderer.js`. Sprites/art use palette indices (chars `0-9a-f`, `.` = transparent for `compileSprite`).
- **No readable text during play.** Text is allowed only on the start screen. In-play UI stays the two emoji HUD buttons (🔇/🔊 mute, 🎤 mic).
- **Synth-first audio.** New sounds are synthesized; the sample-override path (`play(name)` checking `buffers[name]`) already exists and must keep working. v2 ships zero audio files.
- **Never stack permission prompts.** The START gesture does motion-permission + audio-unlock only; mic stays behind the 🎤 button.
- **Toy mode is the default; field mode is unchanged and reachable only via a ~2 s long-press on START.** A quick tap can never reach field mode.
- **Playable without sensors.** Desktop keyboard shim drives every input (arrows = tilt, Space = shake, E = motion energy, F = flip, T = twist).
- **`node --test`** runs bare (the `test/` dir-arg form fails on Node 26).
- Local dev server: `python3 -m http.server 8000` from repo root.
- Headless tooling lives in the scratchpad `/private/tmp/claude-502/-Users-admin-Development-brrrm/2475cc5e-cb3b-4b9a-a2ec-ff7510d3a37b/scratchpad/` (puppeteer-core installed there; Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`). Never add test tooling to the repo.
- Commit after every task (messages given per task).

---

### Task 1: Toy-mode math (mapping.js)

**Files:**
- Modify: `src/mapping.js` (append new exports; existing code untouched)
- Test: `test/toy-mapping.test.js` (new)

**Interfaces:**
- Consumes: the `clamp` helper already defined in `src/mapping.js`.
- Produces (used by `sensors.js`, `toy.js`):
  - `ENERGY_FULL = 12` (m/s² of jolt → energy 1.0)
  - `createEnergyMeter() → { update(magnitude, dt) → number }` — smoothed motion energy 0..1 from the magnitude of `accelerationIncludingGravity`; removes the gravity/tilt DC, fast attack / slow release on the residual jolt
  - `rpmFromEnergy(energy, idle = 0.15) → number` — 0..1, idle-floored
  - `createFaceDownDetector() → { update(gravityZ) → boolean }` — hysteresis flip detector (face-up `z ≈ +9.81`, face-down `z ≈ -9.81`)

- [ ] **Step 1: Write the failing tests — `test/toy-mapping.test.js`**

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test`
Expected: FAIL — `createEnergyMeter is not a function` (or `does not provide an export named 'createEnergyMeter'`).

- [ ] **Step 3: Append the implementation to `src/mapping.js`**

Add at the end of the file (do not touch the existing exports):

```js

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: all pass — the 5 v1 `mapping.test.js` tests plus the 5 new ones (`# pass 10`, `# fail 0`).

- [ ] **Step 5: Commit**

```bash
git add src/mapping.js test/toy-mapping.test.js
git commit -m "feat: motion-energy meter, energy->rpm, face-down detector"
```

---

### Task 2: Sensor bus toy inputs (sensors.js)

**Files:**
- Modify: `src/sensors.js`

**Interfaces:**
- Consumes from Task 1: `createEnergyMeter`, `createFaceDownDetector`.
- Produces (used by `toy.js` via `main.js`): `poll(dt)` return object gains three fields —
  - `motionEnergy` (number 0..1)
  - `rotRate` (number, rad/s — magnitude of the rotation-rate vector)
  - `faceDown` (boolean)
  - Existing fields (`tilt`, `shake`, `taps`, `micLevel`) are unchanged.
  - Keyboard shim gains: **E** (hold → motion energy), **F** (toggle face-down), **T** (hold → twist/rotRate). Existing arrows/Space unchanged.

- [ ] **Step 1: Extend the imports (`src/sensors.js` line 2)**

Change:
```js
import { tiltFromOrientation, createShakeDetector } from './mapping.js';
```
to:
```js
import { tiltFromOrientation, createShakeDetector, createEnergyMeter, createFaceDownDetector } from './mapping.js';
```

- [ ] **Step 2: Add state and meter instances**

Directly after `const shakeDetector = createShakeDetector();` add:
```js
  const energyMeter = createEnergyMeter();
  const faceDownDetector = createFaceDownDetector();
```
And change the sensor state block:
```js
  let accelMag = 9.81;
  let lastMotionAt = 0;
```
to:
```js
  let accelMag = 9.81;
  let accelZ = 9.81;   // accelerationIncludingGravity.z → face-down detection
  let rotMag = 0;      // rotation-rate magnitude, rad/s
  let lastMotionAt = 0;
```

- [ ] **Step 3: Capture Z and rotation rate in the devicemotion handler**

Replace the whole `devicemotion` listener (currently just `accelMag`):
```js
      window.addEventListener('devicemotion', (e) => {
        const a = e.accelerationIncludingGravity;
        if (a && a.x !== null) accelMag = Math.hypot(a.x, a.y, a.z);
      });
```
with:
```js
      window.addEventListener('devicemotion', (e) => {
        const a = e.accelerationIncludingGravity;
        if (a && a.x !== null) { accelMag = Math.hypot(a.x, a.y, a.z); accelZ = a.z; }
        const rr = e.rotationRate; // deg/s
        if (rr && rr.alpha !== null) {
          rotMag = Math.hypot(rr.alpha || 0, rr.beta || 0, rr.gamma || 0) * Math.PI / 180;
        }
      });
```

- [ ] **Step 4: Extend the keyboard shim state and handlers**

Change:
```js
  const kb = { x: 0, y: 0, shake: false };
```
to:
```js
  const kb = { x: 0, y: 0, shake: false, energy: 0, faceDown: false, rot: 0 };
```
Then replace the `attachKeyboardShim` keydown/keyup listeners:
```js
      window.addEventListener('keydown', (e) => {
        if (e.key === ' ') kb.shake = true;
        keys[e.key] = true; map();
      });
      window.addEventListener('keyup', (e) => { keys[e.key] = false; map(); });
```
with:
```js
      window.addEventListener('keydown', (e) => {
        if (e.key === ' ') kb.shake = true;
        if (e.key === 'e' || e.key === 'E') kb.energy = 0.8;
        if (e.key === 't' || e.key === 'T') kb.rot = 6;
        if ((e.key === 'f' || e.key === 'F') && !e.repeat) kb.faceDown = !kb.faceDown;
        keys[e.key] = true; map();
      });
      window.addEventListener('keyup', (e) => {
        if (e.key === 'e' || e.key === 'E') kb.energy = 0;
        if (e.key === 't' || e.key === 'T') kb.rot = 0;
        keys[e.key] = false; map();
      });
```

- [ ] **Step 5: Compute and return the new fields in `poll(dt)`**

In `poll(dt)`, directly before the line `const out = { tilt, shake, taps, micLevel };` add:
```js
      let motionEnergy = energyMeter.update(accelMag, dt);
      if (kb.energy) motionEnergy = Math.max(motionEnergy, kb.energy);
      let rotRate = Math.max(rotMag, kb.rot);
      let faceDown = faceDownDetector.update(accelZ) || kb.faceDown;
```
Then change:
```js
      const out = { tilt, shake, taps, micLevel };
```
to:
```js
      const out = { tilt, shake, taps, micLevel, motionEnergy, rotRate, faceDown };
```

- [ ] **Step 6: Syntax check + existing tests stay green**

Run: `node --check src/sensors.js && node --test`
Expected: no syntax error; `# pass 10`, `# fail 0` (Task 1 tests still pass; sensors has no unit tests).

- [ ] **Step 7: Headless behavioral check of the shim path**

Write `/private/tmp/claude-502/-Users-admin-Development-brrrm/2475cc5e-cb3b-4b9a-a2ec-ff7510d3a37b/scratchpad/sensors-smoke.mjs`:
```js
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8000/', { waitUntil: 'domcontentloaded' });
await p.addScriptTag({ type: 'module', content: `
  import { createSensorBus } from '/src/sensors.js';
  const bus = createSensorBus();
  bus.attachKeyboardShim();
  window.__poll = (dt) => bus.poll(dt);
` });
await new Promise(r => setTimeout(r, 100));
const base = await p.evaluate(() => window.__poll(1/60));
await p.keyboard.down('e'); await p.keyboard.down('f');
let after; for (let i = 0; i < 10; i++) after = await p.evaluate(() => window.__poll(1/60));
console.log(JSON.stringify({
  baseKeys: Object.keys(base).sort(),
  baseEnergy: base.motionEnergy, baseFaceDown: base.faceDown, baseRot: base.rotRate,
  afterEnergy: after.motionEnergy, afterFaceDown: after.faceDown, errs,
}));
await b.close();
```
Serve + run:
```bash
python3 -m http.server 8000 >/dev/null 2>&1 &  SRV=$!
sleep 1
cd /private/tmp/claude-502/-Users-admin-Development-brrrm/2475cc5e-cb3b-4b9a-a2ec-ff7510d3a37b/scratchpad && node sensors-smoke.mjs
kill $SRV
```
Expected: `baseKeys` includes `faceDown`, `motionEnergy`, `rotRate`; `baseEnergy` ~0, `baseFaceDown` false, `baseRot` 0; `afterEnergy` ≥ 0.8, `afterFaceDown` true; `errs` empty.

- [ ] **Step 8: Commit**

```bash
git add src/sensors.js
git commit -m "feat: sensor bus exposes motionEnergy, rotRate, faceDown"
```

---

### Task 3: Toy sound patches (audio.js)

**Files:**
- Modify: `src/audio.js` (add to the `SYNTH` object only; engine/loop code untouched)

**Interfaces:**
- Consumes: the existing `blip(ac, out, {...})` and `noise(ac, out, {...})` helpers in `audio.js`.
- Produces: `audio.play(name)` handles six new names — `reverseBeep`, `squeak`, `screech`, `rattle`, `sputterStall`, `startCough`. All synth; each is also sample-overridable (the existing `buffers[name]` check runs first). Unknown names still fall back to `plop`.

- [ ] **Step 1: Add the six patches to the `SYNTH` object**

In `src/audio.js`, inside the `const SYNTH = { ... }` object, add these entries after the existing `squawk` entry (before the closing `};`):
```js
  reverseBeep(ac, out) { blip(ac, out, { type: 'square', f0: 880, f1: 880, dur: 0.12, vol: 0.35 }); },
  squeak(ac, out) {
    blip(ac, out, { type: 'sine', f0: 1400, f1: 2200, dur: 0.08, vol: 0.3 });
    setTimeout(() => blip(ac, out, { type: 'sine', f0: 2000, f1: 1200, dur: 0.08, vol: 0.25 }), 70);
  },
  screech(ac, out) { noise(ac, out, { dur: 0.45, vol: 0.45, filterFrom: 5000, filterTo: 2500 }); },
  rattle(ac, out) {
    noise(ac, out, { dur: 0.12, vol: 0.4, filterFrom: 2000, filterTo: 400 });
    setTimeout(() => noise(ac, out, { dur: 0.1, vol: 0.35, filterFrom: 1500, filterTo: 300 }), 80);
    setTimeout(() => noise(ac, out, { dur: 0.1, vol: 0.3, filterFrom: 1800, filterTo: 350 }), 160);
  },
  sputterStall(ac, out) {
    blip(ac, out, { type: 'square', f0: 120, f1: 30, dur: 0.6, vol: 0.5 });
    noise(ac, out, { dur: 0.6, vol: 0.25, filterFrom: 600, filterTo: 120 });
  },
  startCough(ac, out) {
    noise(ac, out, { dur: 0.15, vol: 0.4, filterFrom: 800, filterTo: 200 });
    setTimeout(() => noise(ac, out, { dur: 0.15, vol: 0.4, filterFrom: 800, filterTo: 200 }), 200);
    setTimeout(() => blip(ac, out, { type: 'square', f0: 60, f1: 110, dur: 0.4, vol: 0.5 }), 420);
  },
```

- [ ] **Step 2: Syntax check + existing tests stay green**

Run: `node --check src/audio.js && node --test`
Expected: no syntax error; `# pass 10`, `# fail 0`.

- [ ] **Step 3: Headless check — every new patch plays without error**

Write `/private/tmp/claude-502/-Users-admin-Development-brrrm/2475cc5e-cb3b-4b9a-a2ec-ff7510d3a37b/scratchpad/audio-smoke.mjs`:
```js
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8000/', { waitUntil: 'domcontentloaded' });
await p.addScriptTag({ type: 'module', content: `
  import { createAudioEngine } from '/src/audio.js';
  const a = createAudioEngine();
  window.__playAll = () => {
    a.init(); a.startEngine();
    for (const n of ['reverseBeep','squeak','screech','rattle','sputterStall','startCough','bogusName']) a.play(n);
    return true;
  };
` });
await p.evaluate(() => window.__playAll());        // called inside a trusted eval (gesture-like)
await new Promise(r => setTimeout(r, 500));
console.log(JSON.stringify({ errs }));
await b.close();
```
Serve + run (same pattern as Task 2). Expected: `{"errs":[]}` — all six patches and the `bogusName` fallback play with no thrown error.

- [ ] **Step 4: Commit**

```bash
git add src/audio.js
git commit -m "feat: toy sound patches (reverseBeep, squeak, screech, rattle, sputterStall, startCough)"
```

---

### Task 4: Toy scene (top-down) + app routing

**Files:**
- Modify: `src/renderer.js` (add `scaleSprite` export)
- Create: `src/toy.js`
- Modify: `src/main.js` (replace the START handler + frame loop with mode routing)
- Modify: `index.html` (add the long-press ring element + CSS)
- Modify: `sw.js` (add `src/toy.js` to PRECACHE — CACHE bump happens in Task 7)

**Interfaces:**
- Consumes: `createRenderer`/`compileSprite`/`scaleSprite` (`renderer.js`), `rpmFromEnergy` (`mapping.js`), `icon` export from `vehicles/tractor.js` (the v1 16×16 top-down tractor), the sensor bus `poll()` fields, `audio.play`/`setEngineIntensity`/`startEngine`.
- Produces:
  - `scaleSprite(img, n) → HTMLCanvasElement` — standalone `renderer.js` export; nearest-neighbour n× enlarge (imported by `toy.js` like `compileSprite`).
  - `createToyScene({ renderer, audio }) → { reset(view), update(input, dt) → { rpm }, draw() }`. `view` is `'top'|'side'`. `update` consumes `input.taps` internally (part hit-zones) and fires one-shot SFX; the returned `rpm` drives the engine loop + vibration in `main.js`. `draw()` clears and renders the whole frame.
  - `main.js` sets `document.body.dataset.mode` to `'toy'` or `'field'` at launch (a stable, testable signal).

- [ ] **Step 1: Add `scaleSprite` to `src/renderer.js`**

Directly after the `compileSprite` function (before `export function createRenderer`) add:
```js
// Nearest-neighbour enlarge a compiled sprite by an integer factor.
export function scaleSprite(img, n) {
  const c = document.createElement('canvas');
  c.width = img.width * n; c.height = img.height * n;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
```

- [ ] **Step 2: Create `src/toy.js`**

```js
// Toy mode: the phone IS the tractor. One big reactive vehicle, no world to
// navigate. Motion energy (pushing/shaking) drives RPM; tilt, twist, flip, shake,
// and part-taps each trigger sound + animation. Two views share all reaction logic.
import { scaleSprite } from './renderer.js';
import { rpmFromEnergy } from './mapping.js';
import { icon as FIELD_TRACTOR } from './vehicles/tractor.js';

const SCROLL_SPEED = 90;     // world px/s of ground scroll at rpm 1
const REVERSE_TILT = -0.3;   // tilt.y below this → reverse
const TWIST_THRESHOLD = 3.5; // rad/s → tyre screech

export function createToyScene({ renderer, audio }) {
  const bigTractor = scaleSprite(FIELD_TRACTOR, 3); // 48×48 chunky top-down
  const st = {};

  function reset(view) {
    st.view = view === 'side' ? 'side' : 'top';
    st.rpm = 0.15; st.scroll = 0; st.dir = 1; st.lean = 0; st.wheelSpin = 0;
    st.headlights = false; st.stalled = false; st.bounce = 0;
    st.revBeepT = 0; st.smokeT = 0; st.squeakT = 0; st.screechT = 0;
    st.puffs = [];
    renderer.camera.x = 0; renderer.camera.y = 0; renderer.camera.mode = 'top';
    renderer.setView(st.view === 'side' ? 80 : 64);
  }

  // Screen-fraction hit zones over the centered tractor (tuned for the 48px sprite).
  function partAt(fx, fy) {
    if (fx > 0.44 && fx < 0.56 && fy > 0.24 && fy < 0.34) return 'exhaust';
    if (fx > 0.38 && fx < 0.62 && fy > 0.34 && fy < 0.44) return 'lights';
    if (fx > 0.40 && fx < 0.60 && fy > 0.44 && fy < 0.60) return 'cab';
    if ((fx < 0.38 || fx > 0.62) && fy > 0.40 && fy < 0.72) return 'wheel';
    return 'body';
  }

  function handleTaps(taps) {
    const cw = renderer.canvas.clientWidth, ch = renderer.canvas.clientHeight;
    for (const t of taps) {
      const part = partAt(t.px / cw, t.py / ch);
      if (part === 'cab') audio.play('horn');
      else if (part === 'lights') st.headlights = !st.headlights;
      else if (part === 'exhaust') { audio.play('backfire'); puff(true); }
      else audio.play('squeak'); // wheel or body
    }
  }

  function puff(big) { st.puffs.push({ life: big ? 1.2 : 0.7, r: big ? 3 : 2 }); }

  function update(input, dt) {
    handleTaps(input.taps);

    // Flip = stall / restart.
    if (input.faceDown && !st.stalled) { st.stalled = true; audio.play('sputterStall'); }
    else if (!input.faceDown && st.stalled) { st.stalled = false; audio.play('startCough'); }

    // RPM: motion energy is the main driver; forward tilt and yelling add.
    let target = 0;
    if (!st.stalled) {
      const drive = Math.min(1, input.motionEnergy + Math.max(0, input.tilt.y) * 0.6 + input.micLevel * 0.5);
      target = rpmFromEnergy(drive);
    }
    st.rpm += (target - st.rpm) * Math.min(1, dt / 0.2);
    st.dir = input.tilt.y < REVERSE_TILT ? -1 : 1;

    // Lean + spring squeak on a firm sideways tilt.
    const prev = st.lean;
    st.lean += (input.tilt.x - st.lean) * Math.min(1, dt / 0.15);
    st.squeakT = Math.max(0, st.squeakT - dt);
    if (Math.abs(st.lean - prev) > 0.02 && Math.abs(st.lean) > 0.4 && st.squeakT === 0) {
      audio.play('squeak'); st.squeakT = 0.5;
    }

    // Fast twist → tyre screech.
    st.screechT = Math.max(0, st.screechT - dt);
    if (input.rotRate > TWIST_THRESHOLD && st.screechT === 0) { audio.play('screech'); st.screechT = 0.6; }

    // Shake → rattle-apart.
    if (input.shake) { st.bounce = 0.4; audio.play('rattle'); audio.play('backfire'); }
    st.bounce = Math.max(0, st.bounce - dt);

    // Reverse beeps.
    if (st.dir < 0 && !st.stalled) {
      st.revBeepT -= dt;
      if (st.revBeepT <= 0) { audio.play('reverseBeep'); st.revBeepT = 0.5; }
    } else st.revBeepT = 0;

    // Ground scroll, wheel spin, exhaust puffs.
    if (!st.stalled) {
      st.scroll += st.rpm * SCROLL_SPEED * st.dir * dt;
      st.wheelSpin += st.rpm * st.dir * dt * 12;
      st.smokeT -= dt;
      if (st.smokeT <= 0) { puff(false); st.smokeT = 0.5 - st.rpm * 0.35; }
    }
    for (let i = st.puffs.length - 1; i >= 0; i--) {
      const p = st.puffs[i]; p.life -= dt; p.r += dt * 4;
      if (p.life <= 0) st.puffs.splice(i, 1);
    }
    return { rpm: st.rpm };
  }

  function drawTop() {
    const R = renderer, W = R.W, H = R.H, cx = W / 2, cy = H / 2;
    R.camera.x = 0; R.camera.y = 0;
    R.clear(5); // grass
    // Scrolling ground tufts (lighter-green flecks) drifting with the tractor.
    const STRIPE = 12;
    const off = ((st.scroll % STRIPE) + STRIPE) % STRIPE;
    for (let y = -STRIPE; y < H + STRIPE; y += STRIPE) {
      const yy = Math.round(y + off);
      R.rect(Math.round(cx - W * 0.4), yy, 3, 2, 11);
      R.rect(Math.round(cx + W * 0.25), yy + 5, 3, 2, 11);
      R.rect(Math.round(cx - W * 0.1), yy + 8, 2, 2, 11);
    }
    // Tractor: jitter on bounce, tilt on lean.
    const jx = st.bounce > 0 ? Math.sin(st.bounce * 50) * 2 : 0;
    R.sprite(bigTractor, cx + jx, cy, st.lean * 0.06);
    // Headlight beams sweeping "up" toward the viewer.
    if (st.headlights) { R.rect(cx - 8, cy - 30, 5, 14, 14); R.rect(cx + 3, cy - 30, 5, 14, 14); }
    // Exhaust puffs drifting toward the viewer (grow + fade).
    for (const p of st.puffs) {
      const c = p.life > 0.5 ? 10 : 7;
      R.rect(Math.round(cx + 6 - p.r / 2), Math.round(cy - 18 - (1.2 - p.life) * 6), Math.round(p.r), Math.round(p.r), c);
    }
  }

  // Side view is filled in by Task 5; until then it reuses the top-down draw so
  // choosing SIDE early still renders something valid.
  function drawSide() { drawTop(); }

  function draw() { st.view === 'side' ? drawSide() : drawTop(); }

  return { reset, update, draw };
}
```

- [ ] **Step 3: Add the long-press ring to `index.html`**

In the `<style>` block, after the `#start:active` rule, add:
```css
  #start { position:relative; }
  #ring { position:absolute; left:50%; top:50%; width:34vmin; height:34vmin;
          transform:translate(-50%,-50%); border-radius:50%; opacity:0;
          pointer-events:none;
          background:conic-gradient(#dad45e var(--p,0deg), #14212c 0);
          -webkit-mask:radial-gradient(transparent 58%, #000 60%);
          mask:radial-gradient(transparent 58%, #000 60%); }
```
And inside the `<button id="start">…</button>`, add the ring as its first child:
```html
  <button id="start"><div id="ring"></div>START ENGINE</button>
```
(Leave the existing `START ENGINE` text; the ring div sits behind it.)

- [ ] **Step 4: Rewrite `src/main.js` (full file)**

Replace the entire contents of `src/main.js` with:
```js
import { createRenderer } from './renderer.js';
import { createSensorBus } from './sensors.js';
import { createAudioEngine } from './audio.js';
import { createWorld } from './world.js';
import { createToyScene } from './toy.js';
import { vehicles } from './vehicles/index.js';

const canvas = document.getElementById('game');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start');
const muteBtn = document.getElementById('mute');
const micBtn = document.getElementById('mic');
const ring = document.getElementById('ring');

const renderer = createRenderer(canvas);
const bus = createSensorBus();
const audio = createAudioEngine();
const world = createWorld();
const scene = createToyScene({ renderer, audio });
const vehicle = vehicles[0];

let running = false;
let vibeTimer = 0;

// Field-mode size picker (unchanged from v1; toy mode ignores it).
const sizeBtns = [...document.querySelectorAll('.sizeBtn')];
const savedSize = parseInt(localStorage.getItem('brrrm-view'), 10) || 64;
for (const b of sizeBtns) {
  b.classList.toggle('sel', parseInt(b.dataset.view, 10) === savedSize);
  b.addEventListener('click', () => {
    localStorage.setItem('brrrm-view', b.dataset.view);
    for (const o of sizeBtns) o.classList.toggle('sel', o === b);
  });
}

// START: quick tap → toy mode; ~2 s long-press → field mode.
let launched = false, holdStart = 0, holdRAF = 0;

function cancelHold() {
  cancelAnimationFrame(holdRAF);
  ring.style.opacity = '0';
  ring.style.setProperty('--p', '0deg');
}

startBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (launched) return;
  holdStart = performance.now();
  ring.style.opacity = '1';
  const tick = () => {
    const p = Math.min(1, (performance.now() - holdStart) / 2000);
    ring.style.setProperty('--p', (p * 360) + 'deg');
    if (p >= 1) { cancelHold(); launch('field'); return; }
    holdRAF = requestAnimationFrame(tick);
  };
  holdRAF = requestAnimationFrame(tick);
});
startBtn.addEventListener('pointerup', () => {
  if (launched) return;
  const held = performance.now() - holdStart;
  cancelHold();
  launch(held >= 2000 ? 'field' : 'toy');
});
startBtn.addEventListener('pointerleave', () => { if (!launched) cancelHold(); });
startBtn.addEventListener('pointercancel', () => { if (!launched) cancelHold(); });

async function launch(mode) {
  if (launched) return; launched = true;
  audio.init();               // AudioContext unlock — synchronously first, in this gesture
  await bus.requestMotion();  // iOS permission prompt — same gesture
  audio.startEngine();
  try { await navigator.wakeLock?.request('screen'); } catch {}
  try { await document.documentElement.requestFullscreen?.(); } catch {}
  setTimeout(() => bus.calibrate(), 300);
  bus.attachTouch(canvas);
  bus.attachKeyboardShim();

  if (mode === 'field') {
    await audio.loadProfile(vehicle.soundProfile);
    vehicle.reset();
    world.seed(0, 0);
    renderer.setView(parseInt(localStorage.getItem('brrrm-view'), 10) || 64); // fresh, not the load-time value
    renderer.camera.mode = 'top';
  } else {
    scene.reset(localStorage.getItem('brrrm-toyview') || 'top');
  }

  overlay.style.display = 'none';
  muteBtn.style.display = 'flex';
  micBtn.style.display = 'flex';
  updateMuteIcon();
  window.addEventListener('pointerdown', () => audio.resume());
  document.body.dataset.mode = mode;
  running = true;
}

muteBtn.addEventListener('click', () => { audio.toggleMuted(); updateMuteIcon(); });
function updateMuteIcon() {
  muteBtn.textContent = audio.muted ? '🔇' : '🔊';
  muteBtn.classList.toggle('off', audio.muted);
}

micBtn.addEventListener('click', async () => {
  if (bus.micEnabled) { bus.disableMic(); micBtn.classList.add('off'); return; }
  try { await bus.enableMic(); micBtn.classList.remove('off'); } catch {}
});

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!running) return;

  const input = bus.poll(dt);
  let rpm;

  if (document.body.dataset.mode === 'toy') {
    rpm = scene.update(input, dt).rpm;
    audio.setEngineIntensity(rpm);
    scene.draw();
  } else {
    for (const tap of input.taps) {
      const w = renderer.screenToWorld(tap.px, tap.py);
      if (vehicle.isHit(w.x, w.y)) audio.play('horn');
      else { world.spawnProp(Math.random() < 0.5 ? 'bale' : 'puddle', w.x, w.y); audio.play('plop'); }
    }
    const events = [...vehicle.update(input, world, dt), ...world.update(dt, vehicle.state)];
    for (const e of events) audio.play(e.type);
    rpm = vehicle.rpm(input);
    audio.setEngineIntensity(rpm);
    renderer.follow(vehicle.state.x, vehicle.state.y);
    renderer.clear(5);
    world.draw(renderer);
    vehicle.draw(renderer);
    world.drawParticles(renderer);
  }

  vibeTimer -= dt;
  if (vibeTimer <= 0 && navigator.vibrate) {
    navigator.vibrate(Math.round(10 + rpm * 20));
    vibeTimer = 0.35 - rpm * 0.2;
  }
}
requestAnimationFrame(frame);
```

- [ ] **Step 5: Add `src/toy.js` to the service-worker precache**

In `sw.js`, change the PRECACHE line:
```js
  'src/vehicles/index.js', 'src/vehicles/tractor.js',
```
to:
```js
  'src/vehicles/index.js', 'src/vehicles/tractor.js', 'src/toy.js',
```
(Do NOT bump `CACHE` yet — that happens once, in Task 7.)

- [ ] **Step 6: Syntax + unit tests**

Run: `node --check src/renderer.js && node --check src/toy.js && node --check src/main.js && node --check sw.js && node --test`
Expected: no syntax errors; `# pass 10`, `# fail 0`.

- [ ] **Step 7: Headless runtime smoke + screenshot-and-refine**

Write `/private/tmp/claude-502/-Users-admin-Development-brrrm/2475cc5e-cb3b-4b9a-a2ec-ff7510d3a37b/scratchpad/toy-smoke.mjs`:
```js
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-fake-ui-for-media-stream'] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 700 });
const errs = []; p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

// Quick tap → toy mode.
await p.goto('http://localhost:8000/', { waitUntil: 'networkidle2' });
await p.click('#start');
await new Promise(r => setTimeout(r, 500));
const mode = await p.evaluate(() => document.body.dataset.mode);
await p.screenshot({ path: 'toy-idle.png' });
// Drive via the energy shim; ground should scroll.
await p.keyboard.down('e');
await new Promise(r => setTimeout(r, 1000));
await p.keyboard.up('e');
await p.screenshot({ path: 'toy-driving.png' });
// Tap the cab (horn) and headlights (toggle); flip (stall) then unflip (restart).
await p.mouse.click(195, 350);
await p.mouse.click(195, 280);
await p.keyboard.press('f');
await new Promise(r => setTimeout(r, 200));
await p.keyboard.press('f');

// Long-press → field mode (fresh load).
const p2 = await b.newPage();
await p2.setViewport({ width: 390, height: 700 });
await p2.goto('http://localhost:8000/', { waitUntil: 'networkidle2' });
const el = await p2.$('#start'); const box = await el.boundingBox();
await p2.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await p2.mouse.down();
await new Promise(r => setTimeout(r, 2300));
await p2.mouse.up();
await new Promise(r => setTimeout(r, 300));
const mode2 = await p2.evaluate(() => document.body.dataset.mode);

console.log(JSON.stringify({ tapMode: mode, longPressMode: mode2, errs }));
await b.close();
```
Serve + run (same pattern as Task 2). Expected: `{"tapMode":"toy","longPressMode":"field","errs":[]}`.
Then **Read `toy-idle.png` and `toy-driving.png`** and confirm: a big tractor centered on green; the two screenshots differ (ground scrolled). If the tractor is off-center, too small/large, or the hit zones look wrong, adjust `reset()`'s `setView`, the `partAt` fractions, and the draw offsets, then re-run — this is the expected art/zone tuning step. Record before/after notes in the report.

- [ ] **Step 8: Commit**

```bash
git add src/renderer.js src/toy.js src/main.js index.html sw.js
git commit -m "feat: toy mode (top-down) with tap-a-quick-start routing and long-press to field"
```

---

### Task 5: Toy side view (toy.js)

**Files:**
- Modify: `src/toy.js` (replace the `drawSide` placeholder + add a wheel helper; reaction logic and `update` are untouched)

**Interfaces:**
- Consumes: the `st` scene state already populated by `update` (`rpm`, `scroll`, `wheelSpin`, `dir`, `lean`, `bounce`, `headlights`, `puffs`).
- Produces: a real side-view render (sky, sun, drifting clouds, ground, parallax bushes, profile tractor with rotating wheels, chimney smoke). No interface change — `draw()` already routes `'side'` here.

Side art is drawn from renderer primitives (rects) rather than one large hand-authored sprite: robust, and the wheels can actually rotate.

- [ ] **Step 1: Replace the `drawSide` placeholder in `src/toy.js`**

Replace:
```js
  // Side view is filled in by Task 5; until then it reuses the top-down draw so
  // choosing SIDE early still renders something valid.
  function drawSide() { drawTop(); }
```
with:
```js
  function drawWheel(x, y, rad) {
    const R = renderer;
    R.rect(x - rad, y - rad, rad * 2, rad * 2, 0);          // tyre
    R.rect(x - rad + 1, y - rad + 1, rad * 2 - 2, rad * 2 - 2, 4); // brown inner
    const sx = Math.round(x + Math.cos(st.wheelSpin) * (rad - 1)); // rotating spoke tip
    const sy = Math.round(y + Math.sin(st.wheelSpin) * (rad - 1));
    R.px(sx, sy, 15);
    R.px(x, y, 15);
  }

  function drawSide() {
    const R = renderer, W = R.W, H = R.H;
    R.camera.x = 0; R.camera.y = 0;
    R.clear(8); // sky blue
    R.rect(W - 18, 8, 8, 8, 14); // sun
    // Two clouds drifting slowly leftward with the scroll.
    const cl = ((st.scroll * 0.2) % (W + 30) + (W + 30)) % (W + 30);
    R.rect(((30 - cl) % (W + 30) + (W + 30)) % (W + 30) - 10, 14, 12, 4, 15);
    R.rect(((90 - cl) % (W + 30) + (W + 30)) % (W + 30) - 10, 22, 16, 5, 15);
    // Ground.
    const gy = Math.floor(H * 0.68);
    R.rect(0, gy, W, H - gy, 5);
    R.rect(0, gy, W, 2, 11);
    // Parallax bushes scrolling with rpm/direction.
    const boff = ((st.scroll % 40) + 40) % 40;
    for (let x = -40; x < W + 40; x += 40) {
      const bx = Math.round(x - boff);
      R.rect(bx, gy - 6, 8, 6, 11); R.rect(bx + 20, gy - 4, 5, 4, 11);
    }
    // Tractor in profile, sitting on the ground, bouncing on shake.
    const cx = Math.round(W * 0.42);
    const bnc = st.bounce > 0 ? Math.round(Math.sin(st.bounce * 50) * 2) : 0;
    drawWheel(cx + 14, gy - 6 + bnc, 7);       // rear (big)
    drawWheel(cx - 8, gy - 4 + bnc, 4);        // front (small)
    R.rect(cx - 10, gy - 16 + bnc, 30, 10, 6); // hull
    R.rect(cx - 2, gy - 24 + bnc, 12, 9, 6);   // cab
    R.rect(cx + 1, gy - 22 + bnc, 7, 5, 13);   // window
    R.rect(cx - 8, gy - 22 + bnc, 3, 6, 0);    // chimney
    R.rect(cx + 3, gy - 28 + bnc, 4, 4, 12);   // driver head
    if (st.headlights) R.rect(cx - 12, gy - 14 + bnc, 3, 3, 14);
    // Chimney smoke rising.
    for (const p of st.puffs) {
      const c = p.life > 0.5 ? 10 : 7;
      R.rect(cx - 8, gy - 26 + bnc - Math.round((1.2 - p.life) * 10), Math.round(p.r), Math.round(p.r), c);
    }
  }
```

- [ ] **Step 2: Syntax + unit tests**

Run: `node --check src/toy.js && node --test`
Expected: no syntax error; `# pass 10`, `# fail 0`.

- [ ] **Step 3: Headless render check (side view) + screenshot-and-refine**

Write `/private/tmp/claude-502/-Users-admin-Development-brrrm/2475cc5e-cb3b-4b9a-a2ec-ff7510d3a37b/scratchpad/toy-side-smoke.mjs`:
```js
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 700 });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8000/', { waitUntil: 'networkidle2' });
await p.evaluate(() => localStorage.setItem('brrrm-toyview', 'side'));
await p.reload({ waitUntil: 'networkidle2' });
await p.click('#start');
await new Promise(r => setTimeout(r, 400));
await p.screenshot({ path: 'toy-side-idle.png' });
await p.keyboard.down('e');
await new Promise(r => setTimeout(r, 1000));
await p.keyboard.up('e');
await p.screenshot({ path: 'toy-side-driving.png' });
console.log(JSON.stringify({ mode: await p.evaluate(() => document.body.dataset.mode), errs }));
await b.close();
```
Serve + run. Expected: `{"mode":"toy","errs":[]}`. **Read `toy-side-idle.png` and `toy-side-driving.png`**: sky/sun/ground/tractor visible; the two frames differ (clouds + bushes scrolled, wheels rotated). Tune primitive offsets if the tractor sits off the ground line or clips, then re-run.

- [ ] **Step 4: Commit**

```bash
git add src/toy.js
git commit -m "feat: toy-mode side view with rolling wheels, parallax and sky"
```

---

### Task 6: Start-screen content — toy instructions + view picker

**Files:**
- Modify: `index.html` (rewrite instructions; add the toy view-picker row)
- Modify: `src/main.js` (wire the view picker to `localStorage['brrrm-toyview']`)

**Interfaces:**
- Consumes: `localStorage['brrrm-toyview']` (`'top'|'side'`, read by `launch('toy')` in Task 4).
- Produces: two `.toyBtn` buttons that persist the chosen view and show a `sel` highlight; toy-oriented instruction rows.

- [ ] **Step 1: Rewrite the instructions and add the view picker in `index.html`**

Replace the `#instructions` block:
```html
  <div id="instructions">
    <div>📱 TILT TO DRIVE</div>
    <div>🫨 SHAKE IT!</div>
    <div>👆🚜 BEEP BEEP</div>
    <div>👆🌱 DROP A SURPRISE</div>
    <div>🎤 YELL BRRRM!</div>
  </div>
```
with:
```html
  <div id="instructions">
    <div>📱 PUSH ME AROUND</div>
    <div>🫨 SHAKE ME!</div>
    <div>👆 TAP MY PARTS</div>
    <div>🙃 FLIP = STALL</div>
    <div>🎤 YELL BRRRM!</div>
  </div>
  <div id="toyviews">
    <button class="toyBtn" data-toyview="top">⬇ TOP</button>
    <button class="toyBtn" data-toyview="side">➡ SIDE</button>
  </div>
```

- [ ] **Step 2: Add view-picker CSS in `index.html`**

After the `.sizeBtn.sel` rule in the `<style>` block, add:
```css
  #toyviews { display:flex; gap:4vmin; }
  .toyBtn { font-family:inherit; font-size:4vmin; font-weight:bold; padding:2vmin 4vmin;
            color:#deeed6; background:#14212c; border:0.6vmin solid #757161; cursor:pointer; }
  .toyBtn.sel { border-color:#dad45e; background:#442434; }
```

- [ ] **Step 3: Wire the picker in `src/main.js`**

Directly after the size-picker `for (const b of sizeBtns) { ... }` loop, add:
```js
// Toy view picker (top-down vs side); remembered across launches.
const toyBtns = [...document.querySelectorAll('.toyBtn')];
const savedToyView = localStorage.getItem('brrrm-toyview') || 'top';
for (const b of toyBtns) {
  b.classList.toggle('sel', b.dataset.toyview === savedToyView);
  b.addEventListener('click', () => {
    localStorage.setItem('brrrm-toyview', b.dataset.toyview);
    for (const o of toyBtns) o.classList.toggle('sel', o === b);
  });
}
```

- [ ] **Step 4: Syntax + unit tests**

Run: `node --check src/main.js && node --test`
Expected: no syntax error; `# pass 10`, `# fail 0`.

- [ ] **Step 5: Headless check — picker persists and selects the side scene**

Write `/private/tmp/claude-502/-Users-admin-Development-brrrm/2475cc5e-cb3b-4b9a-a2ec-ff7510d3a37b/scratchpad/picker-smoke.mjs`:
```js
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 700 });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8000/', { waitUntil: 'networkidle2' });
await p.click('.toyBtn[data-toyview="side"]');
const stored = await p.evaluate(() => localStorage.getItem('brrrm-toyview'));
const selText = await p.$eval('.toyBtn.sel', el => el.textContent.trim());
await p.click('#start');
await new Promise(r => setTimeout(r, 400));
await p.screenshot({ path: 'picker-side.png' });
console.log(JSON.stringify({ stored, selText, mode: await p.evaluate(() => document.body.dataset.mode), errs }));
await b.close();
```
Serve + run. Expected: `{"stored":"side","selText":"➡ SIDE","mode":"toy","errs":[]}`. **Read `picker-side.png`** — it must show the side view (sky + ground), confirming the picker routed the scene.

- [ ] **Step 6: Commit**

```bash
git add index.html src/main.js
git commit -m "feat: toy-mode start-screen instructions and top/side view picker"
```

---

### Task 7: Engine-brick build notes + PWA cache bump

**Files:**
- Create: `docs/case-ideas.md`
- Modify: `sw.js` (bump `CACHE` to `brrrm-v3`)
- Modify: `README` link is not required; no other files.

**Interfaces:**
- Consumes: nothing runtime. This task finalizes the deploy artifacts.
- Produces: the build-notes doc; a bumped SW cache so installed phones fetch the v2 code.

- [ ] **Step 1: Write `docs/case-ideas.md`**

```markdown
# Brrrm engine-brick — build notes (household materials)

Turn a phone into a push-along tractor. The app's engine sound follows how hard the
toy is pushed (the accelerometer feels the rolling vibration), so a plain wooden or
cardboard body suddenly has a living engine and a glowing cab.

## Mounting principle: phone lies FLAT, screen up

- Put the phone screen-up on a flat base. Border it with a low wall so it can't slide
  out, and let the wall **overhang the edges of the phone slightly** to trap it — no
  clamp needed, low centre of gravity, survives drops.
- Leave one **gap in the wall at the speaker end** so the sound fires out, not into a
  wall.
- Portrait orientation matches the app (the installed PWA locks to portrait).
- The app calibrates "level" at START, so the exact mounting angle doesn't matter.

## Duplo / LEGO build

1. Base: a flat plate at least as big as the phone.
2. Wall: a one-brick-high border around the phone; use the offset stud rows so the top
   lip overhangs the bezel by a few mm. Pad the inner walls with foam tape.
3. Body: build a hood in front and a driver/seat behind so the screen reads as the cab
   window. Leave the speaker corner open.
4. Wheels: the biggest Duplo wheels you have. On a hard floor they produce exactly the
   rolling vibration the engine sound feeds on — push slow for a chug, fast for a roar.

## Cardboard build

1. Chassis: a shallow box a little larger than the phone.
2. Lips: tape cardboard strips over the top edges so they overhang and hold the phone;
   cut a window so the whole screen shows; cut the speaker corner open.
3. Wheels: jar lids or wooden discs on bamboo-skewer axles through the box.
4. **Clunky wheels are a feature** — the bumpier they roll, the louder the engine. Perfectly
   smooth wheels make a quiet engine.

## Padding & safety

- Foam or EVA around all four inner walls; a strip under the phone too.
- Keep the screen window uncovered and the speaker gap clear.
- For toddlers, turn on Guided Access (iOS) or App Pinning (Android) so they can't tap
  out of the toy.
```

- [ ] **Step 2: Bump the service-worker cache**

In `sw.js`, change:
```js
const CACHE = 'brrrm-v2'; // bump this on every deploy
```
to:
```js
const CACHE = 'brrrm-v3'; // bump this on every deploy
```
(`src/toy.js` is already in PRECACHE from Task 4.)

- [ ] **Step 3: Verify precache list + offline still works**

Run: `node --check sw.js && grep -n "brrrm-v3\|src/toy.js" sw.js`
Expected: no syntax error; both `brrrm-v3` and `src/toy.js` present.

Then an offline headless check — write `/private/tmp/claude-502/-Users-admin-Development-brrrm/2475cc5e-cb3b-4b9a-a2ec-ff7510d3a37b/scratchpad/offline-smoke.mjs`:
```js
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8000/', { waitUntil: 'networkidle2' });
await p.goto('http://localhost:8000/', { waitUntil: 'networkidle2' }); // 2nd load: SW controls
const reg = await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active);
await p.setOfflineMode(true);
await p.reload({ waitUntil: 'networkidle2' });
const stillThere = await p.$('#start') !== null;
console.log(JSON.stringify({ swActive: reg, offlineStart: stillThere, errs }));
await b.close();
```
Serve + run. Expected: `{"swActive":true,"offlineStart":true,"errs":[]}`.

- [ ] **Step 4: Commit**

```bash
git add docs/case-ideas.md sw.js
git commit -m "docs: engine-brick build notes; bump SW cache to brrrm-v3"
```

---

### Task 8: Deploy + on-device verification

**Files:**
- Modify: `docs/superpowers/specs/2026-07-04-brrrm-toy-mode-design.md` (status → Shipped v2 at the end)

**Interfaces:**
- Produces: v2 live at `https://reljapetrovic.github.io/brrrm/`.

- [ ] **Step 1: Merge the branch to main and push**

(Run from the repo root, feature branch already reviewed.)
```bash
node --test    # 10/10 green
git checkout main && git merge --no-ff <feature-branch> -m "Merge: Brrrm v2 toy mode"
git push
```

- [ ] **Step 2: Wait for the Pages build, then verify the live deploy serves v3**

```bash
until curl -s "https://reljapetrovic.github.io/brrrm/sw.js?v=$RANDOM" | grep -q "brrrm-v3"; do sleep 10; done
echo "live"
```
If the Pages build stalls in "building" for several minutes, nudge it: `gh api repos/reljapetrovic/brrrm/pages/builds -X POST` (a queued rebuild typically finishes in under a minute).

- [ ] **Step 3: Live headless smoke**

Point `toy-smoke.mjs` (Task 4) at `https://reljapetrovic.github.io/brrrm/` instead of localhost and run it. Expected: `{"tapMode":"toy","longPressMode":"field","errs":[]}`.

- [ ] **Step 4: On-device checklist (the human runs this)**

On a real phone at the live URL:
1. Quick tap START → engine idles immediately (audio unlock works on the tap).
2. Carry / wiggle the phone → engine revs with motion; set it still → settles to idle.
3. **Push-along test:** slide the phone (or the brick) across a hard floor → engine follows push speed.
4. Tilt forward/back → revs / reverse *beep beep*; roll sideways → lean + squeak; fast twist → screech; shake → rattle + backfire.
5. Flip face-down → sputter-stall; flip back → cough-restart.
6. Tap cab → horn; tap headlights → beams toggle; tap a wheel → squeak; tap exhaust → smoke cough.
7. 🎤 → allow → yell "BRRRM" → revs; 🎤 off → OS mic indicator clears.
8. **Long-press START ~2 s** (ring fills) → field mode (v1) still works; quick tap never reaches it.
9. Add to Home Screen → portrait, fullscreen; airplane-mode relaunch → still plays.

- [ ] **Step 5: Mark the spec shipped**

Change the spec's `**Status:**` line to `Shipped v2 — live at https://reljapetrovic.github.io/brrrm/`, then:
```bash
git add docs/ && git commit -m "docs: mark toy-mode spec shipped" && git push
```

- [ ] **Step 6: Feel-tuning pass (on device)**

Tune on the phone, then bump `CACHE` to `brrrm-v4` and push (the cache bump is required on every deploy):

| Feels wrong | Constant | File | Default |
|---|---|---|---|
| Engine ignores gentle pushes / too jumpy | `ENERGY_FULL` | `src/mapping.js` | 12 |
| Engine cuts out between floor bumps | `ENERGY_RELEASE_TAU` | `src/mapping.js` | 0.4 |
| Flip-stall triggers on tilt / too sticky | `FACEDOWN_ON` / `FACEDOWN_OFF` | `src/mapping.js` | -6 / -3 |
| Screech on every little turn | `TWIST_THRESHOLD` | `src/toy.js` | 3.5 |
| Ground scrolls too fast/slow | `SCROLL_SPEED` | `src/toy.js` | 90 |
| Part taps miss | `partAt` zones | `src/toy.js` | — |

---

## Post-plan notes for the implementer

- **Order matters** — tasks build on each other. `main.js` is fully rewritten in Task 4; `toy.js` gains its side view in Task 5.
- **Field mode is never touched.** If a change would alter v1 field behaviour, stop and report it — toy mode is purely additive around it.
- **iOS quirks live in two places** (unchanged from v1): permission request and audio unlock, both in the START gesture in `main.js`. If sensors don't respond on iPhone, look there, not in the mapping math.
- **Art is tuned by screenshot** (Tasks 4–5). The provided sprites/primitives are correct and runnable; expect to nudge offsets and hit-zones after looking at the rendered PNGs.
- **Adding vehicle #2 to toy mode later** (roadmap): a second scene variant or a `soundProfile`-driven part set; not in this plan.





