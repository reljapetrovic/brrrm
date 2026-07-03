# Brrrm — Design Spec

**Date:** 2026-07-03
**Status:** Approved pending user review
**Brief:** [Brrrm.md](../../../Brrrm.md)

## Overview

Brrrm is a mobile web toy for kids: an 8-bit, 90s-styled vehicle simulator that maps
the phone's real sensors to vehicle behaviour. Tilt the phone to drive a pixel tractor
around an endless farm field; every input produces an immediate, exaggerated
audiovisual reaction. It is a toy, not a game: no score, no failure, no text, no menus
during play.

Version 1 ships one vehicle (tractor, top-down perspective) on an architecture where
each additional vehicle (excavator, bulldozer, concrete mixer, car) is a single new
definition file, in either top-down or side-on perspective.

### Goals

- Fun for mixed ages: toddler-simple cause-and-effect baseline; older kids find depth
  through sensor combos (J-turns, backfire drifts, bale slaloms).
- Works on both iOS and Android phones, served over HTTPS.
- 8-bit look and sound: low-res pixel art, procedurally synthesized chiptune audio.
- Installable and offline-capable (PWA): home-screen icon, fullscreen, plays in the car.
- Expandable: adding a vehicle touches one new file plus a registry entry.

### Non-goals (v1)

- More than one vehicle, vehicle-picker UI, side-view content (the camera mode exists
  but is unexercised), day/night or seasons, any backend, any analytics.

## The experience

The page loads to a chunky pixel **BRRRM!** title over a giant pulsing **START ENGINE**
button. That single tap does all the invisible adult work:

1. Requests iOS motion permission (`DeviceMotionEvent.requestPermission()`).
2. Unlocks Web Audio (resume the AudioContext) and starts the engine idle.
3. Requests a screen wake lock and fullscreen.
4. **Calibrates neutral tilt** to however the phone is held at that moment, so the
   kid's natural grip is "level".

Then play begins: a top-down pixel tractor centered on screen in an endless scrolling
farm field (grass, dirt patches, mud puddles, hay bales, occasional chickens).

### Sensor → behaviour mapping (tractor, v1)

| Input | Behaviour |
|---|---|
| Tilt away/toward you | Throttle forward/reverse; engine chug pitch rises with speed |
| Tilt left/right | Steering; tractor sprite rotates, world scrolls around it |
| Driving anywhere | Persistent plough/tyre trails in the field |
| Driving over props | Hay bales burst, mud splashes with a squelch, chickens flap away |
| Tap the tractor | Horn ("beep beep!") |
| Tap the ground | A prop (random pick: mud puddle or hay bale) plops down there — something new to drive over |
| Shake the phone | Tractor bounces, rattles, exhaust backfires with a smoke puff |
| Mic level (opt-in) | Yelling "BRRRM!" revs the engine harder, bigger exhaust puffs |
| Vibration (Android only) | Gentle rumble tied to engine RPM |

### Always-visible UI

Exactly two small corner buttons: 🔇 mute (state persists in `localStorage`) and
🎤 mic-mode toggle. The mic asks for its own permission only when its button is
tapped — permission prompts are never stacked on the first tap.

## Architecture

Zero-build, zero-dependency vanilla web app. Repo root is the existing `brrrm/`
folder (git-initialized; `.obsidian/` and `.DS_Store` gitignored; the Obsidian notes
live alongside the code as project docs). GitHub Pages serves the repo root →
playable at `https://<user>.github.io/brrrm/`.

```
index.html              shell + start screen + PWA registration
manifest.webmanifest    home-screen icon, fullscreen display mode
sw.js                   cache-first service worker → offline play
src/
  main.js               boot, permission/calibration flow, game loop
  sensors.js            sensor bus (see below)
  audio.js              Web Audio engine: synth patches + optional sample playback
  renderer.js           low-res canvas (~160×240; exact size tuned on
                        device during implementation) scaled up with
                        image-rendering: pixelated; camera with two modes:
                        top-down and side-on
  world.js              tile field, props, trails, particles
  vehicles/
    tractor.js          vehicle definition
assets/
  sfx/                  optional .wav/.mp3 sound overrides (empty in v1)
```

