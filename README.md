# Deadcenter — Valorant aim trainer

A local-first browser aim trainer built with TypeScript, Vite, and Three.js. No accounts or backend.

## Run

Requires Node 20.19+ (or 22.12+) and a WebGL2-capable desktop browser. Chrome or Edge is recommended for unadjusted pointer input.

```sh
pnpm install
pnpm dev           # http://localhost:5173
pnpm build         # type-check + production build in dist/
pnpm preview       # serve production build
pnpm test          # input, crosshair, and scenario engine tests
```

For a fresh checkout, npm install and the corresponding npm run commands also work. Avoid mixing npm installation into an existing pnpm node_modules directory.

## Training

- Set Valorant sensitivity, mouse DPI, target count/size/color, and a 30/60/120-second duration.
- Start training captures the pointer. Left click shoots, Escape pauses, and the pause menu supports resume, restart, and returning to settings.
- Targets respawn when hit. Results show hits, accuracy, and hits per second; the last 30 completed sessions are stored locally.
- Optional fullscreen, procedural shot/hit sounds, and a separate gun viewmodel with visual recoil and muzzle flash.
- Crosshair import/export supports the primary `P` section; ADS/sniper sections and unknown keys are preserved. Presets and controls update the pixel overlay live.

## Input and rendering

`radians per count = sensitivity × 0.07 × π / 180`.
DPI only affects the cm/360 readout. Vertical FOV is derived from 103° horizontal at 16:9 and stays fixed across aspect ratios. Use fullscreen 16:9 for the matching horizontal field of view.

Unadjusted movement is requested through Pointer Lock, with OS-adjusted fallback. The HUD reports the accepted request. `pointerrawupdate` is used when exposed, otherwise `mousemove`; only one source is consumed to avoid duplicate deltas. Accumulated movement is applied each frame and immediately before hit testing. A 2D canvas draws the crosshair; the gun has its own scene and camera rendered after clearing depth.

## Structure

- `src/main.ts`: plain DOM controls and session state machine
- `src/game/world.ts`: Three.js room, targets, hit testing, gun
- `src/input/sens.ts`: sensitivity and FOV math
- `src/crosshair/code.ts`: code parsing, encoding, canvas drawing
- `src/settings/store.ts`: validated local settings
- `src/style.css`: responsive dashboard and full-window session layout

## Prototype limits

Hardware raw-input fidelity, high-polling-rate mice, browser/OS scaling, and crosshair rendering against real Valorant screenshots still require manual validation. Pointer Lock may be restricted inside embedded browsers; use standalone Chrome or Edge. Movement/firing-error fields are retained but not simulated. Scenario values are provisional; replay verification, calibration, authentication, and leaderboards are not implemented. Fonts load from Google Fonts with system fallbacks.

## Scenario training (phase one)

The scenario picker includes Dot Wall and 26 JSON-backed drills: six tracking,
six angle-slicing, seven error-fixing, and seven combos. Each definition in
`src/scenario/builtin/` is validated by the Zod schema in `src/scenario/schema.ts`.
Invalid definitions fail during startup instead of silently ignoring bad fields.

- **Tracking:** hold left click for beam damage. Results show contact percentage,
  time-weighted angular error, damage, and time to reacquire contact after direction
  changes. Contact percentage uses all time with an available target, including
  time when the trigger is released; releasing cannot inflate the score.
- **Angles:** use WASD and Shift to walk, slice out from cover, and shoot before
  the bots react. Boxes block both shots and visibility. Jiggle Info requires
  revealing a bot and returning out of sight. Pre-aim results count reveals under
  2° as good placement. Rounds stop at the configured limit or session timer.
- **Error drills:** counter-strafe and stop-shot require movement before each
  scored kill; the speed meter shows the accuracy threshold. Tap Discipline rejects
  bloomed shots; Click Timing rejects shots above 35°/s. Head Height shows a guide
  for 20 seconds. Micro Correction adapts size using the last ten shots. Reaction
  Test adds a new random delay and a 100-point penalty for early clicks.
- **Combos:** the HUD shows each stage. Acquisition in Flick → Track uses the same
  target for the tracking stage. Move/return stages require leaving/returning to
  spawn; hold stages require aim within 2° of the original angle for 0.4 seconds.
  Stage timeouts and bot deaths fail the repetition. Results report stage pass
  counts and average times. Routine duration estimates are upper bounds because
  round/repetition completion can end a drill early.
- **Routines:** Daily warmup, Entry fragger, Anchor / Sentinel, and Fix my errors.
  The latter combines error counts from the last five locally stored sessions,
  chooses matching drills, then fills a four-drill routine with general practice.
  Use **Next routine drill** on results to continue with a fresh pointer capture.
- **Seeds and data:** use New seed for new layouts or retain the seed to reuse
  gameplay randomness. Restart resets the RNG, movement, weapon, stages, and
  analytics. Seeds reproduce random sequences, not a recorded input replay.
  Results export every discrete shot and aggregate beam metrics as JSON. Beam
  contact is integrated continuously rather than fabricated as discrete shots.
  History retains the last 30 completed runs and remains compatible with old runs.

Settings for target count and size apply to Dot Wall; other drills own their target
configuration. Target color, crosshair, and sensitivity work across scenarios.
Escape/blur pauses the simulation and clears movement/trigger input.

### Engine and validation

`src/game/{rng,player,targets,weapon,bots,analytics}.ts` contain the reusable gameplay
systems. `src/scenario/runner.ts` owns simulation, cover visibility, rounds, stages,
and metrics. `src/scenario/playlists.ts` builds routines; `src/ui/results.ts` renders
category-specific feedback. The auto-fire scheduler exists as groundwork, but
recorded recoil and Spray Control (C8), along with crouching, are **not implemented**.

Run `pnpm test` for the original input/crosshair tests plus scenario validation,
seed reproducibility, collision, deceleration, spread recovery, body hitboxes,
occlusion, tracking, bot reaction, combo transitions, reaction penalties, and
feedback/routine tests. `pnpm build` type-checks and produces the production bundle.
The embedded Codex browser may reject Pointer Lock; live mouse testing requires a
standalone desktop browser that supports capture.

### Tuning still required before release

All movement speeds, acceleration, humanoid proportions, spread values, bot reaction
windows, and feedback thresholds are provisional. Over/under-flick labels use
short signed aim trajectories and remain heuristics. Mouse speed is estimated from
consumed input batches. Reacquire lag measures beam contact, not neurological
reaction time. Validate these against recorded Valorant Range clips:

- Run/walk speed, time to stop, and movement accuracy threshold.
- Standing head height, head size, and first-shot accuracy.
- Vandal/Phantom tap-reset times and recorded recoil patterns.
- Easy/medium/hard Range bot reaction times.
