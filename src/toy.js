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
