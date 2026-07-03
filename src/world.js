// Endless procedural field, props to drive over, tyre trails, particles.
import { compileSprite } from './renderer.js';

export const TILE = 16;

const SPRITES = {
  bale: compileSprite([
    '..eeeeeeee..',
    '.e99e99e99e.',
    'ee9ee9ee9eee',
    'e99e99e99e9e',
    'ee9ee9ee9eee',
    'e99e99e99e9e',
    'ee9ee9ee9eee',
    '.e99e99e99e.',
    '..eeeeeeee..',
  ]),
  puddle: compileSprite([
    '...444444...',
    '..44444444..',
    '.4444444444.',
    '444444444444',
    '.4444444444.',
    '..44444444..',
    '....4444....',
  ]),
  chicken: compileSprite([
    '...ff...',
    '..ffff..',
    '..ffff9.',
    '.ffffff.',
    'ffffffff',
    '.ffffff.',
    '..f..f..',
    '..9..9..',
  ]),
};

// Deterministic 0..1 hash per tile — the endless field never changes under you.
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

export function createWorld() {
  const props = [];
  const trails = [];
  const particles = [];
  const MAX_TRAILS = 3000;

  return {
    props,

    spawnProp(type, x, y) {
      props.push({ type, x, y, vx: 0, vy: 0, flap: 0, wet: false, dead: false });
    },

    seed(cx, cy) {
      for (let i = 0; i < 14; i++) {
        const type = ['bale', 'puddle', 'chicken'][i % 3];
        const a = Math.random() * Math.PI * 2;
        const d = 60 + Math.random() * 160;
        this.spawnProp(type, cx + Math.cos(a) * d, cy + Math.sin(a) * d);
      }
    },

    addTrail(x, y, heading) {
      trails.push({ x, y, a: heading });
      if (trails.length > MAX_TRAILS) trails.shift();
    },

    burstParticles(x, y, color, n = 12) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 15 + Math.random() * 35;
        particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                         life: 0.5 + Math.random() * 0.4, color });
      }
    },

    smoke(x, y, big = false) {
      particles.push({ x, y, vx: (Math.random() - 0.5) * 8, vy: -12 - Math.random() * 8,
                       life: big ? 1.2 : 0.7, color: big ? 7 : 10 });
    },

    update(dt, v) {
      const events = [];
      for (const p of props) {
        if (p.type === 'chicken') {
          const dx = p.x - v.x, dy = p.y - v.y, d = Math.hypot(dx, dy);
          if (d < 40 && d > 0.01) {
            p.vx = (dx / d) * 45;
            p.vy = (dy / d) * 45;
            p.flap = 0.4;
            if (d < 30 && !p.squawked) {
              p.squawked = true;
              events.push({ type: 'squawk', x: p.x, y: p.y });
            }
          } else {
            p.vx *= 0.9; p.vy *= 0.9;
            if (d > 60) p.squawked = false;
          }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.flap = Math.max(0, p.flap - dt);
        } else if (p.type === 'bale') {
          if (Math.hypot(p.x - v.x, p.y - v.y) < 12 && Math.abs(v.speed) > 8) {
            p.dead = true;
            this.burstParticles(p.x, p.y, 14); // straw
            events.push({ type: 'burst', x: p.x, y: p.y });
          }
        } else { // puddle: persists, splashes on entry
          const d = Math.hypot(p.x - v.x, p.y - v.y);
          if (d < 10 && Math.abs(v.speed) > 8 && !p.wet) {
            p.wet = true;
            this.burstParticles(p.x, p.y, 4, 8); // mud
            events.push({ type: 'splat', x: p.x, y: p.y });
          } else if (d > 16) {
            p.wet = false;
          }
        }
      }
      for (let i = props.length - 1; i >= 0; i--) if (props[i].dead) props.splice(i, 1);
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.life -= dt;
        if (pt.life <= 0) particles.splice(i, 1);
      }
      return events;
    },

    draw(r) {
      const x0 = Math.floor(r.camera.x / TILE), y0 = Math.floor(r.camera.y / TILE);
      const nx = Math.ceil(r.W / TILE) + 1, ny = Math.ceil(r.H / TILE) + 1;
      for (let ty = y0; ty < y0 + ny; ty++) {
        for (let tx = x0; tx < x0 + nx; tx++) {
          const h = hash2(tx, ty);
          r.rect(tx * TILE, ty * TILE, TILE, TILE, h < 0.75 ? 5 : 11); // grass shades
          if (h > 0.93) r.rect(tx * TILE + 4, ty * TILE + 6, 3, 2, 4); // dirt speck
        }
      }
      for (const t of trails) {
        const ox = Math.cos(t.a + Math.PI / 2) * 3, oy = Math.sin(t.a + Math.PI / 2) * 3;
        r.px(t.x + ox, t.y + oy, 4);
        r.px(t.x - ox, t.y - oy, 4);
      }
      for (const p of props) {
        const hop = p.flap > 0 ? -Math.abs(Math.sin(p.flap * 20)) * 2 : 0;
        r.sprite(SPRITES[p.type], p.x, p.y + hop);
      }
    },

    drawParticles(r) {
      for (const pt of particles) r.px(pt.x, pt.y, pt.color);
    },
  };
}
