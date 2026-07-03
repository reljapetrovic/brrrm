// TEMPORARY demo boot — replaced by the real game loop in a later task.
import { createRenderer, compileSprite } from './renderer.js';
import { createSensorBus } from './sensors.js';
import { createAudioEngine } from './audio.js';

const renderer = createRenderer(document.getElementById('game'));
const bus = createSensorBus();
const audio = createAudioEngine();

document.getElementById('start').addEventListener('click', () => {
  audio.init();
  audio.startEngine();
  document.getElementById('overlay').style.display = 'none';
  bus.attachTouch(document.getElementById('game'));
  bus.attachKeyboardShim();
});

// Demo keys: H horn, J splat, K burst, L squawk, P plop (Space = shake → backfire)
window.addEventListener('keydown', (e) => {
  const map = { h: 'horn', j: 'splat', k: 'burst', l: 'squawk', p: 'plop' };
  if (map[e.key]) audio.play(map[e.key]);
});

const smiley = compileSprite([
  '..eeee..',
  '.eeeeee.',
  'ee0ee0ee',
  'eeeeeeee',
  'e0eeee0e',
  'ee0000ee',
  '.eeeeee.',
  '..eeee..',
]);

const pos = { x: 0, y: 0 };
let speed = 0, flash = 0, last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const input = bus.poll(dt);
  pos.x += input.tilt.x * 60 * dt;
  pos.y -= input.tilt.y * 60 * dt;
  speed = Math.hypot(input.tilt.x, input.tilt.y);
  audio.setEngineIntensity(0.15 + speed * 0.85);
  if (input.shake) { flash = 0.2; audio.play('backfire'); }
  flash = Math.max(0, flash - dt);

  renderer.follow(pos.x, pos.y);
  renderer.clear(flash > 0 ? 6 : 5);
  for (let ty = -20; ty < 20; ty++) for (let tx = -20; tx < 20; tx++) {
    if ((tx + ty) % 2 === 0) renderer.rect(tx * 16, ty * 16, 16, 16, 11);
  }
  renderer.sprite(smiley, pos.x, pos.y);
}
requestAnimationFrame(frame);
