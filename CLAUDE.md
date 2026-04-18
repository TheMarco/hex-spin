# CLAUDE.md — Hex Spin

Neon/cyberpunk arcade puzzle. Tap a vertex on a hex-shaped triangle grid, six triangles rotate 60° CW carrying their colors around the ring, matching hexes shatter. A heat bar drains constantly and clears refill it; empty heat ends the run.

The current code is the source of truth. If this file and the implementation diverge, update this file to match the code.

---

## Tech stack

- **Three.js** (`three` ^0.171) — scene graph, raycasting, custom shaders, postprocessing, line materials
- **Vite** — dev server and production bundling
- **Vitest** — Node-environment tests for game logic and math utilities
- **ESLint flat config** + **Prettier**
- Plain JS modules, no TypeScript
- **Sample-based audio**: WebAudio `AudioBufferSourceNode` playback for SFX plus one theme-selected looped `HTMLAudioElement` for background music

Scripts:
- `npm run dev` — Vite on `http://localhost:5173`
- `npm run build` / `npm run preview`
- `npm test` — `vitest run --passWithNoTests`
- `npm run test:watch`
- `npm run lint` / `npm run lint:fix`
- `npm run format`

---

## Repo layout

```text
index.html          Canvas + HUD mount
style.css           HUD styling, overlays, heat rail, mute button
styles.html         Standalone phase-style showcase page
style-showcase.css  Layout/styling for the showcase page
vite.config.js      Vite + Vitest config and coverage thresholds
src/
  main.js           Bootstrap: scene, board, input, HUD, audio, RAF loop
  style-showcase.js Standalone renderer for the four phase inner-style samples with their fixed phase themes
  game/
    board.js        Hex board creation, phantom slot seeding, valid vertex checks
    rules.js        Completed-hex detection, cascade loop, scoring math
    spin.js         Pivot rotation, ghost promotion/disposal, ring remapping
    spin-model.js   Pure clockwise ring carry/remap bookkeeping for spin.js
    state.js        Global `gameState`, heat constants, phase thresholds, busy lock
  render/
    scene.js        Scene/camera/boardGroup creation, mount/unmount helpers
    triangles.js    Triangle view: dark fill + bloomed outline + phase-specific inner circuit detail
    seam-current.js Interior shared-edge lightning/current layer (no outer-border current)
    postprocess.js  Selective bloom using two EffectComposers
    background.js   Shader nebula planes + forward-motion starfield
    particles.js    Hex pulse, flash, implosion, shatter particles
    effects.js      Legacy visual debug helper (`flashRing`), not used by `main.js`
    vertexDots.js   Static tappable-vertex markers on the bloom layer
  input/pointer.js  Pointer raycast against invisible hit-circle meshes
  audio/
    sfx.js          Sample-based audio loader/player and mute persistence
    s-music1.mp3
    s-music2.mp3
    s-music3.mp3
    s-music4.mp3
    s-turnwheel.mp3
    s-hexagon.mp3
    s-hexagonnew.mp3
    s-levelup.mp3
    s-gameover.mp3
  ui/
    hud.js          Score, phase strip, heat bar, floating score numbers
    overlay.js      Phase transition overlay and game-over screen
  utils/
    math.js         Board constants, ring geometry, vertex helpers, easings
    animate.js      `tween(durationMs, easing, onFrame)` helper
    colors.js       Theme registry, dark fill variants, phase palettes, bonus colors
tests/
  board.test.js
  rules.test.js
  spin.test.js
  state.test.js
  heat.test.js
  scoring.test.js
  math.test.js
  animate.test.js
plans/              Scratch notes, not imported into runtime code
```

---

## Core model

### Board

- Board geometry lives in `src/utils/math.js`.
- Constants:
  - `HEX_SIDE = 3`
  - `HEX_CENTER_K = 6`
  - `HEX_CENTER_J = 3`
  - `ROWS = 7`
  - `COLS = 12`
- `isInsideHex(col, row)` filters the rectangular scan to the 54 in-bounds triangles of the flat-top hex.
- Each triangle is stored in a flat object keyed by `` `${col},${row}` `` with shape:
  - `{ col, row, color, isUp }`
- `isUp` is `(col + row) % 2 === 0`.
- A vertex `(k, j)` is a real triangle corner when `(k + j) % 2 === 1`.

### Ring, spin, and phantom slots

