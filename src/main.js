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
  try { await navigator.wakeLock?.request('screen'); } catch {}
  try { await document.documentElement.requestFullscreen?.(); } catch {}
  setTimeout(() => bus.calibrate(), 300);
  bus.attachTouch(canvas);
  bus.attachKeyboardShim();

  if (mode === 'field') {
    await audio.loadProfile(vehicle.soundProfile); // decode any engine sample BEFORE startEngine picks synth vs sample
    audio.startEngine();
    vehicle.reset();
    world.seed(0, 0);
    renderer.setView(parseInt(localStorage.getItem('brrrm-view'), 10) || 64); // fresh, not the load-time value
    renderer.camera.mode = 'top';
  } else {
    audio.startEngine(); // toy mode: synth-only, no profile to load
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
