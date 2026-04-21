# AGENTS.md — Rotatron

Neon/cyberpunk arcade puzzle. Tap a vertex on a hex-shaped triangle grid, six triangles rotate 60° CW carrying their colors around the ring, matching hexes shatter. Heat bar drains over time; only clears keep the run alive.

---

## Tech stack

- **Three.js** (`three` ^0.171) — rendering, raycasting, line materials
- **Vite** (dev server + bundler). No framework.
- **Vitest** for tests (Node env, not jsdom — game/logic only).
- **ESLint flat config** + Prettier. `eslint-config-prettier` disables style rules so Prettier owns formatting.
- Plain JS modules, no TypeScript.
- WebAudio (hand-rolled, no Tone.js) for all SFX.

Scripts:
- `npm run dev` — Vite on `http://localhost:5173`
- `npm run build` / `npm run preview`
- `npm test` — `vitest run --passWithNoTests`
- `npm run test:watch`
- `npm run lint` / `npm run lint:fix`
- `npm run format`

---

## Repo layout

```
index.html          Canvas + HUD mount
style.css           HUD styling (neon, glowing text, mute button)
vite.config.js      Vitest config + coverage thresholds for src/game, src/utils
src/
  main.js           Bootstrap: scene, composer, input, HUD, RAF loop, heat drain
  game/
    board.js        Hex-shaped board creation, phantom slot buffer, validity tests
    rules.js        Hex completion detection, cascade loop, scoring math
    spin.js         Pivot rotation, real↔phantom ghost fades, color-carry bookkeeping
    state.js        Global `gameState`, heat constants, phase thresholds
  render/
    scene.js        THREE scene/camera/boardGroup, mount/unmount helpers
    triangles.js    Triangle class: dark fill + bloom outline + inner circuit detail
    postprocess.js  Selective-bloom EffectComposer (two-composer pattern)
    background.js   Nebula shader planes + 3500-star forward-motion field
    particles.js    Pulse rings, implode whoosh, shatter particle emitters
    effects.js      Visual helpers layered on particles
    vertexDots.js   Breathing vertex indicators at tappable positions
  input/pointer.js  Raycast against hit-circle meshes; single-tap only
  audio/sfx.js      Procedural WebAudio SFX — no sample files
  ui/hud.js         Score, phase strip, heat bar, floating score numbers
  ui/overlay.js     Game-over + phase-transition announcements
  utils/
    math.js         Board constants, vertex/ring/triangle helpers, `isInsideHex`
    animate.js      `tween(durationMs, easing, onFrame)` → Promise
    colors.js       NEON/DARK palettes, phase palettes, new-color bonus
tests/              Vitest suites (board, rules, spin, state/heat, scoring, animate, math)
plans/              Scratch design docs — ignored by ESLint, not shipped
```

---

## Core model

### Board

- Hex-shaped play field defined in `src/utils/math.js`:
  - `HEX_SIDE = 3`, `HEX_CENTER_K = 6`, `HEX_CENTER_J = 3`, `ROWS = 7`, `COLS = 12`
  - `isInsideHex(col, row)` filters the rectangular scan down to 54 interior triangles.
- Triangles are keyed `"col,row"` in a flat dict: `{ col, row, color, isUp }`.
- A triangle is up-pointing when `(col + row) % 2 === 0`. Vertex `(k, j)` is a real triangle corner when `(k + j) % 2 === 1`.

### Ring, spin, and phantom slots

- The ring around `(k, j)` is six `(col, row)` pairs, CW from N (`src/utils/math.js::ring`).
- `createPhantomSlots(board, palette)` — for each ring that straddles the hex boundary (some slots off-board), seeds **hidden colors** for the missing slots. These persist across spins. A spin rotates all six colors; colors entering from phantoms fade in as ghost triangles, colors exiting to phantoms fade out of real triangles. The carry is one circular buffer of six.
- This is what makes edge vertices playable and why edge spins visually "reveal" new colors drifting in from outside the hex.
- `spin()` uses `pivot.attach()` / `boardGroup.attach()` to reparent groups while preserving world position, rotates `-60°` on z (visual CW with camera looking in -z), then promotes/disposes ghosts and rewrites `triangleViews` keys in place.
- **The rotation IS the state change.** After the tween, the board and `triangleViews` are rebuilt to match the new positions. There is no color-swap-then-reset shortcut.

