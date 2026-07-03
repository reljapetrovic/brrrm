// The tractor: v1's one and only vehicle.
import { compileSprite } from '../renderer.js';
import { rpmFromSpeed } from '../mapping.js';

const MAX_SPEED = 55;  // world px/s
const TURN_RATE = 2.4; // rad/s at full steer

// 16×16 top-down, facing up. Edit freely — it's just text.
const BODY = compileSprite([
  '......0660......',
  '..00..6666..00..',
  '..03..6ee6..30..',
  '..00..6666..00..',
  '......6666......',
  '.....066660.....',
  '.....066660.....',
  '....06666660....',
  '000.06699660.000',
  '003.06699660.300',
  '003.06666660.300',
  '003.06666660.300',
  '000.06666660.000',
  '....00666600....',
  '......0770......',
  '................',
]);

export const tractor = {
  name: 'tractor',
  perspective: 'top',
  // Any entry can be swapped for a recording: horn: { sample: 'assets/sfx/horn.wav' }
  soundProfile: {
    engine: 'synth', horn: 'synth', splat: 'synth', burst: 'synth',
    backfire: 'synth', plop: 'synth', squawk: 'synth',
  },
  state: null,

  reset() {
    this.state = { x: 0, y: 0, heading: 0, speed: 0, bounce: 0, smokeTimer: 0 };
  },

  update(input, world, dt) {
    const s = this.state;
    const events = [];

    // Throttle: tilt away = forward. Speed eases toward target — tractors are heavy.
    const target = input.tilt.y * MAX_SPEED * (1 + input.micLevel * 0.6);
    s.speed += (target - s.speed) * Math.min(1, 3 * dt);

    // Steering only bites when moving, and flips in reverse, like a real vehicle.
    const grip = Math.max(-1, Math.min(1, s.speed / (MAX_SPEED * 0.4)));
    s.heading += input.tilt.x * TURN_RATE * grip * dt;

    s.x += Math.sin(s.heading) * s.speed * dt;
    s.y -= Math.cos(s.heading) * s.speed * dt;

    if (Math.abs(s.speed) > 5) world.addTrail(s.x, s.y, s.heading);

    // Exhaust puffs from the pipe, faster at high rpm, bigger when yelled at.
    s.smokeTimer -= dt;
    if (s.smokeTimer <= 0) {
      s.smokeTimer = 0.5 - this.rpm(input) * 0.35;
      world.smoke(s.x - Math.sin(s.heading) * 6, s.y + Math.cos(s.heading) * 6,
                  input.micLevel > 0.4);
    }

    if (input.shake) {
      s.bounce = 0.4;
      world.smoke(s.x, s.y, true);
      events.push({ type: 'backfire', x: s.x, y: s.y });
    }
    s.bounce = Math.max(0, s.bounce - dt);

    return events;
  },

  rpm(input) {
    return Math.min(1, rpmFromSpeed(this.state.speed, MAX_SPEED) + input.micLevel * 0.5);
  },

  draw(r) {
    const s = this.state;
    const wobble = s.bounce > 0 ? Math.sin(s.bounce * 40) * 0.08 : 0;
    r.sprite(BODY, s.x, s.y, s.heading + wobble);
  },

  isHit(wx, wy) {
    return Math.hypot(wx - this.state.x, wy - this.state.y) < 12;
  },
};