### The vehicle contract

A vehicle is one file exporting a plain object:

```js
{ name, perspective: 'top' | 'side', sprites, soundProfile, update(input, world, dt) }
```

Sprites are hand-drawn pixel art embedded as palette-indexed string arrays in the
file — editable in any text editor, a genuinely 8-bit workflow. The engine knows
nothing about tractors; adding the excavator later means adding
`vehicles/excavator.js` with `perspective: 'side'` and registering it in a list.
Both camera modes exist from day one; only top-down is exercised by v1.

### The sensor bus (`sensors.js`)

Hides every platform difference (iOS permission API, iOS/Android orientation sign
conventions, missing sensors) and emits one normalized input-state object per frame:

```js
{ tilt: {x, y}, shake, taps, micLevel }
```

Tilt is relative to the neutral orientation captured at START ENGINE. Vehicles only
ever read this object. A keyboard/mouse shim feeds the same bus (arrow keys = tilt,
spacebar = shake, click = tap), so the whole game is playable and debuggable in a
desktop browser.

## Sound

**Synthesized by default, sample files optional.** Every sound a vehicle makes is
named in its `soundProfile` and resolves through one interface in `audio.js`:
one-shot events (`horn`, `splat`, `backfire`) and continuous loops (`engine`) whose
intensity follows RPM.

- **Synth (default, all v1 sounds):** the engine is two detuned square/saw
  oscillators through a lowpass filter with a slow LFO for the diesel *chug-chug*;
  RPM maps to pitch and LFO rate. Noise bursts shaped by envelopes make splats,
  bale-bursts, and backfires. The horn is a two-note square-wave stab.
- **Samples (optional override):** a `soundProfile` entry may instead reference a
  file, e.g. `{ sample: 'assets/sfx/horn.wav' }`. Samples are fetched and decoded to
  AudioBuffers when the vehicle loads and played through the same output chain.
  Loop sounds use a looping buffer source whose `playbackRate` tracks RPM the same
  way synth pitch does. The service worker caches `assets/sfx/`, so sample-backed
  sounds still work offline. v1 ships zero sample files — the code path and folder
  exist so a .wav/.mp3 can be dropped in and referenced later.

Everything runs through one master gain (the mute button) followed by a limiter so
output never clips into harshness.

## Fallbacks & error handling

- **Motion permission denied / no sensors (desktop):** automatic fallback to
  touch-drag steering (drag from the tractor acts as a virtual joystick). The toy
  always works; sensors make it better.
- **Mic:** strictly opt-in via its button; denied or absent means the feature is
  quietly off.
- **Vibration:** absent on iOS; skipped silently.
- **Orientation:** portrait-first, works in landscape; tilt math derives from the
  calibrated neutral, so grip angle doesn't matter.
- **Sensor silence:** the sensor bus watches for DeviceMotion going quiet (some
  Android browsers stop emitting) and falls back to touch steering instead of
  freezing.

## Testing

- Mapping math (tilt→steering curves, shake-detection thresholds, RPM→pitch) lives
  in pure functions with `node --test` unit tests.
- The desktop keyboard/mouse shim is the daily development harness.
- Real-device smoke tests on one iPhone and one Android via the GitHub Pages deploy.
- On-device feel-tuning (tilt sensitivity especially) is an explicit final
  implementation step, not an afterthought.

## Deployment

GitHub repository with Pages enabled on the main branch, root directory. Deploy is
`git push`. The service worker uses a versioned cache name bumped on deploy so
updates propagate.

## Roadmap (post-v1)

Excavator (side view), bulldozer, concrete mixer, car; vehicle-picker screen;
possible extras: day/night, seasons, more field props.
