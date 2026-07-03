import { createRenderer } from './renderer.js';
import { createSensorBus } from './sensors.js';
import { createAudioEngine } from './audio.js';
import { createWorld } from './world.js';
import { vehicles } from './vehicles/index.js';

const canvas = document.getElementById('game');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start');
const muteBtn = document.getElementById('mute');
const micBtn = document.getElementById('mic');

const renderer = createRenderer(canvas);
const bus = createSensorBus();
const audio = createAudioEngine();
const world = createWorld();
const vehicle = vehicles[0];
renderer.camera.mode = vehicle.perspective === 'side' ? 'side' : 'top';

let running = false;
let vibeTimer = 0;

// Tractor-size picker: zooms the whole world; remembered across launches.
const sizeBtns = [...document.querySelectorAll('.sizeBtn')];
const savedView = parseInt(localStorage.getItem('brrrm-view'), 10) || 64;
renderer.setView(savedView);
for (const b of sizeBtns) {
  b.classList.toggle('sel', parseInt(b.dataset.view, 10) === savedView);
  b.addEventListener('click', () => {
    localStorage.setItem('brrrm-view', b.dataset.view);
    renderer.setView(parseInt(b.dataset.view, 10));
    for (const o of sizeBtns) o.classList.toggle('sel', o === b);
  });
}

startBtn.addEventListener('click', async () => {
  audio.init();               // AudioContext unlock — synchronously first, in this tap
  await bus.requestMotion();  // iOS permission prompt — same tap
  await audio.loadProfile(vehicle.soundProfile);
  audio.startEngine();
  try { await navigator.wakeLock?.request('screen'); } catch {}
  try { await document.documentElement.requestFullscreen?.(); } catch {}
  setTimeout(() => bus.calibrate(), 300); // let the grip settle, then set neutral

  vehicle.reset();
  world.seed(0, 0);
  bus.attachTouch(canvas);
  bus.attachKeyboardShim();

  overlay.style.display = 'none';
  muteBtn.style.display = 'flex';
  micBtn.style.display = 'flex';
  updateMuteIcon();
  running = true;
  window.addEventListener('pointerdown', () => audio.resume());
}, { once: true });

muteBtn.addEventListener('click', () => {
  audio.toggleMuted();
  updateMuteIcon();
});

function updateMuteIcon() {
  muteBtn.textContent = audio.muted ? '🔇' : '🔊';
  muteBtn.classList.toggle('off', audio.muted);
}

micBtn.addEventListener('click', async () => {
  if (bus.micEnabled) {
    bus.disableMic();
    micBtn.classList.add('off');
    return;
  }
  try { // mic permission prompts only here, never at start
    await bus.enableMic();
    micBtn.classList.remove('off');
  } catch {}
});

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!running) return;

  const input = bus.poll(dt);

  // Taps: on the tractor = horn; on the ground = drop something to drive over.
  for (const tap of input.taps) {
    const w = renderer.screenToWorld(tap.px, tap.py);
    if (vehicle.isHit(w.x, w.y)) {
      audio.play('horn');
    } else {
      world.spawnProp(Math.random() < 0.5 ? 'bale' : 'puddle', w.x, w.y);
      audio.play('plop');
    }
  }

  const events = [
    ...vehicle.update(input, world, dt),
    ...world.update(dt, vehicle.state),
  ];
  for (const e of events) audio.play(e.type);

  const rpm = vehicle.rpm(input);
  audio.setEngineIntensity(rpm);

  // Android rumble: short pulse per chug, faster with rpm. No-op on iOS.
  vibeTimer -= dt;
  if (vibeTimer <= 0 && navigator.vibrate) {
    navigator.vibrate(Math.round(10 + rpm * 20));
    vibeTimer = 0.35 - rpm * 0.2;
  }

  renderer.follow(vehicle.state.x, vehicle.state.y);
  renderer.clear(5);
  world.draw(renderer);
  vehicle.draw(renderer);
  world.drawParticles(renderer);
}
requestAnimationFrame(frame);
