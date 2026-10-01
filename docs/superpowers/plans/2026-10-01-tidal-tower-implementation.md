# Tidal Tower Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development with the user's explicit authorization for parallel independent modules and autonomous completion. Human intermediate approval gates are waived by the latest user instruction.

**Goal:** Deliver the complete eight-level browser game and an owner-private playable URL.
**Architecture:** A framework-free TypeScript app owns state and connects pure game rules, a Rapier simulation, Three.js rendering, DOM interface and Web Audio. All resources are static and device-local storage keeps progress.
**Tech Stack:** Vite, TypeScript, Three.js, Rapier compat, Vitest, Playwright.
**Spec:** `docs/superpowers/specs/2026-10-01-tidal-tower-design.md`

## Global Constraints

- Work only in `/workspace/ai-game-one` on cloud branch `work`; preserve origin. User authorized local commits, origin push and owner-private Sites delivery.
- Eight levels with 18/24/30/32/36/42/48/60 blocks and 3/3/4/4/4/5/5/5 shots; win at ceil(0.8 × blocks), one score per fallen body.
- Real collisions only; no forced victories, fake QA, external APIs or paid services. Desktop and touch input, pause, restart, progress and sound must work.
- Shared interfaces live in `src/types.ts`; only integration owner edits them. Angles use radians, platform top is y=0, cannon faces negative z.
- Module agents have nonoverlapping write scopes and do not commit, push, publish, spawn agents or edit dependency manifests. The owner integrates and reviews.

## Review Focus

Pointer cancellation and repeated input must not spend shots; last-shot settling must finish before failure; stale physics/audio objects must not survive restarts; unsupported storage/audio must degrade safely; all physics levels must be genuinely solvable.

### Task 1: Physics, trajectory and levels

Files: `src/simulation.ts`, `src/levels.ts`, `src/trajectory.ts`, `tests/physics.test.ts`, `scripts/solve-levels.ts`, `tests/level-solutions.json`.
Interfaces: `initializePhysics(): Promise<void>`; `Simulation(level)` with `step(dt=1/60): PhysicsEvent[]`, `fire(aim): boolean`, `retireProjectile(): void`, `snapshot(): PhysicsSnapshot`, `dispose(): void`; `LEVELS: LevelDefinition[]`; trajectory exports `SHOT_SPEED`, `BALL_RADIUS`, `GRAVITY`, `clampAim(aim)`, `launchVelocity(aim)` and `trajectoryPoints(origin,aim,count=30): Vec3[]`.
- [x] Write failing tests for counts, stable initial towers, real projectile collision/CCD, scoring deduplication and cleanup; run before implementation.
- [x] Implement physical layouts, Rapier ownership and shared trajectory math. Count falling only after first fire, below platform bottom for 0.25s; dispose each fallen body and report splash.
- [x] Build a deterministic solver/replay using only legal `fire` plus fixed physics steps, find solutions for every level within ammo, store angles and observed scores. Adjust layouts/materials conservatively if needed.
- [x] Run physics tests and all-level replay, report evidence and limitations.

### Task 2: Three-dimensional game presentation

Files: `src/renderer.ts`, `tests/renderer.test.ts` if meaningful.
Interface: `GameRenderer(canvas,onContextLost)` with `setLevel(level)`, `update(snapshot,aim,dt,state: RendererState)`, `fireFeedback()`, `impactFeedback(event)`, `resize()`, `dispose()`, `diagnostics()`.
- [x] Establish a functional render smoke criterion and resource lifecycle checks before authoring.
- [x] Build a polished sea diorama with original geometric platform, coral/gold/teal block materials, toy cannon, sky, islands and water; update body poses from simulation only.
- [x] Show bounded trajectory dots, cannon orientation and drag aiming feedback, flash/recoil/splash/impact; respect reduced motion and mobile framing.
- [x] Verify real canvas output and disposal through integration browser QA; report any blocked check.

### Task 3: UI and audio

Files: `src/ui.ts`, `src/style.css`, `src/audio.ts`, `tests/ui.test.ts`, `tests/audio.test.ts` where meaningful.
Interfaces: `GameUI(root,onAction)` with `render(model: GameViewModel)`, `dispose()`; `GameAudio` with async `unlock()`, `play(kind,strength?)`, `setMuted(bool)`, `suspend()`, `resume()`, `dispose()`, `diagnostics()`.
- [x] Write UI action/disabled state tests and run before implementation.
- [x] Build game-native Chinese home, levels, tutorial, HUD, pause, results/error views with readable bold typography, navy/teal/cream and sunny yellow accents. Minimal overlays keep the 3D world dominant; buttons minimum 44px, responsive portrait/landscape.
- [x] Implement capped synthesized sound voices and mute/unlock/cleanup. No audio or font downloads.
- [x] Run scoped tests and report real checks versus deferred browser checks.

### Task 4: Rules, storage, inputs and integration (owner)

Files: `src/main.ts`, `src/game.ts`, `src/storage.ts`, `src/input.ts`, `src/webmcp.ts`, `index.html`, `public/favicon.svg`, `tests/game.test.ts`, `tests/storage.test.ts`, `tests/input.test.ts`.
- [x] Test legal state transitions, exact stars/thresholds, last-shot grace, pause/cancel, storage invalid/unavailable cases before implementations.
- [x] Implement game state as single source of truth; integrate modules in requestAnimationFrame with 1/60 fixed steps, max 5/frame and safe visibility handling.
- [x] Add all inputs, local save and lifecycle/error handling; expose only normal read/start/aim/fire actions if WebMCP is supported.
- [x] Run typecheck, all tests and production build; correct integration defects.

### Task 5: Independent QA and review

Files: `scripts/browser-qa.py`, `docs/testing.md`, `artifacts/` evidence files (owner selects files for Git).
- [x] Independent agent uses real mouse/keyboard/touch and real physics to complete all eight levels; validate pause, restart, save, audio, CCD and resource cleanup.
- [x] Inspect screenshots at desktop/mobile/landscape and record errors, genuine limitations and performance conditions; fix defects with covering tests.
- [x] Independent whole-project review checks spec compliance and quality, then scoped recheck of fixes.

### Task 6: Delivery (owner)

Files: `README.md`, `.openai/hosting.json`, source/build archives and final test records.
- [ ] Complete source and production artifact, verify clean build/tests on final code, commit and push original origin without changing permissions.
- [ ] Register owner-private Sites with creation_intent user_requested, preserve identity, push exact managed source version, package and deploy privately. Never print credentials.
- [ ] Confirm successful deploy status and actual page where permitted, owner-only audience; report exact verified URL or concrete blocker.
- [ ] Save downloadable source/build/screenshots in Library when available and return IDs/links plus concise real verification summary.

## Plan self-review and rulings

Scope, interfaces and task outputs checked against all ten design sections. User authorizes parallel independent ownership and skips intermediate approvals, superseding skill defaults; work stays in the existing cloud work branch. Read-only environment detection shows portable execution (`SITES_MANAGED_LINUX_CONTAINER` unset), correcting the earlier assumption of managed preview; ordinary cloud-local Playwright testing is permitted. Source authors remain independent; integration owns shared state and manifests. Hosting scripts absent locally will be obtained through permitted skill resources if available; otherwise use equivalent documented native packaging flow and record the limitation.
