# Brrrm v2 — Toy Mode Design Spec

**Date:** 2026-07-04
**Status:** Draft pending user review
**Supersedes the default experience of:** [v1 spec](2026-07-03-brrrm-design.md) (field mode lives on behind a parent gesture)

## Overview

v1 drifted game-ward: a world to navigate, props to hit, a camera to follow. v2
reframes Brrrm as a **toy for small kids**: the phone *becomes* the tractor. One big
reactive tractor fills the screen; physically handling the phone — and above all
**pushing it across the floor inside a home-built toy body (the "engine brick")** —
drives sound and animation. No goals, no navigation, no score, no fail.

Toy mode is the default. The v1 field mode remains, unchanged, behind a
parent-only long-press.

### Goals

- Pure cause-and-effect: every physical action gets an immediate, exaggerated
  audiovisual reaction. A 2-year-old needs zero instruction.
- Designed first for the **flat mount**: phone lying screen-up, bordered by bricks
  with a slight edge overhang, pushed along the floor.
- Two selectable toy views (start screen): **top-down "window through the toy"**
  (default, for the brick) and **side view** (for in-hand play).
- All reactions work handheld too — the brick enhances, never gates.
- Keep everything that made v1 solid: zero deps, palette-only art, synth-first
  audio with sample overrides, no readable text during play, PWA offline.

### Non-goals (v2)

- No automatic view detection (explicit picker instead).
- No changes to field mode, no landscape sensor remap, no new field features.
- No 3D-printed case designs (household materials only).
- No multiplayer, recording, or anything network-shaped. It's a toy.

## The experience

### Start screen

- Title, then five rewritten instruction rows (emoji + short words):
  📱 PUSH ME AROUND · 🫨 SHAKE ME! · 👆 TAP MY PARTS · 🙃 FLIP = STALL · 🎤 YELL BRRRM!
- **View picker** (new row, two buttons): ⬇ TOP (default) / ➡ SIDE. Persisted in
  `localStorage['brrrm-toyview']`.
- Size picker row stays but applies to **field mode only** (toy tractor is always huge).
- **Tap START ENGINE** → toy mode in the chosen view (same permission/audio/wake-lock/
  calibration flow as v1 — calibration makes any mounting angle "level").
- **Long-press START ENGINE ~2 s** (filling ring animation) → field mode (v1
  experience, untouched). A quick toddler tap can never land here.

### Toy-mode reactions (both views)

| Physical action | Reaction |
|---|---|
| Still | Idle *putt-putt*; lazy exhaust puffs; 1-px chassis tremble |
| **Any motion — above all rolling vibration when pushed on the floor** | **Motion energy → RPM**: chug → roar; wheels spin with blur frames; ground scrolls with RPM |
| Tilt forward (handheld) | Revs up |
| Tilt back (handheld) | Reverse mode: truck *beep… beep…*, ground scrolls the other way |
| Roll sideways | Tractor leans on suspension; spring squeak |
| Fast twist | Tyre screech |
| Shake | Cartoon rattle-apart: fenders flap, bolts pop, backfire bang |
| Flip face-down | Engine sputters, stalls |
| Flip back up | Cough-cough-VROOM restart |
| Tap a wheel | Squeak + spin burst |
| Tap the cab | Horn |
| Tap the headlights | Beams toggle on/off |
| Tap the exhaust | Smoke cough |
| Mic mode (🎤 opt-in, unchanged) | Yelling revs the engine |

### The two views

- **Top-down window (default; flat/brick):** a big top-down tractor (~75% of screen
  width) drawn as if the toy were transparent — the ground scrolls *underneath it*
  at RPM speed, so pushing the brick makes the ground visibly rush by. Exhaust smoke
  puffs "toward" the viewer (grows + fades); headlight beams sweep up-screen.
- **Side view (handheld):** tractor on a ground strip, sky with sun and drifting
  clouds, parallax bushes/fence posts scrolling with RPM; wheels, bouncing driver,
  and exhaust stack all visible in profile.

Same reaction set, same sounds, same hit-zones concept; only the art and layout
differ.

## Architecture

Additive; field mode's code path is untouched.

```
src/toy.js            NEW — toy-mode scene: both views, layered sprites (body,
                      wheels, driver, exhaust, lights), sky/ground, part
                      hit-zones, sensor→reaction wiring
src/mapping.js        + pure, tested math:
                        createEnergyMeter() — smoothed high-frequency accel
                          magnitude (band-passes out gravity and slow tilt)
                        rpmFromEnergy(energy) — idle-floored curve
                        isFaceDown(gravityZ) — hysteresis flip detector
src/sensors.js        + poll() gains motionEnergy (0..1), rotRate (rad/s),
                      faceDown (boolean); devicemotion rotationRate captured
src/audio.js          + synth patches: reverseBeep, squeak, screech, rattle,
                      sputterStall, startCough (same single interface;
                      sample-overridable like every other sound)
src/main.js           start-screen wiring (view picker, long-press gate with
                      ring), mode routing: toy loop vs field loop
docs/case-ideas.md    NEW — engine-brick build notes (below)
sw.js                 PRECACHE += src/toy.js; CACHE bump on deploy
```

Renderer, world.js, vehicles/ (field tractor), PWA layer: unchanged.

## The engine brick (household materials)

Shipping as `docs/case-ideas.md`, roughly:

- **Mounting principle: phone lies flat, screen up.** Base plate under it, brick
  border around it, border overhangs the bezel slightly to trap it (Duplo:
  offset-stud overhang; cardboard: taped lips). No clamping force, low center of
  gravity, drop-tolerant.
- **Leave a border gap at the speaker edge** so sound fires out unmuffled.
- **Duplo build:** plate + border + tractor body built around the screen (hood in
  front, driver behind); big Duplo wheels on hard floor produce exactly the rolling
  vibration the RPM mapping feeds on.
- **Cardboard build:** box chassis, sleeve lips over the phone, wheels from jar
  lids/wooden discs on skewer axles. *Clunky wheels are a feature* — smoother
  wheels, quieter engine.
- Foam/EVA padding all around; screen window uncovered; calibration at START
  absorbs any mounting angle.

## Fallbacks

- No motion sensors / permission denied: engine idles, all touch reactions work;
  RPM can be driven by holding a finger down and wiggling it (touch-move energy).
- Desktop dev shim: arrows = tilt, Space = shake, **E held = motion energy,
  F = flip face-down toggle**.
- Mic remains strictly opt-in; vibration remains Android-only, tied to RPM as in v1.

## Testing

- `node --test` (bare form — Node 26) covers createEnergyMeter, rpmFromEnergy,
  isFaceDown: still/gentle/pushed/shaken traces, hysteresis edges, idle floor.
- Headless-Chrome smoke: toy mode boots in both views with zero errors; part taps
  trigger sounds; long-press START reaches field mode; quick tap never does.
- Feel-tuning table gains rows: energy band-pass constants, energy→RPM curve, flip
  hysteresis. Final tuning happens with a real cardboard/Duplo prototype on a hard
  floor.

## Rollout

Deploy = push to main + bump `CACHE` in sw.js (brrrm-v3). Installed phones update
on the second launch after the CDN refreshes (~10 min).

## Roadmap (post-v2)

Auto view detection (flat vs upright grip), landscape remap for a steering-wheel
mount, engine-room "under the hood" tap view, more vehicles in toy mode
(excavator arm drag!), optional recorded-sample sound packs per vehicle.