- `ring(k, j)` returns the six triangle slots around a vertex in clockwise order starting from the north slot.
- `createPhantomSlots(board, palette)` seeds hidden colors for boundary vertices whose six-slot ring extends outside the playable hex.
- Phantom slot colors persist across spins. Real and phantom slots together behave like one six-position circular buffer.
- This is what makes edge vertices playable and why edge spins can visibly pull colors in from outside the board.
- `spin()` in `src/game/spin.js`:
  - validates against `status` and `isValidVertex`
  - uses `withBusy()` as the async lock
  - delegates real/phantom carry bookkeeping to `src/game/spin-model.js`
  - builds a temporary pivot group at the tapped vertex
  - reparents real triangle groups with `.attach()`
  - creates ghost `Triangle` views for phantom colors
  - rotates the pivot `-60°` on z for a visual clockwise turn
  - promotes or disposes views after the tween
  - rewrites the affected `triangleViews` entries in place
  - updates board colors and the phantom buffer to match the rotated carry
- The rotation is the state change. There is no snap-back plus later color swap.
- `spin()` also supports `applyColorShift = false` for visual-only rotation paths, though the main game uses the default `true`.

### Completion detection and cascade

- `findCompletedHexes(board)` scans every real vertex.
- A hex only counts if all six ring slots exist on the real board and all six colors match.
- Boundary rings that rely on phantoms are skipped for completion purposes.
- `resolveCompletions(ctx)` loops until stable:
  1. Find completed hexes.
  2. Increment cascade depth and compute wave score.
  3. Emit `onCascadeWave`.
  4. Trigger visual effects (`hexPulse`, `implode`, delayed `shatter`).
  5. Flash affected outlines for `260ms`.
  6. Fade affected triangles out over `200ms`.
  7. Refill affected visible triangles from `activeColors` or `ctx.pickColor`.
  8. Fade them back in over `260ms`.
- `MAX_CASCADE = 50` guards against runaway refill loops.
- Phase advancement is checked only after the entire cascade finishes.

### Scoring

```text
pointsPerHex = 100 × freshMult × 2^(phase - 1) × 2^(cascade - 1) × m
freshMult    = 1 + clamp(1000 − 100·(spinsSinceLastClear − 1), 100, 1000) / 1000
```

- `m` is the number of hexes completed in that wave.
- `computeWaveScore()` returns the per-hex payout, not the whole-wave payout.
- Because `m` is already folded into `pointsPerHex`, total wave payout scales quadratically with simultaneous clears before bonuses.
- `freshMult` rewards fast hits: 2.0× on the first spin after the last clear, decaying by 0.1× per spin to a 1.1× floor at spin 10+.
- Freshness is locked at the start of each cascade so every wave from a single tap shares the same bonus tier.
- `gameState.spinsSinceLastClear` increments on every spin and resets to 0 after any cascade that clears at least one hex (and on new run).
- In `src/main.js`, each cleared hex gets an additional `NEW_COLOR_BONUS_MULT = 2` if its color matches `PHASE_NEW_COLOR[gameState.phase]`.
- Floating score numbers are spawned per cleared hex in screen space via the HUD.

### Heat

Heat is the run timer in `src/game/state.js`.

- `heat ∈ [0, 1]`
- Starts at `1.0`
- `drainHeat(deltaSeconds)` drains whenever `gameState.status === 'idle'`
- Current implementation detail: `status` is not switched to a dedicated `spinning` or `resolving` state, so heat also drains during active spin/cascade sequences while `busy === true`
- Drain rate:
  - `HEAT_DRAIN_PER_SEC = 0.007`
  - multiplied by `drainMultiplierForPhase(phase)`
- Heat gain:
  - per cascade wave: `HEAT_HEX_BASE × n²`
  - on phase change: `HEAT_PHASE_BONUS = 0.4`
- If heat reaches zero while status is `idle`, `main.js` sets `status = 'game_over'`, plays game-over audio, and shows the overlay after `400ms`

### Phases

- Thresholds: `PHASE_THRESHOLDS = { 2: 11, 3: 26, 4: 51 }`
- `advancePhase(toPhase)` updates:
  - `gameState.phase`
  - `gameState.activeColors`
- Existing triangles are not recolored on phase change.
- Existing triangles do restyle their **inner detail layer** on phase change.
- The effect of a new phase is that future refills and future new boards can draw from a larger palette.
- `PHASE_NEW_COLOR` marks the newly introduced color for bonus scoring in that phase.

### Phase Themes

- The game uses 4 fixed phase themes:
  - phase 1 → `arcade`
  - phase 2 → `reactor`
  - phase 3 → `void`
  - phase 4 → `solar`
