// TEMPORARY demo boot — replaced by the real game loop in a later task.
import { createRenderer, compileSprite } from './renderer.js';
import { createSensorBus } from './sensors.js';

const renderer = createRenderer(document.getElementById('game'));
const bus = createSensorBus();
document.getElementById('overlay').style.display = 'none'; // demo only
bus.attachTouch(document.getElementById('game'));
bus.attachKeyboardShim();

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
let flash = 0, last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const input = bus.poll(dt);
  pos.x += input.tilt.x * 60 * dt;
  pos.y -= input.tilt.y * 60 * dt;
  if (input.shake) flash = 0.2;
  flash = Math.max(0, flash - dt);
  for (const tap of input.taps) console.log('tap', renderer.screenToWorld(tap.px, tap.py));

  renderer.follow(pos.x, pos.y);
  renderer.clear(flash > 0 ? 6 : 5);
  for (let ty = -20; ty < 20; ty++) for (let tx = -20; tx < 20; tx++) {
    if ((tx + ty) % 2 === 0) renderer.rect(tx * 16, ty * 16, 16, 16, 11);
  }
  renderer.sprite(smiley, pos.x, pos.y);
}
requestAnimationFrame(frame);
