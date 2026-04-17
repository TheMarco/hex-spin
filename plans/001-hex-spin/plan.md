# Hex Spin — Implementation Plan

## Context

`/Users/marcovhv/projects/GIT/hex-spin/` is greenfield: only `hex_spin_spec.md` and a fresh `.git/` exist. The spec defines a Three.js neon/cyberpunk arcade puzzle game — tap a vertex on a 10×6 triangle grid, six surrounding triangles rotate 60° CW, matching colors form hexes that shatter into particles, four difficulty phases, run ends when stones lock all vertices.

The spec (951 lines) is uncommonly complete: rules, math, pseudocode, file layout, easings, palettes, perf notes, success criteria. This plan respects that — it does not restate spec content, it sequences delivery and adds quality gates.

**Intended outcome:** a playable browser build that hits spec §17 success criteria 1-9 (and ideally #10: "you play it for ten minutes and want to play it again").

## Decisions locked

| Decision | Choice | Source |
|---|---|---|
| MVP scope | All 4 phases incl. stones; audio + chromatic aberration deferred | User |
| Tests | Vitest unit tests on game logic only (no render/visual tests) | User |
| Quality tooling | ESLint + Prettier | User |
| Plan file location | `~/.claude/plans/peppy-orbiting-gosling.md` AND mirrored to `plans/001-hex-spin/plan.md` post-approval | User |
| Tech stack | Three.js r160+, Vite, plain JS (no TS, no framework) | Spec §2 |

## Approach

- Build vertically, milestone by milestone, per spec §13's 15-step roadmap. Each milestone leaves a *playable* build.
- File layout mirrors spec §12 exactly. No invention.
- Borrow selective bloom from Three.js example `webgl_postprocessing_unreal_bloom_selective.html` — do not reinvent (spec §6.4, §14.5 both call this out).
- Game logic lives in pure modules under `src/game/` and `src/utils/`, isolated from Three.js, so it's unit-testable in Vitest without a DOM.
- Audio (Tone.js) is M14 — explicitly deferred from MVP.

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Selective bloom composite bugs (M7) | High — most complex part | Adapt directly from official example, don't invent. Reserve buffer time. |
| Spin rotation sign wrong on screen | Medium | Spec §14.2 flags this; verify visually in M3 and flip if needed |
| 60fps mobile target missed by bloom | Medium | M15 fallback: half-res bloom pass per spec §15 |
| Cascade infinite loop on bad refill RNG | Low | Cap cascade depth at e.g. 50 with a console warning; add Vitest test that bounds it |
| Stones make every vertex invalid early | Low | Spec rolls per-triangle independently; M10 unit tests verify run-end conditions |

---

## Milestones

Each milestone = one PR-sized chunk, playable at the end. IDs match spec §13 step numbers. Estimates are Fibonacci poker (1,2,3,5,8). Total MVP (M0-M13, M15): **52 points**.

### M0 — Project scaffold | Estimate: **3**

**Tasks**
- [ ] `npm create vite@latest` → vanilla JS template; prune to: `index.html`, `style.css`, `src/main.js`, `package.json`, `vite.config.js`
- [ ] Install runtime: `three`
- [ ] Install dev: `vitest`, `eslint`, `@eslint/js`, `prettier`, `eslint-config-prettier`
- [ ] Add `eslint.config.js` (flat config, ES2024, browser globals) and `.prettierrc` (single-quote, no semi off — match Three.js examples conventions)
- [ ] Add npm scripts: `dev`, `build`, `preview`, `test`, `test:watch`, `lint`, `lint:fix`, `format`
- [ ] `index.html`: full-bleed `<canvas>` + HUD container `<div id="hud">`. Body bg `#0A0612` per spec §6.1
- [ ] `src/main.js`: bootstrap renderer, scene, perspective camera per spec §6.7, `requestAnimationFrame` loop, resize handler
- [ ] `.gitignore` for `node_modules`, `dist`, `.DS_Store`

**Tests** — none yet (no logic to test)

**Definition of Done**
- [ ] `npm run dev` boots, black/purple screen, no console errors
- [ ] `npm run lint` passes
- [ ] `npm run test` passes (no tests = trivially green)
- [ ] Resize handler keeps canvas full-bleed

**Commit**: `chore(scaffold): initialize Vite + Three.js project with ESLint/Prettier/Vitest`

**CHECKPOINT**: `/compact focus on: M0 complete, project scaffolded with Vite/Three/Vitest/ESLint, M1 needs grid math and triangle rendering`

---

### M1 — Grid of flat triangles | Estimate: **3** | Spec §13.1

**Files (CREATE)**
- `src/utils/math.js` — `S`, `H`, `ROWS`, `COLS`, `vPos(k,j)`, `key(c,r)`, `ring(k,j)`, easing fns (spec §14.1, §14.4)
- `src/utils/colors.js` — palette constants + dark-variant lookup (spec §6.1 table)
- `src/game/board.js` — build 60-triangle dictionary keyed `"col,row"`, assign initial random colors from 3-color phase-1 palette
- `src/render/triangles.js` — `Triangle` class (fill mesh only; `MeshBasicMaterial`, 0.92 inward shrink toward centroid)
- `src/render/scene.js` — scene, camera, board `THREE.Group` with offset per spec §3.2
- `tests/math.test.js`, `tests/board.test.js`

**Tests (write FIRST, watch fail, then implement)**
- `math.test.js`:
  - `vPos(2, 1)` returns `[1.0, -0.866, 0]` (within ε)
  - `ring(2, 1)` returns the 6 expected `(c,r)` pairs in CW-from-N order
  - `key(3, 4) === '3,4'`
  - `(k+j)%2===1` parity check matches §3.2 "real vertex" rule
- `board.test.js`:
  - `createBoard()` produces exactly 60 triangles
  - All triangles have a color from the active palette
  - Up/down classification matches `(col+row)%2`

**Definition of Done**
- [ ] All 60 triangles visible, tile perfectly (no gaps/overlaps)
- [ ] Board centered at origin
- [ ] Lint, format, tests green; coverage ≥80% on `math.js` and `board.js`

**Commit**: `feat(grid): render 10x6 triangle grid with phase-1 palette`

**CHECKPOINT**: `/compact focus on: M1 complete, grid math + Triangle class + Board state in place, M2 needs pointer raycasting against vertex hit-circles`

---

### M2 — Vertex interaction | Estimate: **2** | Spec §13.2

**Files (CREATE)**
- `src/input/pointer.js` — Pointer Events, raycaster, hit-circle meshes at every valid vertex (radius ~0.4, transparent). Spec §9
- `tests/validity.test.js`

**Tests**
- `isValidVertex(k, j, triangles)`:
  - returns `true` for interior vertex (e.g., `k=4, j=3`)
  - returns `false` for `(k+j)%2===0`
  - returns `false` when ring extends out-of-bounds
  - returns `false` when any ring triangle has `isStone: true`
- All ~20 expected tappable vertices for a clean phase-1 board

**Definition of Done**
- [ ] Tapping any interior vertex logs correct `(k,j)`
- [ ] Briefly highlights the six `ring(k,j)` triangles (e.g., outline color flash)
- [ ] Edge vertices correctly rejected
- [ ] Tests green

**Commit**: `feat(input): add pointer raycasting against valid vertices`

**CHECKPOINT**: `/compact focus on: M2 complete, vertex tap detection working with ring highlight, M3 needs pivot-attach rotation animation`

---

### M3 — Spin animation (no color shift) | Estimate: **3** | Spec §13.3

**Files (CREATE)**
- `src/utils/animate.js` — Promise-based `tween(durationMs, easing, onFrame)` per spec §14.4
- `src/game/state.js` — `gameState` object + `busy` flag (spec §11.2)

**Files (MODIFY)**
- `src/input/pointer.js` — on tap, call `spin(k,j)`
- new `spin(k,j)` somewhere appropriate (likely `src/game/spin.js` or in `board.js`) per spec §14.2 using `pivot.attach()`/`boardGroup.attach()` — rotation only, no color shift, reset transforms after

**Tests**
- `animate.test.js`:
  - `tween(100, 'linear', cb)` resolves after ~100ms; final `t` value is 1
  - Easing fns: `easeInOutCubic(0)===0`, `easeInOutCubic(1)===1`, `easeInOutCubic(0.5)===0.5`
- `state.test.js`:
  - `gameState.busy` blocks re-entrant `spin` calls

**Definition of Done**
- [ ] Visual: rotation reads as clockwise (flip sign per spec §14.2 note if not)
- [ ] 340ms feels right
- [ ] Input locked during animation, unlocked after
- [ ] Triangles return to identity transform — no drift after multiple spins

**Commit**: `feat(spin): rotate ring of six triangles 60deg CW around vertex`

**CHECKPOINT**: `/compact focus on: M3 complete, spin animation works visually, M4 needs CW color-shift formula applied after rotation`

---

### M4 — Color shift | Estimate: **1** | Spec §13.4

**Tasks**
- After rotation lands, apply `triangles[slot i].color = origColors[(i + 5) % 6]` and `setColor` on each (spec §14.2 final block)

**Tests**
- `spin.test.js` (logic-only, no Three.js):
  - Given known ring colors `[A,B,C,D,E,F]`, after one CW spin the colors are `[F,A,B,C,D,E]`
  - Six spins return original colors
  - Three spins on a 3-coloring `[X,Y,Z,X,Y,Z]` produce `[X,Y,Z,X,Y,Z]` (rotational symmetry)

**Definition of Done**
- [ ] Colors visibly cycle CW around ring on every spin
- [ ] Up-triangles receive colors that were on down-triangles and vice versa (spec calls this "the satisfying part")

**Commit**: `feat(spin): apply CW color shift after rotation animation`

**CHECKPOINT**: `/compact focus on: M4 complete, board now playable with color shifts, M5 needs hex completion detection and cascade resolution loop`

---

### M5 — Completion + cascade pipeline | Estimate: **5** | Spec §13.5

**Files (CREATE)**
- `src/game/rules.js` — `findCompletedHexes` per spec §3.7, `resolveCompletions` cascade loop per spec §14.3
- `src/render/effects.js` — `flashOutlines`, `fadeOutTriangles`, `fadeInTriangles` (no particles or pulse rings yet)

**Tests**
- `rules.test.js`:
  - `findCompletedHexes` returns empty for random board
  - Returns 1 entry when 6 ring triangles share a color
  - Returns 2 entries on adjacent overlapping hexes
  - Dedups affected triangles (Set behavior per spec §3.7)
  - `resolveCompletions` increments cascade depth correctly across waves
  - Cascade depth caps at 50 (infinite-loop guard); console.warn fires
  - Refill assigns colors only from `gameState.activeColors`

**Definition of Done**
- [ ] Seeding deterministic boards produces predictable cascades
- [ ] No softlock; cascade always terminates
- [ ] Tests green, ≥80% coverage on `rules.js`

**Commit**: `feat(rules): detect completed hexes and resolve cascade refills`

**CHECKPOINT**: `/compact focus on: M5 complete, full game loop playable with flat colors, M6 needs neon outline conversion via Line2 and bloom postprocess`

---

### M6 — Neon conversion + non-selective bloom | Estimate: **5** | Spec §13.6

**Files (CREATE)**
- `src/render/postprocess.js` — `EffectComposer` with `RenderPass` + `UnrealBloomPass` (non-selective for now) + `OutputPass`. Tune `strength: 1.5`, `radius: 0.75`, `threshold: 0`

**Files (MODIFY)**
- `src/render/triangles.js` — fill (dark variant via `colors.js`) + Line2 outline (neon, layer 1, `linewidth: 3`) per spec §6.2, §14.5
- Outline registry for resize → `LineMaterial.resolution` updates (spec §15)

**Tests** — none new (rendering, hard to assert)

**Definition of Done**
- [ ] Outlines glow via bloom
- [ ] Fills are dark-tinted (not pitch black)
- [ ] Resize updates Line2 resolution; outlines stay 3px
- [ ] FPS still smooth on dev machine

**Commit**: `feat(render): convert triangles to fill+Line2 with UnrealBloomPass`

**CHECKPOINT**: `/compact focus on: M6 complete, bloom on everything, M7 needs selective bloom so only outlines+rings glow, fills+background do not`

---

### M7 — Selective bloom | Estimate: **8** | Spec §13.7 (BIGGEST RISK)

**Files (MODIFY)**
- `src/render/postprocess.js` — layer-mask selective bloom: two render targets, scene-walk that swaps non-bloom materials to black for the bloom pass, additive composite shader for final
- `src/render/shaders/selectiveBloom.glsl` (or inline) — final composite shader

**Tasks**
- Adapt directly from `webgl_postprocessing_unreal_bloom_selective.html` in the Three.js examples repo. **Do not invent.**

**Tests** — none new

**Definition of Done**
- [ ] Outlines glow, fills do **not**
- [ ] Background `#0A0612` stays dark, no halo
- [ ] No regression on FPS
- [ ] No materials leaked between passes (verify by running for 30s, no flicker)

**Commit**: `feat(render): implement layer-based selective bloom`

**CHECKPOINT**: `/compact focus on: M7 complete, selective bloom landed (the big visual win), M8 needs InstancedMesh shatter particles and pulse rings`

---

### M8 — Particles + pulse rings | Estimate: **3** | Spec §13.8

**Files (MODIFY)**
- `src/render/effects.js` — add `shatterTriangles` using `InstancedMesh` of tiny equilateral triangles (~12 per cleared triangle × 6 = 72 per hex), velocity radial-from-vertex + random upward + gravity, fade over 700ms, bloom layer
- `spawnPulseRing(pos, color)` — flat ring geometry, scale 0.3→2.0 + opacity 1→0 over 620ms (spec §6.5)

**Tests** — none new

**Definition of Done**
- [ ] Clears feel kinetic
- [ ] Pulse ring expands and fades visibly
- [ ] FPS holds with 5+ simultaneous shatters

**Commit**: `feat(effects): add shatter particles and hex pulse rings`

**CHECKPOINT**: `/compact focus on: M8 complete, hex clears feel impactful, M9 needs background grid floor with shader and fog`

---

### M9 — Background grid floor | Estimate: **3** | Spec §13.9

**Files (CREATE)**
- `src/render/background.js` — large `PlaneGeometry(200,200)` rotated horizontal, `ShaderMaterial` per spec §14.6, `uTime` updated each frame
- `src/render/shaders/grid.glsl` (or inline) — grid fragment shader

**Tasks**
- Add `FogExp2` density 0.02, color `#0A0612` (spec §6.7)
- Tune camera tilt for board readability

**Tests** — none new

**Definition of Done**
- [ ] Receding grid reads as depth
- [ ] Doesn't steal attention from board
- [ ] Fog blends grid into background at distance

**Commit**: `feat(background): add perspective grid floor with fog`

**CHECKPOINT**: `/compact focus on: M9 complete, full neon scene staged, M10 needs phase progression rules + stone mechanic + run-end detection`

---

### M10 — Phase progression + stones | Estimate: **5** | Spec §13.10

**Files (MODIFY)**
- `src/game/state.js` — phase advance logic per spec §4.1 thresholds; `activeColors` grows by 1 per phase; existing triangles keep color, only refills can be new color (spec §4.2)

**Files (CREATE)**
- `src/game/stones.js` — per-affected-triangle stone roll on clear, dedup via Set so shared triangles roll once (spec §4.3); `isStone` blocks vertex validity (spec §3.5)

**Files (MODIFY)**
- `src/render/triangles.js` — `setStone()`: gray fill `#2A2A2A`, gray outline `#555555`, **layer 0** (no bloom). Spec §6.8

**Tasks**
- `anyValidVertexExists()` returns false → triggers game-over state

**Tests**
- `state.test.js`:
  - `shouldAdvancePhase` triggers at hex counts 11, 26, 51
  - `activeColors` length grows: 3, 4, 5, 6
- `stones.test.js`:
  - Phase 1/2: `phaseStoneChance() === 0`
  - Phase 3: `phaseStoneChance() ≈ 1/6`
  - Phase 4: `phaseStoneChance() === 0.25`
  - Shared triangle in two completed hexes rolls once, not twice
  - Stones survive subsequent clears (color/state unchanged)
- `validity.test.js` (extend):
  - Vertex with stone in ring is rejected
- `runEnd.test.js`:
  - Construct a board where every valid vertex has a stone in its ring → `anyValidVertexExists()` returns false

**Definition of Done**
- [ ] Runs actually end (verify by setting stone chance to 1.0 temporarily)
- [ ] Stones visibly distinct from neon
- [ ] Tappable set shrinks visibly
- [ ] Tests green; ≥80% coverage on `state.js` and `stones.js`

**Commit**: `feat(rules): add phase progression and stone mechanic`

**CHECKPOINT**: `/compact focus on: M10 complete, full game rules including run-end, M11 needs HTML HUD overlay with score+phase+cascade displays`

---

### M11 — Scoring + HUD | Estimate: **3** | Spec §13.11

**Files (CREATE)**
- `src/ui/hud.js` — HTML overlay per spec §10.1: score (top-center), phase indicator + 6-circle palette strip (top-left), hex count + cascade multiplier + longest cascade (top-right)
- Floating-score helper: `spawnFloatingScore(worldPos, points)` projects to screen, animates upward drift + fade ~1s

**Files (MODIFY)**
- `style.css` — neon HUD styles (spec §10.2): JetBrains Mono / Orbitron, `text-shadow: 0 0 8px <color>, 0 0 16px <color>`
- `src/game/rules.js` — invoke scoring per spec §5: `100 × phase_mult × 2^cascade_index × m_simultaneous`

**Tests**
- `scoring.test.js`:
  - Phase 1, single hex, no cascade: 100 points
  - Phase 4, single hex, no cascade: 800
  - Phase 1, 1 hex direct + 1 cascade + 1 cascade: `100 + 200 + 400 = 700`
  - Phase 2, 2 simultaneous hexes in cascade wave 0: `200 × 2 × 1 = 400` per hex (800 total)
  - Combined: phase 3, cascade wave 2, 3 simultaneous hexes: `400 × 4 × 3 = 4800` per hex

**Definition of Done**
- [ ] Score numbers match formula in manual spot-check
- [ ] Palette strip ignites correctly per phase
- [ ] Floating numbers visible and readable on hex pop
- [ ] Tests green

**Commit**: `feat(hud): add scoring formula and HTML neon HUD overlay`

**CHECKPOINT**: `/compact focus on: M11 complete, scoring + HUD wired, M12 needs phase transition effect with scanline sweep + announcement text + input lock`

---

### M12 — Phase transition effect | Estimate: **3** | Spec §13.12

**Files (CREATE)**
- `src/ui/overlay.js` — phase announcement text ("PHASE 2", etc.) per spec §6.10
- `src/render/shaders/phaseSweep.glsl` (or inline) — scanline sweep `ShaderPass` with `lineY` uniform

**Tasks**
- 600ms top→bottom sweep
- 100ms 15% white flash
- 1.6s total input lock during transition

**Tests**
- `state.test.js` (extend):
  - `gameState.status === 'phase_transition'` blocks `spin()` calls

**Definition of Done**
- [ ] Phase boundary feels like an event, not a quiet variable change
- [ ] Sweep clean, no z-fighting with HUD
- [ ] Input correctly locked for full duration

**Commit**: `feat(phase): add scanline sweep and announcement on phase transition`

**CHECKPOINT**: `/compact focus on: M12 complete, phase transitions feel weighty, M13 needs polish pass (scanlines, camera shake, vertex breathing, tap pulse, game-over overlay)`

---

### M13 — Polish | Estimate: **5** | Spec §13.13

**Tasks**
- Scanline `ShaderPass` (spec §6.6 — chromatic aberration **deferred** per MVP scope)
- Camera shake on cascade ≥2 (0.03 amplitude, 300ms, scales with depth)
- Vertex breathing dots staggered by `(k+j)` phase offset (spec §6.9)
- Tap pulse ring (white, 420ms ease-out)
- Invalid-tap red shake
- Game-over overlay per spec §10.3 with stats and PLAY AGAIN button

**Tests** — none new (visual)

**Definition of Done**
- [ ] "Alive" feeling — small motions everywhere even when idle
- [ ] Game-over overlay shows accurate final stats
- [ ] PLAY AGAIN resets state cleanly (no leaks, no leftover meshes)

**Commit**: `feat(polish): add scanlines, camera shake, vertex breathing, tap feedback, game-over overlay`

**CHECKPOINT**: `/compact focus on: M13 complete, MVP feature-complete, M14 OPTIONAL audio or skip to M15 perf pass`

---

### M14 — Audio (DEFERRED — post-MVP) | Estimate: **5** | Spec §13.14

**Out of MVP scope per user decision.** Listed for completeness; revisit after M15.

- `npm install tone`
- `src/audio/sfx.js`, `src/audio/music.js` per spec §8
- Init Tone.js on first `pointerdown` (spec §15 autoplay note)

---

### M15 — Performance pass | Estimate: **2** | Spec §13.15, §15

**Tasks**
- Half-res bloom on mobile detect (`window.innerWidth < 768` or UA check)
- DPR cap `Math.min(devicePixelRatio, 2)`
- Visibility API → pause RAF when `document.hidden`, resume on `visibilitychange`

**Tests** — none new

**Definition of Done**
- [ ] 60fps on mid-range mobile (real device or DevTools throttle "Mid-tier mobile")
- [ ] No tab-background CPU/battery burn
- [ ] No DPR-related blur on retina

**Commit**: `perf: half-res bloom on mobile, DPR cap, RAF pause on hidden tab`

**CHECKPOINT**: `/compact focus on: M15 complete, MVP shipped per spec §17 1-9`

---

## File structure (final) — mirrors spec §12

```
src/main.js
src/game/{board.js, rules.js, state.js, stones.js, spin.js}
src/render/{scene.js, triangles.js, background.js, effects.js, postprocess.js}
src/render/shaders/{grid.glsl, scanline.glsl, selectiveBloom.glsl, phaseSweep.glsl}
src/input/pointer.js
src/audio/{sfx.js, music.js}                # M14, deferred
src/ui/{hud.js, overlay.js}
src/utils/{math.js, animate.js, colors.js}
tests/{math, board, validity, animate, state, spin, rules, stones, runEnd, scoring}.test.js
index.html
style.css
vite.config.js
eslint.config.js
.prettierrc
package.json
.gitignore
```

GLSL files start as inline template strings in their consuming JS modules, extracted to `.glsl` (loaded via Vite `?raw`) once stable.

## Key reuse callouts (do not reinvent)

- **Three.js example `webgl_postprocessing_unreal_bloom_selective.html`** — selective bloom composite (spec §6.4 / §14.5)
- **`three/examples/jsm/lines/{Line2, LineGeometry, LineMaterial}`** — outlines with real pixel width
- **`three/examples/jsm/postprocessing/{EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass}`** — pipeline
- **`THREE.Object3D.attach()`** (not `.add()`) — preserves world position when reparenting under spin pivot (spec §14.2 note)

## Verification — end-to-end

Per spec §17. The build is done when:

1. New run starts in Phase 1, 3 colors, 0 stones
2. Each tap = smooth 340ms 60° rotation, neon glow intact throughout
3. Cleared hexes shatter into visible neon particles, refill correctly
4. Cascades stack visually (audio deferred), multiplier visible
5. Phase transitions trigger at thresholds 11, 26, 51 with readable announcement
6. Stones appear in Phase 3+ and shrink the tappable set correctly
7. Run ends when no vertex tappable; game-over shows accurate stats
8. 60fps on mid-range mobile
9. Background grid reads as depth, doesn't dominate
10. You play 10 min and want to play again *(the only one that truly matters)*

**Manual test loop per milestone:**
- `npm run dev`, open in browser + DevTools mobile emulator + a real phone (M15)
- For M5 cascade correctness: temporary debug helper to seed deterministic boards
- For M10 stone math: temporarily force `phaseStoneChance = 1.0` and confirm rapid run-end
- Throughout: keep DevTools console clean — warnings about LineMaterial resolution or layer leaks indicate selective-bloom regressions

**Automated test loop:**
- `npm run test` after every milestone touching game logic
- Coverage gate ≥80% on every file under `src/game/` and `src/utils/`

## Post-approval handoff steps

After ExitPlanMode approval and exiting plan mode:

1. Create `plans/001-hex-spin/` in the repo
2. Copy this plan to `plans/001-hex-spin/plan.md`
3. Begin M0 — invoke `/superbuild plans/001-hex-spin/plan.md` for guided execution, OR manually start with the M0 task list

## Out of scope (spec §16)

Puzzle mode, meta-progression, power-ups, dual-ring spins, leaderboards, custom board shapes, multi-palette zones, chromatic aberration, audio. Not in this build.