- A phase theme changes:
  - board generation colors
  - phantom slot seed colors
  - background music track selection
  - scene background color
  - nebula and starfield color treatment
  - vertex marker glow colors
  - pulse and flash effect accents
  - HUD, overlay, and control-panel chrome via CSS variables
  - palette strip HUD colors
  - heat bar highlight colors
  - phase transition announcement colors
  - the style showcase preview page
- Theme changes are automatic on phase advance; there is no manual in-game theme picker.

---

## Rendering

- Selective bloom is implemented in `src/render/postprocess.js` using the standard two-composer approach:
  - bloom-only render with non-bloom objects darkened to black
  - full scene render
  - additive composite via `mixPass`
- Bloom parameters:
  - `strength = 0.48`
  - `radius = 0.28`
  - `threshold = 0.12`
- Mobile uses a `0.5` pixel ratio bloom composer when `window.innerWidth < 768` or the user agent matches `Mobi|Android`.
- The bloom layer is not limited to triangle outlines:
  - triangle outlines use layer `1`
  - vertex markers use layer `1`
  - pulse/flash/implode/shatter particle meshes also use layer `1`
- Each `Triangle` view contains:
  - a dark `MeshBasicMaterial` fill
  - a bright `Line2` outer outline
  - a dim `LineSegments` circuit/hull detail overlay
- Lightning/current is now a separate board-level layer in `render/seam-current.js`:
  - built only from shared interior triangle edges
  - omitted entirely on the outside border of the main hex
  - animated as sparse white-hot seam bolts rather than per-triangle perimeter dashes
- The outer fill and outline remain the same in every phase.
- Only the inner detail layer changes by phase:
  - phase 1: baseline PCB/chip seam
  - phase 2: segmented core wedges
  - phase 3: twisted lattice braces
  - phase 4: dense reactor grid
- `LineMaterial.resolution` must be updated on resize; all outline materials register in the shared `outlineMaterials` set.
- `fitCamera()` in `main.js` pushes the camera back on narrow viewports so the board remains framed.
- `background.js` builds the atmosphere:
  - 5 additive shader nebula planes that drift forward and fade across a z-cycle
  - 3500 stars in a custom shader-based forward-motion starfield with wrap fading and diffraction spikes on large stars
- `styles.html` is a dedicated comparison page for these four inner styles and is included as a separate Vite build entry.
- `styles.html` shows the fixed phase pairings directly rather than offering a manual theme picker.

---

## Audio

Audio is currently sample-based, not procedural.

- `src/audio/sfx.js` imports ten assets:
  - `s-music1.mp3`
  - `s-music2.mp3`
  - `s-music3.mp3`
  - `s-music4.mp3`
  - `s-turnwheel.mp3`
  - `s-hexagon.mp3`
  - `s-hexagonnew.mp3`
  - `s-extrabonus.mp3`
  - `s-levelup.mp3`
  - `s-gameover.mp3`
- `initAudio()` runs on the first user gesture:
  - creates an `AudioContext`
  - creates a gain node for SFX
  - asynchronously fetches and decodes SFX buffers
  - starts looped background music with `new Audio(...)`
- Theme IDs map to music tracks:
  - `arcade` → `s-music1.mp3`
  - `reactor` → `s-music2.mp3`
  - `void` → `s-music3.mp3`
  - `solar` → `s-music4.mp3`
- Phase changes swap the looped BGM track to the matching phase theme when audio is active.
- Muted state persists in `localStorage` under `hexspin.muted`.
- Active sound hooks:
  - `playSpin()` — plays the turnwheel sample
  - `playHexClear(cascade, { bonus })` — pitch-shifts the clear sample by cascade depth and uses an alternate sample for bonus-color clears
  - `playExtraBonus({ cascade, freshMult })` — layers `s-extrabonus.mp3` over cascade waves 2+ (and on the hottest fresh-hit wave-1 clears) with pitch climbing in 3-semitone steps; deep chains also trigger a delayed perfect-fifth echo
  - `playPhaseTransitionSfx()` — plays the level-up sample
  - `playGameOver()` — plays the game-over sample
- Current no-ops:
  - `playImplodeWhoosh()`
  - `playInvalid()`

---

## Input