### Completion detection and cascade

- `findCompletedHexes(board)` scans every real vertex and returns those whose six (existing) ring triangles all share a color. Rings with any missing slot are skipped — phantoms don't count toward a hex.
- `resolveCompletions(ctx)` runs the cascade loop:
  1. Find completed hexes, bump `cascade`, score them, emit `onCascadeWave`.
  2. Pulse ring + implode whoosh at each hex; shatter particles scheduled at +360ms.
  3. Flash outlines (260ms) → fade out (200ms) → reassign colors from `activeColors` → fade in (260ms).
  4. Repeat until stable. `MAX_CASCADE = 50` guards against infinite loops.
- Phase advance checked *after* the full cascade completes so the player isn't interrupted mid-chain.

### Scoring

```
points_per_hex = 100 × 2^(phase-1) × 2^(cascade-1) × m
```
(`m` = hexes completing in this wave.) Then `main.js` applies a `NEW_COLOR_BONUS_MULT = 2` if the hex's color is that phase's newly-introduced color (`PHASE_NEW_COLOR[phase]`). Floating score numbers spawn at each popped hex.

### Heat (run-end mechanic)

Heat drives the run timer (`src/game/state.js`):

- `heat ∈ [0, 1]`, starts at 1.0, drains while `gameState.status === 'idle'`.
- Drain rate = `HEAT_DRAIN_PER_SEC × drainMultiplierForPhase(phase)` → ~113s grace in phase 1, ~68s in phase 4.
- Each cascade wave adds `HEAT_HEX_BASE × n²` (quadratic — stacking simultaneous hexes is heavily rewarded).
- Phase transition adds `HEAT_PHASE_BONUS = 0.4`.
- Empty heat while idle → `status = 'game_over'` → game-over SFX + overlay after 400ms.

### Phases

`PHASE_THRESHOLDS = { 2: 11, 3: 26, 4: 51 }` hexes. Each phase widens the palette (`PHASE_PALETTES[n]`) by adding one color; existing triangles keep their old colors so the shift is gradual. `PHASE_NEW_COLOR[n]` is the freshly-added color that earns the bonus.

---

## Rendering

- **Selective bloom** via the two-composer pattern (adapted from `webgl_postprocessing_unreal_bloom_selective`). Only outline meshes are on layer 1. `postprocess.js` traverses the scene, swaps non-bloom materials to a black material, renders to a bloom target, then additively composites via `mixPass` on the final composer.
- Bloom params `0.48 / 0.28 / 0.12` — tuned for readability at the current camera distance.
- Mobile gets a `0.5` pixel ratio bloom composer (detected via `window.innerWidth < 768 || /Mobi|Android/i.test(UA)`).
- Each `Triangle` has three children: dark `MeshBasicMaterial` fill (layer 0), bright `Line2` outline (layer 1, pixel width 2), and a dim `LineSegments` circuit-detail overlay (panel seam + inner "chip" node + three traces) that gives each triangle a PCB/hull-panel read.
- **LineMaterial `resolution` must track the window.** All outline materials register in `outlineMaterials` (Set) so `refreshOutlineResolution(w, h)` updates them on resize.
- Camera auto-fits to keep the board framed on narrow viewports (`fitCamera` in `main.js`).
- Background (`background.js`):
  - 5 additive FBM-noise nebula planes drifting forward through a 102-unit z-cycle with fade-in/out bands to hide the seam.
  - 3500 forward-motion stars using a custom shader that cycles each star's z-phase over time, fades at both ends, and draws diffraction spikes on the largest ~2.5% of stars.

---

## Audio

All SFX are procedural WebAudio — no sample files. Six distinct sounds in `src/audio/sfx.js`:

