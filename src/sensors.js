// Sensor bus: normalizes device sensors (or fallbacks) into one input state per frame.
import { tiltFromOrientation, createShakeDetector, createEnergyMeter, createFaceDownDetector } from './mapping.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createSensorBus() {
  const shakeDetector = createShakeDetector();
  const energyMeter = createEnergyMeter();
  const faceDownDetector = createFaceDownDetector();
  let raw = { beta: 0, gamma: 0 };  // latest orientation sample
  let neutral = null;               // captured at calibrate()
  let accelMag = 9.81;
  let ax = 0, ay = 0, az = 9.81; // accelerationIncludingGravity vector → motion energy + face-down
  let rotMag = 0;      // rotation-rate magnitude, rad/s
  let lastMotionAt = 0;
  let taps = [];
  let drag = null;                  // touch-steer fallback state
  let mic = null;                   // { analyser, data }
  const kb = { x: 0, y: 0, shake: false, energy: 0, faceDown: false, rot: 0 };

  const bus = {
    mode: 'touch',

    async requestMotion() {
      try {
        // iOS: both events gate on the same permission; request both to be safe.
        for (const Ev of [window.DeviceMotionEvent, window.DeviceOrientationEvent]) {
          if (Ev && typeof Ev.requestPermission === 'function') {
            if (await Ev.requestPermission() !== 'granted') return 'denied';
          }
        }
      } catch {
        return 'denied';
      }
      window.addEventListener('deviceorientation', (e) => {
        if (e.beta === null) return;
        raw = { beta: e.beta, gamma: e.gamma };
        lastMotionAt = performance.now();
        if (bus.mode !== 'motion') {
          bus.mode = 'motion';
          neutral ??= { ...raw };
        }
      });
      window.addEventListener('devicemotion', (e) => {
        const a = e.accelerationIncludingGravity;
        if (a && a.x !== null) { ax = a.x; ay = a.y; az = a.z; accelMag = Math.hypot(ax, ay, az); }
        const rr = e.rotationRate; // deg/s
        if (rr && rr.alpha !== null) {
          rotMag = Math.hypot(rr.alpha || 0, rr.beta || 0, rr.gamma || 0) * Math.PI / 180;
        }
      });
      return 'requested';
    },

    calibrate() { neutral = { ...raw }; },

    attachTouch(el) {
      el.addEventListener('pointerdown', (e) => {
        drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
                 moved: false, t: performance.now() };
      });
      el.addEventListener('pointermove', (e) => {
        if (!drag) return;
        drag.x = e.clientX; drag.y = e.clientY;
        if (Math.hypot(drag.x - drag.x0, drag.y - drag.y0) > 10) drag.moved = true;
      });
      el.addEventListener('pointerup', (e) => {
        if (drag && !drag.moved && performance.now() - drag.t < 300) {
          taps.push({ px: e.clientX, py: e.clientY });
        }
        drag = null;
      });
      el.addEventListener('pointercancel', () => { drag = null; });
    },

    attachKeyboardShim() {
      const keys = {};
      const map = () => {
        kb.x = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0);
        kb.y = (keys.ArrowUp || keys.w ? 1 : 0) - (keys.ArrowDown || keys.s ? 1 : 0);
      };
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
    },

    async enableMic() {
      const ac = new AudioContext(); // created inside the tap, before the permission dialog
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const src = ac.createMediaStreamSource(stream);
        const analyser = ac.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        mic = { stream, ac, analyser, data: new Uint8Array(analyser.frequencyBinCount) };
      } catch (err) {
        ac.close();
        throw err;
      }
    },

    disableMic() {
      if (!mic) return;
      mic.stream.getTracks().forEach((t) => t.stop());
      mic.ac.close();
      mic = null;
    },
    get micEnabled() { return !!mic; },

    poll(dt) {
      // Watchdog: some Android browsers silently stop emitting orientation events.
      if (bus.mode === 'motion' && performance.now() - lastMotionAt > 2000) bus.mode = 'touch';

      let tilt = { x: 0, y: 0 };
      if (bus.mode === 'motion' && neutral) {
        tilt = tiltFromOrientation(raw.beta, raw.gamma, neutral);
      } else if (drag && drag.moved) {
        tilt = {
          x: clamp((drag.x - drag.x0) / 80, -1, 1),
          y: clamp((drag.y0 - drag.y) / 80, -1, 1),
        };
      }
      if (kb.x || kb.y) tilt = { x: kb.x, y: kb.y };

      let shake = shakeDetector.update(accelMag, dt);
      if (kb.shake) { shake = true; kb.shake = false; }

      let micLevel = 0;
      if (mic) {
        mic.analyser.getByteFrequencyData(mic.data);
        let sum = 0;
        for (const v of mic.data) sum += v;
        micLevel = Math.min(1, (sum / mic.data.length) / 90);
      }

      let motionEnergy = energyMeter.update(ax, ay, az, dt);
      if (kb.energy) motionEnergy = Math.max(motionEnergy, kb.energy);
      let rotRate = Math.max(rotMag, kb.rot);
      let faceDown = faceDownDetector.update(az) || kb.faceDown;

      const out = { tilt, shake, taps, micLevel, motionEnergy, rotRate, faceDown };
      taps = [];
      return out;
    },
  };
  return bus;
}