- Pointer Events only: `pointerdown`
- Hit detection uses invisible `CircleGeometry(0.4)` meshes placed at each valid vertex and raycast with `THREE.Raycaster`
- `pointer.js` only calls `onTap` when the pointer hits one of those valid vertex circles
- `rebuildHitCircles(newBoard)` is called on run reset
- Input concurrency is gated by `gameState.busy` through `withBusy()` in `spin.js`
- `P` on the keyboard (or the pause button next to the mute toggle) pauses and resumes the run; `handleTap` ignores input while paused
- Important current behavior:
  - `main.js::handleTap()` triggers local visual feedback (`hexPulse`) and `playSpin()` before `spin()` has a chance to reject the move
  - as a result, taps during `busy` or `phase_transition` can still produce local feedback even when they do not mutate game state
  - taps outside valid hit circles do nothing

---

## Runtime state

The code uses both `status` and `busy`, and they serve different jobs.

### `gameState.status`

Current values used in runtime code:

- `idle`
- `phase_transition`
- `game_over`
- `paused`
- `title` (only set by the title screen in `main.js`)

There are no explicit `spinning` or `resolving` status values in the current implementation.

`paused` is set by the user-facing pause toggle (the `P` key or the pause button next to the mute button). `spin()` rejects taps while `status === 'paused'`, heat drain pauses (because `drainHeat` requires `status === 'idle'`), and the RAF loop short-circuits so particles/background/heat do not advance. Toggling back to `idle` resets `lastFrameMs` so no large delta bursts through on resume.

### `gameState.busy`

- `busy` is the async lock that prevents overlapping spins/resolves
- `withBusy()` returns `null` immediately if another action is already in progress

### Actual flow

```text
status: idle ─phase threshold reached→ phase_transition ─1.6s→ idle
status: idle ─heat empty→ game_over ─Play Again→ idle

busy:   false ─successful tap→ true ─spin + cascade resolution complete→ false
```

Implications:

- heat pauses during `phase_transition` and `game_over`
- heat does not pause during spin/cascade work because status remains `idle`
- taps are rejected by `spin()` during `phase_transition` and `game_over`
- repeat taps during an in-flight action are blocked by `busy`, not by a status change

---

## Testing

- Vitest runs in Node, not jsdom
- Coverage thresholds in `vite.config.js` apply only to `src/game/**` and `src/utils/**`
  - `80%` lines/statements/functions
  - `70%` branches
- Existing suites:
  - `board.test.js`
  - `rules.test.js`
  - `spin.test.js`
  - `state.test.js`
  - `heat.test.js`
  - `scoring.test.js`
  - `math.test.js`
  - `animate.test.js`
- Important current coverage note:
  - `spin.test.js` covers `shiftColorsCW()` plus the pure real↔phantom carry/remap plan in `spin-model.js`
  - the full Three.js pivot/ghost animation path in `spin.js` is still not directly unit-tested

---

## Conventions / gotchas

- **Key format** is always `` `${col},${row}` ``
- **Clockwise carry math:** slot `i` receives the color from slot `(i + 5) % 6`
- **Rotation sign:** `pivot.rotation.z = -angle` gives the visual clockwise spin
- **Use `.attach()`, not `.add()`,** when reparenting moving groups mid-animation
- **Dispose views carefully:** `Triangle.dispose()` frees geometries/materials and unregisters its outline material from `outlineMaterials`
- **Do not mutate `ring()` results**
- **`effects.js` is legacy** and not part of the live gameplay path in `main.js`
- **`vertexDots.update()` is currently a no-op**; the markers are static
- **Audio is sample-based baseline behavior**. Do not describe it as procedural unless the implementation changes
- **Background music is now four shipped assets** relative to the rest of the game; be deliberate before adding more media weight

---

## When making changes

- **Game rules / scoring / heat tuning**
  - edit `src/game/`
  - update or add Vitest coverage
- **Spin behavior / phantom-slot logic**
  - treat `src/game/spin.js` and `src/game/spin-model.js` as high-risk files
  - preserve `.attach()`-based reparenting unless intentionally redesigning the mechanic
- **Visual polish**
  - edit `src/render/`
  - keep bloom layer usage intentional so the board stays readable
- **Audio changes**
  - edit `src/audio/sfx.js`
  - current baseline is sample playback, mute persistence, and phase-swapped looped BGM
- **Board shape / size**
  - update `src/utils/math.js`
  - then verify `createBoard()` still converges without startup hexes
- **Phase / palette changes**
  - update `src/utils/colors.js` and `src/game/state.js`

After non-trivial edits, run `npm run lint` and `npm test`. For feel-sensitive gameplay or UI changes, also run the game and play it.