1. `playSpin()` — noise sweep (bandpass 900→2400 Hz) + triangle-wave click at landing.
2. `playImplodeWhoosh()` — bandpass noise swept 2200→400 Hz. Fires before each clear.
3. `playHexClear(cascadeDepth)` — bell (sine + 2nd harmonic) + sub thump, pitched up a pentatonic arpeggio `C5→A6` by cascade depth.
4. `playPhaseTransitionSfx(newPhase)` — noise whoosh 300→5000 Hz + detuned saw chord stab, root rising with phase.
5. `playGameOver()` — highpassed reverse-ish whoosh + sustained descending bass + shimmer overtone.
6. `playInvalid()` — short square-wave blip 220→150 Hz (defined but not currently wired — invalid taps no-op silently).

`initAudio()` is called on first user gesture. Muted state persists in `localStorage` under `hexspin.muted`. The mute button is created imperatively in `main.js`.

---

## Input

- Pointer Events only (`pointerdown`). Single tap spins CW; there is no CCW gesture.
- Hit detection: invisible `CircleGeometry(0.4)` meshes parented to `boardGroup` at each valid vertex. Raycast against those.
- `rebuildHitCircles(newBoard)` is called on `resetRun` so the hit set tracks future board changes.
- Input is implicitly locked via `gameState.busy` in `withBusy(work)` inside `spin.js`.

---

## State machine

```
idle ─tap→ spinning ─rotation done→ resolving ─cascade stable→ idle
                                          │
                                          ├─ phase_transition (1.6s, set by overlay)
                                          └─ game_over (when heat hits 0)
game_over ─Play Again→ idle
```

`gameState.status` drives input gating and heat drain. `withBusy()` wraps spin/resolve so no second tap lands mid-animation.

---

## Testing

- Vitest runs in Node env. Coverage thresholds (in `vite.config.js`) apply only to `src/game/**` and `src/utils/**`: **80% lines/statements/functions, 70% branches**. Render/UI/input are not covered — they're hard to test without a browser and low ROI.
- Existing suites: `board.test.js`, `rules.test.js`, `spin.test.js`, `state.test.js`, `heat.test.js`, `scoring.test.js`, `math.test.js`, `animate.test.js`.
- When changing game logic, update the corresponding test. When adding new game logic, add a test.

---

## Conventions / gotchas

- **Key format** is always `` `${col},${row}` `` — never stringify objects.
- **CW color shift** is `colors.map((_, i) => colors[(i + 5) % 6])`. Slot `i` *receives* from slot `(i + 5) % 6`. `spin.js` uses `(i + 1) % 6` *targets* for the same rotation written forward — both describe the same +60° z-rotation.
- **Rotation sign:** `pivot.rotation.z = -angle` yields visual CW. Flipping the sign inverts the game.
- **Use `.attach()`, not `.add()`,** when reparenting objects mid-animation. `attach` preserves world transform.
- **Dispose on unmount.** `Triangle.dispose()` frees its two geometries and three materials and removes the outline material from the shared `outlineMaterials` registry. `unmountBoard()` and `spin.js`'s ghost cleanup both rely on this.
- **Never mutate `ring()` results.** They're fresh arrays but the triangle entries they point into are shared with `board`.
- **`plans/` is scratch.** Ignored by ESLint. Fine to leave notes there, but don't import from it.
- **Don't add sample audio.** All SFX are synthesized — the bundle stays tiny.

---

## When making changes

- **Game rules / scoring / heat tuning** → edit in `src/game/`, update or add a vitest suite.
- **Visual polish** → `src/render/`. Mind the bloom layer (layer 1 = bloomed, layer 0 = not).
- **New SFX** → add to `src/audio/sfx.js`, keep it procedural, call site is usually `main.js::handleTap` or `rules.js`'s effect hooks.
- **Board shape / size** → change constants in `src/utils/math.js` + `isInsideHex`, then verify `createBoard` still converges (it re-rolls until no starting hex is monochrome; a pathological palette size / board size combo could loop).
- **Phase / palette changes** → `src/utils/colors.js` + `src/game/state.js` thresholds.

After non-trivial edits, run `npm run lint` and `npm test`. For UI changes, hit the dev server and actually play — type checks and tests don't verify feel.
