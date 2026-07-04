// Web Audio engine: synth patches by default, optional per-sound sample overrides.

export function createAudioEngine() {
  let ac = null, master = null, engineNodes = null, engineSample = null;
  const buffers = {};   // sound name → decoded AudioBuffer (sample overrides)
  let muted = localStorage.getItem('brrrm-muted') === '1';

  return {
    get muted() { return muted; },

    init() { // must run inside a user gesture
      if (ac) return;
      ac = new AudioContext();
      ac.resume();
      master = ac.createGain();
      const limiter = ac.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.ratio.value = 12;
      master.connect(limiter).connect(ac.destination);
      master.gain.value = muted ? 0 : 0.6;
    },

    toggleMuted() {
      muted = !muted;
      localStorage.setItem('brrrm-muted', muted ? '1' : '0');
      if (master) master.gain.value = muted ? 0 : 0.6;
      return muted;
    },

    resume() { // belt-and-braces: iOS may suspend the context outside a gesture
      if (ac && ac.state === 'suspended') ac.resume();
    },

    async loadProfile(soundProfile) {
      for (const [name, spec] of Object.entries(soundProfile)) {
        if (spec && spec.sample) {
          const res = await fetch(spec.sample);
          buffers[name] = await ac.decodeAudioData(await res.arrayBuffer());
        }
      }
    },

    startEngine() {
      if (engineNodes || engineSample) return;
      if (buffers.engine) { // sample override: looped buffer, pitch via playbackRate
        const src = ac.createBufferSource();
        src.buffer = buffers.engine;
        src.loop = true;
        const g = ac.createGain();
        g.gain.value = 0.5;
        src.connect(g).connect(master);
        src.start();
        engineSample = { src, g };
        return;
      }
      // Synth diesel: two detuned oscillators → lowpass; square LFO chops the gain (chug).
      const osc1 = ac.createOscillator(); osc1.type = 'square';
      const osc2 = ac.createOscillator(); osc2.type = 'sawtooth'; osc2.detune.value = 18;
      const filter = ac.createBiquadFilter(); filter.type = 'lowpass';
      const g = ac.createGain(); g.gain.value = 0.3;
      const lfo = ac.createOscillator(); lfo.type = 'square';
      const lfoGain = ac.createGain(); lfoGain.gain.value = 0.16;
      lfo.connect(lfoGain).connect(g.gain);
      osc1.connect(filter); osc2.connect(filter);
      filter.connect(g).connect(master);
      osc1.start(); osc2.start(); lfo.start();
      engineNodes = { osc1, osc2, filter, lfo };
      this.setEngineIntensity(0.15);
    },

    setEngineIntensity(rpm) { // 0..1
      if (engineSample) {
        engineSample.src.playbackRate.value = 0.6 + rpm * 1.2;
        return;
      }
      if (!engineNodes) return;
      const t = ac.currentTime;
      engineNodes.osc1.frequency.setTargetAtTime(35 + rpm * 55, t, 0.05);
      engineNodes.osc2.frequency.setTargetAtTime(35 + rpm * 55, t, 0.05);
      engineNodes.lfo.frequency.setTargetAtTime(5 + rpm * 14, t, 0.05);
      engineNodes.filter.frequency.setTargetAtTime(250 + rpm * 900, t, 0.05);
    },

    play(name) {
      if (!ac) return;
      if (buffers[name]) { // sample override
        const src = ac.createBufferSource();
        src.buffer = buffers[name];
        src.connect(master);
        src.start();
        return;
      }
      (SYNTH[name] || SYNTH.plop)(ac, master);
    },
  };
}

// --- one-shot synth building blocks ---

function blip(ac, out, { type = 'square', f0 = 440, f1 = 220, dur = 0.15, vol = 0.4 }) {
  const t = ac.currentTime;
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur);
}

function noise(ac, out, { dur = 0.2, vol = 0.5, filterFrom = 1200, filterTo = 150 }) {
  const t = ac.currentTime;
  const len = Math.ceil(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(filterFrom, t);
  f.frequency.exponentialRampToValueAtTime(filterTo, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t);
}

const SYNTH = {
  horn(ac, out) {
    blip(ac, out, { f0: 392, f1: 392, dur: 0.12, vol: 0.5 });
    setTimeout(() => blip(ac, out, { f0: 523, f1: 523, dur: 0.2, vol: 0.5 }), 130);
  },
  splat(ac, out)    { noise(ac, out, { dur: 0.25, vol: 0.6, filterFrom: 900, filterTo: 100 }); },
  burst(ac, out)    { noise(ac, out, { dur: 0.35, vol: 0.5, filterFrom: 2500, filterTo: 300 }); },
  backfire(ac, out) {
    noise(ac, out, { dur: 0.1, vol: 0.8, filterFrom: 3000, filterTo: 800 });
    blip(ac, out, { f0: 150, f1: 40, dur: 0.25, vol: 0.6 });
  },
  plop(ac, out)     { blip(ac, out, { type: 'sine', f0: 300, f1: 80, dur: 0.18, vol: 0.5 }); },
  squawk(ac, out) {
    blip(ac, out, { f0: 900, f1: 500, dur: 0.1, vol: 0.35 });
    setTimeout(() => blip(ac, out, { f0: 1100, f1: 600, dur: 0.12, vol: 0.3 }), 90);
  },
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
};
