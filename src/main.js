// TEMPORARY demo boot — replaced by the real game loop in a later task.
import { createRenderer, compileSprite } from './renderer.js';

const renderer = createRenderer(document.getElementById('game'));
document.getElementById('overlay').style.display = 'none'; // demo only: skip start screen

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

let t = 0;
function frame() {
  requestAnimationFrame(frame);
  t += 1 / 60;
  renderer.follow(Math.cos(t) * 30, Math.sin(t) * 30); // camera orbits
  renderer.clear(5);
  for (let ty = -8; ty < 16; ty++) for (let tx = -8; tx < 16; tx++) {
    if ((tx + ty) % 2 === 0) renderer.rect(tx * 16, ty * 16, 16, 16, 11);
  }
  renderer.sprite(smiley, 0, 0, t);
}
requestAnimationFrame(frame);
