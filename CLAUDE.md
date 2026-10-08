# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Deadcenter: a local-first Valorant aim trainer (TypeScript + Vite + Three.js, Zod for validation). No backend. See `README.md` for gameplay/feature details and the list of provisional tuning values.

**Not a Next.js app.** The repo was scaffolded from Create Next App but has been replaced by Vite. `AGENTS.md` (auto-written by `next dev`) and the Next entries in `.gitignore` are leftovers; ignore them. The `app/` dir is empty and `.next/` is stale.

## Commands

```sh
pnpm dev        # vite dev server, http://localhost:5173
pnpm build      # tsc --noEmit && vite build (type-check is part of build)
pnpm preview    # serve dist/
pnpm test       # tsx --test src/**/*.test.ts  (node:test runner)
```

Single test file: `pnpm exec tsx --test src/scenario/runner.test.ts`. Filter by name: add `--test-name-pattern="<regex>"`.

There is no linter configured. Requires Node >=20.19. Pointer Lock generally doesn't work in embedded browsers, so live mouse testing needs standalone Chrome/Edge.

## Architecture

- `src/main.ts` (~700 lines): plain-DOM UI (no framework) and the session state machine (settings → running → paused → results, routine progression). Wires input, world, runner, and results together.
- `src/scenario/schema.ts`: Zod schema for scenario definitions. `src/scenario/catalog.ts` loads every `src/scenario/builtin/*.json` via `import.meta.glob` (eager) and parses it at startup, so an invalid JSON drill fails app load. To add a drill, drop a JSON file in `builtin/`; categories are `wall`, tracking, angles, error, and combo.
- `src/scenario/runner.ts`: the simulation core. It owns per-tick simulation, cover/visibility, rounds, combo stages, and metrics, and produces a `RunSummary`. It is deterministic given a seed (`src/game/rng.ts`). Seeds reproduce random sequences, not recorded input.
- `src/game/*`: reusable systems consumed by the runner (`player` movement, `targets`, `bots` reaction, `weapon` fire/spread, `analytics` shot log and aggregates). `src/game/world.ts` is the only Three.js rendering code (room, targets, separate gun scene/camera drawn after a depth clear).
- `src/input/`: `mouse.ts` handles Pointer Lock (unadjusted movement requested, with fallback) and consumes either `pointerrawupdate` or `mousemove`, never both. `sens.ts` holds the sensitivity/FOV math: `radians per count = sens × 0.07 × π/180`, and vertical FOV is derived from 103° horizontal at 16:9.
- `src/crosshair/code.ts`: Valorant crosshair code parse/encode (primary `P` section; ADS/sniper sections and unknown keys are preserved) and 2D-canvas drawing.
- `src/scenario/playlists.ts`: routines, including `fixMyErrors`, which derives drills from the error counts of the last five stored sessions.
- `src/ui/`: HTML-string renderers for results and scenario previews (`escapeHTML` is exported from `results.ts`; use it for any interpolated text).
- `src/settings/store.ts`: validated settings and history (last 30 runs) in localStorage; old runs must stay loadable.

Tests are colocated as `*.test.ts` (input, crosshair, scenario runner). The runner tests cover seeding, collisions, tracking, combos, and feedback, so extend them when changing simulation behavior.

## Conventions worth knowing

- Settings for target count/size apply only to Dot Wall; other drills own their target config.
- Escape/blur must pause the simulation and clear movement/trigger input.
- Spray Control (recorded recoil) and crouching are intentionally not implemented.
