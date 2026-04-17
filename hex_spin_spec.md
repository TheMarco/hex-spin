# Hex Spin — Implementation Specification

A neon/cyberpunk arcade puzzle game. Tap a vertex on a triangle grid, watch six triangles rotate 60°, chase matching hexes, feel them shatter into particles. Difficulty ramps over a single run. Built in Three.js with heavy bloom and a 3D-grid-floor background.

---

## 1. Project overview

**Core loop.** Player taps any interior vertex on a 10×6 triangle grid. The six triangles around that vertex rotate 60° clockwise — colors shift around the ring but each triangle keeps its physical up/down slot (so colors visually "jump" between up-triangles and down-triangles, which is the satisfying part). If all six triangles around any vertex end up the same color after the spin, that hex flashes, shatters into particles, and refills with new colors. Refills can chain into cascades.

**Progression.** A single run gets harder as the hex count climbs. More colors in the palette = fewer accidental matches. Eventually, clears can leave behind permanent "stone" triangles that can't rotate. Run ends when no valid spin exists (every tappable vertex has at least one stone in its ring).

**Aesthetic.** Black background with slight purple undertone. Six neon colors (magenta, cyan, lime, purple, orange, yellow) that glow via additive bloom post-processing. Triangles have dark desaturated fills with bright glowing outlines. Background is a perspective grid floor receding into the distance (Tron / synthwave). Particles on hex completion. Subtle camera shake, scanline overlay, optional chromatic aberration. Every visual element should look like it's emitting light.

**Target platforms.** Desktop and mobile web. Touch-first interaction. Must run at 60fps on mid-range mobile.

---

## 2. Tech stack

- **Three.js** r160+ (any recent version works; avoid anything older than r150 because of `BufferGeometry` API changes)
- **Postprocessing:** `three/examples/jsm/postprocessing/` — `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `ShaderPass`, `OutputPass`
- **Thick lines:** `three/examples/jsm/lines/` — `Line2`, `LineGeometry`, `LineMaterial` (for outline strokes that don't collapse to 1px)
- **Bundler:** Vite (recommended). No frameworks — plain JS modules. React/Vue add no value here.
- **Audio (optional, phase 2):** Tone.js or raw WebAudio. Not required for MVP.
- **No physics library.** Everything is transform-based.

Dev dependencies: `three`, `vite`. That's it.

---

## 3. Core game rules

### 3.1 Grid layout

A grid of equilateral triangles arranged in rows. In each row, triangles alternate up-pointing and down-pointing.

- Edge length in world units: `S = 1.0`
- Triangle height: `H = S × √3/2 ≈ 0.866`
- Rows: `ROWS = 6`
- Columns: `COLS = 10`
- Total triangles: `ROWS × COLS = 60`

Each triangle is addressed by `(col, row)`. A triangle is **up-pointing** if `(col + row)` is even, **down-pointing** if odd.

### 3.2 Vertex positions

Vertices are addressed by `(k, j)`. Vertex `(k, j)` has world position:

```
x = k × S/2
y = -j × H
z = 0
```

(Negative y so that `j=0` is at the top of the screen, matching intuition.)

**Real vertices** — the ones with triangles around them — are those where `k + j` is odd. Vertices with `k + j` even are not triangle corners in this tiling.

To center the board at origin, wrap the whole thing in a `THREE.Group` and offset:

```javascript
board.position.set(-COLS * S / 4, ROWS * H / 2, 0);
```

### 3.3 Triangle vertex indices

For triangle at `(col, row)`:

**Up-pointing** (`col + row` even):
```
apex:       (col + 1, row)
base-left:  (col,     row + 1)
base-right: (col + 2, row + 1)
```

**Down-pointing** (`col + row` odd):
```
top-left:  (col,     row)
top-right: (col + 2, row)
apex:      (col + 1, row + 1)
```

### 3.4 Ring around a vertex

Given vertex `V = (k, j)` with `k + j` odd, the six surrounding triangles in **clockwise order starting from North** (where +y is up in screen space):

| Slot | Direction | Triangle `(col, row)` | Type |
|------|-----------|----------------------|------|
| 0 | N  | `(k-1, j-1)` | down |
| 1 | NE | `(k,   j-1)` | up   |
| 2 | SE | `(k,   j)`   | down |
| 3 | S  | `(k-1, j)`   | up   |
| 4 | SW | `(k-2, j)`   | down |
| 5 | NW | `(k-2, j-1)` | up   |

Note the alternating down/up pattern — that's the crucial part. Color rotations move a down-triangle's color to an up-triangle's slot, and vice versa.

Helper:

```javascript
const ring = (k, j) => [
  [k-1, j-1], [k, j-1], [k, j],
  [k-1, j],   [k-2, j], [k-2, j-1]
];
```

### 3.5 Valid vertex test

A vertex `(k, j)` is **tappable** (valid for spinning) if:
1. `(k + j) % 2 === 1` (it's a real vertex)
2. All six triangles in `ring(k, j)` exist in the grid (in-bounds)
3. None of the six triangles is a **stone** (see §5.3)

For a 10×10 grid with `COLS=10, ROWS=6`, valid `k` range is `2..9`, valid `j` range is `1..5` (before stone filtering). That's up to 20 tappable vertices.

### 3.6 Spin mechanic

When the player taps a tappable vertex `V`:

1. Identify the six triangles via `ring(k, j)` (CW from N).
2. Record their current colors as `origColors[0..5]`.
3. Animate: rotate all six triangles 60° clockwise around `V` in the xy-plane, over **340ms** using **ease-in-out-cubic**. In Three.js, this is a rotation of `+60°` around the +z axis (assuming right-handed axes, which gives visual clockwise when camera looks in -z direction — double-check sign in your scene, flip if needed).
4. After animation completes: assign new colors such that `triangles[slot i].color = origColors[(i + 5) % 6]`. This is a CW shift by 1: triangle now in slot 1 (NE) receives the color that was in slot 0 (N), etc.
5. Reset triangle transforms to identity (their actual positions never changed; only colors shifted).
6. Run completion detection (§3.7).

### 3.7 Completion detection

After every spin (and after every cascade step), check every valid vertex on the board. A hex is **completed** if all six triangles in its ring share the same color.

```javascript
function findCompletedHexes() {
  const done = [];
  for (let j = 1; j <= ROWS - 1; j++) {
    for (let k = 2; k <= COLS - 1; k++) {
      if (!isValidVertex(k, j)) continue;
      const ts = ring(k, j);
      const first = triangles[key(ts[0])].color;
      if (ts.every(([c, r]) => triangles[key(c, r)].color === first)) {
        done.push({ k, j, ts, color: first });
      }
    }
  }
  return done;
}
```

Adjacent completed hexes may share triangles; deduplicate affected triangles with a `Set` keyed by `"col,row"` before applying the clear.

### 3.8 Clear and refill

For each completed hex:

1. Emit a pulse ring at the vertex (visual, §6.5).
2. Flash the six triangles (brightness +85% for 260ms, sine pulse).
3. Fade out (200ms, opacity 1→0).
4. Shatter particles (see §6.5).
5. Assign new colors per the current phase's color palette (see §4).
6. Fade in (260ms, opacity 0→1).
7. Re-run completion detection. If more hexes are now completed, repeat (this is the cascade).

Track cascade depth — the first clear is cascade 1, the second is cascade 2, and so on. This drives combo multipliers.

---

## 4. Difficulty progression

### 4.1 Phase table

A run starts in Phase 1. Advancing to the next phase is triggered by reaching the hex count threshold (cumulative in the current run).

| Phase | Hex threshold | Colors in palette | Stone chance per triangle | Score multiplier |
|-------|---------------|-------------------|---------------------------|------------------|
| 1     | 0–10          | 3                 | 0%                        | 1×               |
| 2     | 11–25         | 4                 | 0%                        | 2×               |
| 3     | 26–50         | 5                 | 16.67% (1-in-6)           | 4×               |
| 4     | 51+           | 6                 | 25% (1-in-4)              | 8×               |

### 4.2 Color entry

The six colors in the master palette are ordered. At each phase, only the first N colors are available:

1. Magenta `#FF1493`
2. Cyan `#00F0FF`
3. Lime `#39FF14`
4. Electric purple `#8C1BFF`
5. Electric orange `#FF6B00`
6. Neon yellow `#F0FF00`

Phase 1 uses colors 1–3. Phase 2 adds 4. Phase 3 adds 5. Phase 4 adds 6.

When a new phase begins, **existing triangles keep their current colors**. Only newly-refilled triangles can be the new color. This creates a gradual shift in the palette and avoids jarring swaps.

### 4.3 Stone mechanic

In Phases 3 and 4, when a hex clears, each of its six triangles independently rolls for becoming a stone. The probability is the per-triangle stone chance from the phase table.

A stone triangle:
- Never changes color or appearance again
- Cannot be rotated (any vertex whose ring contains a stone is no longer tappable)
- Is rendered in a dead gray/cracked style (see §6.7) — clearly different from neon triangles

Stones accumulate across the run. They are the primary driver of run-end.

Shared triangles (when two completed hexes overlap): each shared triangle rolls once, not twice. A shared triangle becoming a stone is fine — it's just gone from both neighboring hexes.

### 4.4 Run end

Run ends the moment no tappable vertex remains (every valid-by-geometry vertex has at least one stone in its ring). Show game-over overlay with:
- Final score
- Highest phase reached
- Total hexes cleared
- Longest cascade
- "Play again" button

---

## 5. Scoring

### 5.1 Per-hex points

Base value per cleared hex: `100 × phase_multiplier`.

So:
- Phase 1 hex: 100
- Phase 2 hex: 200
- Phase 3 hex: 400
- Phase 4 hex: 800

### 5.2 Cascade combo

If a single spin causes a chain of N cascades (each cascade resolving one or more hexes), multiply each hex's score by `2^(cascade_index)` where `cascade_index` is 0 for the first wave, 1 for the second, etc.

So a spin that pops 1 hex directly, then 1 more from the refill, then 1 more from the refill again = 1×mult + 2×mult + 4×mult = 7×mult total.

### 5.3 Simultaneous multi-hex bonus

If a single cascade wave completes M hexes at once, multiply each of those hexes' points by M.

Combined formula for a hex cleared in cascade wave `c` (0-indexed) where `m` hexes complete in that wave simultaneously:

```
points = 100 × phase_mult × 2^c × m
```

Show floating score numbers at each completed hex when it pops. Style: neon, glowing, upward drift, fades out over ~1 second.

---

## 6. Visual design — neon cyberpunk

### 6.1 Palette

**Background:** `#0A0612` (near-black with purple undertone — not pure `#000000`; pure black looks flat and dead).

**Triangle neon colors** (bright outline / glow):

| Color name | Hex | Dark fill variant | Notes |
|-----------|-----|-------------------|-------|
| Magenta   | `#FF1493` | `#2A0A1F` | Phase 1 |
| Cyan      | `#00F0FF` | `#0A2529` | Phase 1 |
| Lime      | `#39FF14` | `#0F2906` | Phase 1 |
| Purple    | `#8C1BFF` | `#1F0A33` | Phase 2 |
| Orange    | `#FF6B00` | `#2A1205` | Phase 3 |
| Yellow    | `#F0FF00` | `#2A2900` | Phase 4 |

Dark fills are the same hue as the neon, around 8–15% lightness. They appear nearly black but take on a subtle tint that reads under the bloom.

**UI/chrome accents:** cyan `#00F0FF` for primary UI, white `#FFFFFF` for high-contrast text, dim gray `#555` for secondary.

### 6.2 Triangle rendering

Each triangle is composed of **two objects**: a filled mesh and a glowing outline.

**Fill mesh:**
- Geometry: `BufferGeometry` with 3 vertices (the triangle's corners), 1 triangle face
- Material: `MeshBasicMaterial`, `color` = dark fill variant, `transparent: false`
- Scale inward: shrink by 0.92 toward centroid for a grout-gap effect between triangles
- Layer: `0` (default — not bloomed)

**Outline:**
- Geometry: `LineGeometry` with 4 positions (3 corners + repeat of first to close the loop)
- Material: `LineMaterial`, `color` = neon variant, `linewidth: 3.0`, `transparent: true`, `opacity: 1.0`
- Must set `resolution` on the material (Line2 requires this): `material.resolution.set(window.innerWidth, window.innerHeight)`, update on resize
- Layer: `1` (bloom layer)

Each triangle is parented to a group so fill and outline transform together.

```javascript
class Triangle {
  constructor(col, row, color) { /* ... */ }
  // .group — THREE.Group containing fill + outline
  // .setColor(neonColor) — updates both fill (dark variant) and outline (bright)
  // .fade(opacity) — animates both
}
```

### 6.3 Post-processing pipeline

Use `EffectComposer` with the following passes, in order:

1. **RenderPass** (main scene)
2. **UnrealBloomPass** (selective, see §6.4) — parameters: `strength = 1.5`, `radius = 0.75`, `threshold = 0`
3. **ShaderPass** for scanlines + chromatic aberration (optional; see §6.6)
4. **OutputPass**

### 6.4 Selective bloom

Only outlines should bloom. Fills and background should not. This requires the **layer-masking selective bloom** pattern:

1. Mark outline meshes with `mesh.layers.set(1)` (layer 1 = bloom layer).
2. All other objects stay on layer 0.
3. Create two render targets: one for the bloom scene, one for the final composite.
4. **First pass:** set camera layers to `camera.layers.set(1)` (only layer 1 visible), render everything else as black. This is typically done by walking the scene, saving materials, replacing non-bloom materials with a black material, rendering, then restoring.
5. **Bloom pass:** UnrealBloomPass processes the bloom-only render target.
6. **Final composite:** render scene normally (all layers), then blend the bloom texture additively on top via a custom `ShaderMaterial`.

This is a standard pattern — the Three.js examples repo has `webgl_postprocessing_unreal_bloom_selective.html` that shows it. Adapt from there.

### 6.5 Hex completion effects

When a hex clears, three things happen simultaneously:

**Pulse ring.** A 2D ring (torus or flat ring geometry) spawns at the vertex in the hex's neon color. Over 620ms, it expands from radius 0.3 to 2.0 (world units), fading from opacity 1.0 to 0.0. Scale and fade both use ease-out-cubic. The ring is on the bloom layer so it glows hard.

**Triangle flash.** Each of the six triangles' outline `opacity` pulses via `1 + sin(t * π) * 0.85` over 260ms. Fills stay the same. The bloom on the outline means this reads as a bright white-hot flash.

**Shatter particles.** Each of the six triangles "shatters" into ~12 small triangles (`BufferGeometry` of tiny equilateral triangles, shared across all particles via `InstancedMesh` for perf). Particles spawn from random points inside the triangle, with initial velocity along radial from the vertex + random upward component + random rotation. Gravity pulls them down slightly. Fade opacity over 700ms. Use the neon color (bloomed).

After all three effects, fade out the triangle fills and outlines (200ms), assign new colors per the current phase's palette (§4.2), then fade in (260ms). A scan-line transition is nice but optional: a horizontal line sweeps across each refilled triangle, revealing the new color behind it.

Cascade reinforcement: on cascade wave 2, add a subtle camera shake (0.03 world-unit amplitude, 300ms). Wave 3+ amplifies this. Also show a screen-space floating text `×2!`, `×3!`, etc., in neon cyan, with a glow, that fades over 800ms.

### 6.6 Scanlines and chromatic aberration (optional but recommended)

A custom `ShaderPass` applied after bloom for CRT/neon feel:

**Scanlines:** darken every other pixel row by ~5%. Very subtle. Almost invisible individually but gives everything a texture.

```glsl
float scanline = mod(gl_FragCoord.y, 2.0) < 1.0 ? 0.95 : 1.0;
color.rgb *= scanline;
```

**Chromatic aberration:** sample R, G, B channels at slightly offset UVs (e.g. R offset by `(+1px, 0)`, B offset by `(-1px, 0)`). Offset amount should be small (~1–2 pixels) — just enough to give edges a subtle fringe. Don't overdo it.

### 6.7 Background — the grid floor

The game's background is a large horizontal plane extending far into the distance, rendered with a grid shader.

Camera setup:
- `PerspectiveCamera`, FOV 45°, aspect = window aspect, near 0.1, far 200
- Position: slightly above and in front of the board, looking slightly down
- Example: `camera.position.set(0, -1.5, 10)`, `camera.lookAt(0, 0, 0)` — the slight downward tilt exposes the grid floor behind the board

The grid floor:
- Geometry: `PlaneGeometry(200, 200)`, rotated to be horizontal (`rotation.x = -Math.PI / 2`)
- Position: `(0, -4, 0)` or wherever looks right below the board
- Material: `ShaderMaterial` with a custom grid shader:

```glsl
// Fragment shader sketch
uniform float uTime;
varying vec2 vUv;

void main() {
  vec2 grid = abs(fract(vUv * 40.0 - 0.5) - 0.5) / fwidth(vUv * 40.0);
  float line = min(grid.x, grid.y);
  float intensity = 1.0 - min(line, 1.0);
  
  // Fade with distance
  float dist = length(vUv - 0.5);
  intensity *= smoothstep(0.5, 0.0, dist);
  
  // Slow z-scroll
  float scroll = fract(vUv.y * 40.0 + uTime * 0.1);
  
  vec3 gridColor = vec3(0.0, 0.6, 1.0); // cyan
  gl_FragColor = vec4(gridColor * intensity, intensity * 0.7);
}
```

- Add subtle `FogExp2` with density 0.02 and color `#0A0612` so distant grid lines fade into the background.
- The grid plane goes on layer 1 (bloom) at lower intensity, so grid lines pick up a subtle glow.

**Optional additional background elements:**
- Starfield of glowing dots at `z = -50 to -100` using `Points` material with custom shader
- A large rotating neon ring in the far distance (barely visible, adds depth)
- Horizon glow: a thin bright band at the vanishing point on the horizon

### 6.8 Stone appearance

Stones are the visual opposite of neon triangles. They represent "dead" parts of the board.

- Fill: `#2A2A2A` (dark gray)
- Outline: `#555555` (mid gray), **not on bloom layer** — stones don't glow
- Optional detail: crack-pattern texture or a fractured mesh (break the triangle into 3–5 sub-polygons with dark borders between them) for visual interest
- On transformation (hex clears → triangle becomes stone): brief inward particle swirl (gray particles spiral into the triangle over 300ms), then the triangle "clicks" into stone appearance with a short shake

### 6.9 Tap feedback

- Valid vertex dots breathe gently (opacity 0.6 → 1.0 → 0.6 over 2s, staggered by phase so they're not all in sync — use each vertex's `(k + j)` as a phase offset)
- On tap: a small white ring pulses out from the vertex (radius 0.2 → 0.8, opacity 1 → 0, 420ms, ease-out)
- On invalid tap (e.g., vertex is frozen by stones): a brief red shake + short "ERR" beep

### 6.10 Phase transition effect

When a phase threshold is crossed:

1. **Pause spin resolution** for 1.6 seconds (no new spins accepted)
2. **Scanline sweep:** a horizontal neon cyan line traverses the screen top to bottom over 600ms. Behind the line: normal rendering. Ahead of the line: slightly desaturated / darker. (Implement as a shader pass with a `lineY` uniform.)
3. **Screen flash:** brief white flash at 15% opacity, 100ms
4. **Announcement text:** "PHASE 2" (or 3, 4) appears in the center of the screen, large, in the new color, with heavy bloom. Fades in 200ms, holds 800ms, fades out 400ms
5. **Palette strip update:** HUD palette strip (see §10) has the new color slot "ignite" — it was dim, now it's lit
6. **Audio:** synth stab + filter sweep
7. **Resume** spin input

---

## 7. Animation specs

All timings are milliseconds. All easings reference standard easing functions (`easeInOutCubic`, `easeOutCubic`, etc.).

| Event | Duration | Easing |
|-------|----------|--------|
| Spin rotation (60°) | 340 | easeInOutCubic |
| Tap pulse ring | 420 | easeOutCubic |
| Hex pulse ring | 620 | easeOutCubic |
| Hex flash (brightness) | 260 | sine pulse |
| Hex fade out | 200 | linear |
| Hex refill fade in | 260 | easeOutCubic |
| Shatter particle lifetime | 700 | custom (decel + gravity) |
| Phase scanline sweep | 600 | easeInOutCubic |
| Phase text appear | 200 in / 800 hold / 400 out | ease in/out |
| Camera shake decay | 300 | easeOutCubic |
| Vertex dot breathing | 2000 cycle | sine |
| Stone freeze effect | 300 | easeOutCubic |

Input debounce: no spin accepted while another spin or cascade is resolving. During phase transition: input locked for 1.6s total.

---

## 8. Audio direction

Style: synthwave / darkwave. References: Tron Legacy soundtrack (Daft Punk), Mirror's Edge Catalyst ambient, Hotline Miami bass hits.

Rough palette:
- **Ambient pad:** slow-evolving analog synth in A minor or C minor, low filter, ambient noise wash underneath. Always playing. Phase-shift slightly per phase.
- **Spin SFX:** short pitched-up noise sweep (about 100ms) + a tonal click at landing. Pitch varies slightly per spin to avoid repetition fatigue.
- **Hex clear SFX:** glass-shatter (mid-high frequencies) + a sub-bass thump. Reverb tail.
- **Cascade SFX:** a rising arpeggio — one note per cascade depth. Cascade 1 = C5, cascade 2 = D5, cascade 3 = F5, cascade 4 = A5, etc.
- **Phase transition SFX:** filter sweep (white noise → high-passed) + a detuned synth stab landing on a new chord
- **Game over SFX:** slow reverse cymbal into a long sustained bass tone, then silence

Implementation: Tone.js handles all of this cleanly. Not required for MVP but transforms the feel.

---

## 9. Input

### 9.1 Pointer handling

Use Pointer Events (not Mouse/Touch separately — Pointer Events unify them and are supported everywhere that matters).

On `pointerdown`:
- Convert screen coordinates to normalized device coordinates
- Raycast into the scene against a transparent hit-box mesh at each valid vertex (a circle of radius ~0.4 world units on z=0)
- If hit: begin tracking for tap vs long-press

On `pointerup`:
- If tracking started and fired within 300ms of pointerdown and pointer didn't move > 10px: **single tap** (spin CW)
- If pointer held > 500ms: **long-press** (spin CCW)

Alternative CCW gesture: two simultaneous pointers (two-finger tap). Detect via `pointerdown` count.

Disable input during any animation (`state.busy`).

### 9.2 Coordinate conversion

To convert pointer to vertex:
1. Raycast from pointer to z=0 plane
2. Get world coordinates `(wx, wy, 0)`
3. Account for board group offset
4. Compute nearest vertex: `k = round((wx + offset.x) / (S/2))`, `j = round(-(wy + offset.y) / H)`
5. Check validity via `(k + j) % 2 === 1` and boundary and stone checks

Alternatively, put an invisible `Circle` mesh at each valid vertex and raycast against those directly. Simpler and more robust.

---

## 10. HUD / UI

All HUD elements are HTML/CSS overlaid on the canvas (not drawn in WebGL — easier to style, scale, and handle text).

### 10.1 Layout

- **Top-center:** Score — large (~48px), neon cyan, light text-shadow glow, monospace font (try JetBrains Mono or similar)
- **Top-left:** Phase indicator
  - Small label: "PHASE 1"
  - Palette strip: 6 small circles showing each color. Active colors glow; inactive colors are dim outlines
- **Top-right:** Hex count ("23 hexes") + current combo multiplier ("×4" only visible during active cascade) + longest cascade record
- **Bottom-center:** during gameplay, nothing. On game over: overlay with stats and "Play again" button.

### 10.2 Styling

- Font family: a monospaced or geometric sans — `'JetBrains Mono', 'Space Mono', monospace` or `'Orbitron', sans-serif`
- Glow via `text-shadow: 0 0 8px <color>, 0 0 16px <color>` — fake the bloom in HTML
- Black or transparent backgrounds with neon-colored 1px borders
- No heavy UI chrome — the canvas is the hero

### 10.3 Game over overlay

Fullscreen semi-transparent black (`rgba(10, 6, 18, 0.85)`) with centered content:

```
─── RUN COMPLETE ───
Score          14,280
Phase reached     3
Hexes cleared    47
Longest cascade   5

[ PLAY AGAIN ]
```

Neon styling throughout. The "PLAY AGAIN" button on hover: background pulses in the accent color.

---

## 11. Data structures

### 11.1 Triangle state

```javascript
// triangles is a dictionary keyed by `${col},${row}`
{
  "0,0":  { col: 0, row: 0, color: "#FF1493", isStone: false, mesh: <Triangle> },
  "1,0":  { col: 1, row: 0, color: "#00F0FF", isStone: false, mesh: <Triangle> },
  // ... 60 entries
}
```

### 11.2 Game state

```javascript
const gameState = {
  phase: 1,              // 1–4
  hexCount: 0,           // total cleared this run
  score: 0,
  longestCascade: 0,
  currentCascade: 0,     // cascade depth of currently-resolving spin
  spins: 0,
  busy: false,           // input lock
  status: 'idle',        // 'idle' | 'spinning' | 'resolving' | 'phase_transition' | 'game_over'
  activeColors: [<hex strings in current palette>]
};
```

### 11.3 State machine

```
idle → spinning (on valid tap)
spinning → resolving (after rotation animation completes)
resolving → resolving (cascade loop)
resolving → phase_transition (if hexCount crosses threshold)
resolving → idle (no more cascades, no phase change)
phase_transition → idle (after 1.6s)
idle → game_over (if no valid vertex remains)
game_over → idle (on "Play again")
```

---

## 12. Suggested file structure

```
src/
  main.js                   // entry, bootstrap, requestAnimationFrame loop
  
  game/
    board.js                // triangles dict, grid init, ring math, valid-vertex checks
    rules.js                // completion detection, scoring, phase management
    state.js                // game state machine, transitions
    stones.js               // stone mechanic (roll, conversion, validity filter)

  render/
    scene.js                // Three.js scene, camera, fog setup
    triangles.js            // Triangle class: fill + outline, setColor, fade
    background.js           // grid floor shader material, starfield
    effects.js              // particles, pulse rings, camera shake
    postprocess.js          // EffectComposer, selective bloom, shader passes
    shaders/
      grid.glsl             // grid floor fragment shader
      scanline.glsl         // scanline + chromatic aberration
      selectiveBloom.glsl   // final composite shader for selective bloom

  input/
    pointer.js              // pointer events, tap/long-press detection, raycasting

  audio/
    sfx.js                  // sound effect triggers (no-op if audio disabled)
    music.js                // ambient loop, phase crossfades

  ui/
    hud.js                  // HTML HUD, score ticker, palette strip
    overlay.js              // game over overlay, phase transition announcement

  utils/
    math.js                 // vertex/triangle position helpers, ring, easing
    animate.js              // Promise-returning tween helper
    colors.js               // palette constants, dark-variant computation

index.html                  // canvas + HUD container
style.css                   // HUD styles
```

---

## 13. Implementation roadmap

Build in this order. Each step should be playable before moving to the next.

1. **Scene + grid of flat colored triangles.** PerspectiveCamera, black background. Render all 60 triangles with random colors from a small palette. No interaction yet. Verify geometry math — every triangle should tile perfectly with no gaps or overlaps.

2. **Vertex interaction.** Place transparent hitbox circles at each valid vertex. Raycast on pointerdown. Log which vertex was tapped. Verify `ring(k, j)` returns the correct six triangles by highlighting them briefly.

3. **Spin animation (no colors yet).** On tap, rotate the six triangles' meshes 60° around the vertex in the xy-plane. Use a Promise-based tween helper. Once the rotation lands, reset transforms (next iteration will update colors). Verify the rotation direction feels clockwise on screen (flip sign if needed).

4. **Color shift.** After rotation, update triangle colors per the CW shift formula. Now the board actually plays.

5. **Completion detection and clear.** Add `findCompletedHexes`, fade/clear/refill pipeline, cascade loop. Still flat colors, no particles yet. Verify cascades trigger when they should.

6. **Neon conversion.** Replace single-material meshes with fill + Line2 outline pairs. Set dark fill colors, bright outline colors. Set up EffectComposer with UnrealBloomPass applied to everything (non-selective) just to verify bloom works. Tune strength/radius/threshold.

7. **Selective bloom.** Implement layer-based selective bloom so only outlines glow, fills stay dark. This is the biggest single visual upgrade — spend time here. Reference the Three.js examples `webgl_postprocessing_unreal_bloom_selective.html`.

8. **Particles for hex completion.** Use `InstancedMesh` of tiny triangle geometries. Spawn ~72 particles per hex (12 per triangle × 6). Velocity + gravity + fade. On bloom layer.

9. **Background grid floor.** Perspective camera, plane below board, grid shader, slow Z scroll. Fog for distance fade. Tune camera angle so the grid reads clearly without stealing attention from the board.

10. **Phase progression.** Color palette gating, stone rolling, validity filter. Add stone rendering (dead gray style). Test that runs actually end.

11. **Scoring + HUD.** Score counter, phase indicator with palette strip, hex count, cascade multiplier display. Floating score numbers at hex-pop locations.

12. **Phase transition effect.** Scanline sweep shader, announcement text, input lock. Make each new phase feel like a real threshold.

13. **Polish pass.** Scanlines, chromatic aberration, camera shake, vertex breathing, tap feedback, game-over overlay. All the small things that make it feel alive.

14. **Audio.** Add Tone.js, hook up all the SFX triggers, background ambient layer. Can ship without audio but the game feels 40% less good without it.

15. **Performance pass.** Test on mid-range mobile. If bloom is too slow, render bloom pass at half resolution. If particles are too slow, reduce count or use a simpler particle shader. Verify 60fps target.

---

## 14. Key code snippets for the tricky parts

### 14.1 Vertex position, ring, and validity

```javascript
const S = 1.0;
const H = S * Math.sqrt(3) / 2;
const ROWS = 6;
const COLS = 10;

const vPos = (k, j) => [k * S / 2, -j * H, 0];

const key = (c, r) => `${c},${r}`;

const ring = (k, j) => [
  [k-1, j-1], [k, j-1], [k, j],
  [k-1, j],   [k-2, j], [k-2, j-1]
];

const isValidVertex = (k, j, triangles) => {
  if ((k + j) % 2 !== 1) return false;
  const ts = ring(k, j);
  return ts.every(([c, r]) => {
    const t = triangles[key(c, r)];
    return t && !t.isStone;
  });
};
```

### 14.2 Spin with color shift

```javascript
async function spin(k, j) {
  if (gameState.busy || !isValidVertex(k, j, triangles)) return;
  gameState.busy = true;
  
  const ts = ring(k, j);
  const [vx, vy] = vPos(k, j);
  const origColors = ts.map(([c, r]) => triangles[key(c, r)].color);

  // Move the six triangle groups under a rotation pivot
  const pivot = new THREE.Group();
  pivot.position.set(vx, vy, 0);
  boardGroup.add(pivot);
  ts.forEach(([c, r]) => {
    const t = triangles[key(c, r)];
    // Reparent while preserving world position
    pivot.attach(t.mesh.group);
  });

  // Animate rotation
  await tween(340, 'easeInOutCubic', t => {
    pivot.rotation.z = -t * (Math.PI / 3); // -60°: negative z gives visual CW
  });

  // Commit colors: triangle in slot i receives color from slot (i-1+6)%6
  ts.forEach(([c, r], i) => {
    const newColor = origColors[(i + 5) % 6];
    triangles[key(c, r)].color = newColor;
    triangles[key(c, r)].mesh.setColor(newColor);
  });
  
  // Reparent back to boardGroup, restoring world position
  ts.forEach(([c, r]) => {
    const t = triangles[key(c, r)];
    boardGroup.attach(t.mesh.group);
  });
  boardGroup.remove(pivot);

  await resolveCompletions();
  gameState.busy = false;
}
```

Note the `pivot.attach()` / `boardGroup.attach()` pattern — `attach` preserves world position when reparenting, which `add` does not. This keeps triangles visually stationary until the rotation applies.

Note on rotation sign: `rotation.z = -angle` produces visually clockwise rotation when the camera looks in the `-z` direction with `+y` up. Verify in your scene and flip if needed.

### 14.3 Resolve completions (cascade loop)

```javascript
async function resolveCompletions() {
  let cascade = 0;
  while (true) {
    const done = findCompletedHexes();
    if (done.length === 0) break;
    cascade++;
    gameState.currentCascade = cascade;
    gameState.longestCascade = Math.max(gameState.longestCascade, cascade);

    // Score
    const pointsPerHex = 100 * phaseMultiplier() * Math.pow(2, cascade - 1) * done.length;
    done.forEach(d => {
      gameState.score += pointsPerHex;
      spawnFloatingScore(vPos(d.k, d.j), pointsPerHex);
    });
    gameState.hexCount += done.length;

    // Collect unique affected triangles
    const keySet = new Set();
    done.forEach(d => d.ts.forEach(([c, r]) => keySet.add(key(c, r))));
    const affected = [...keySet];

    // Fire pulse rings
    done.forEach(d => spawnPulseRing(vPos(d.k, d.j), d.color));

    // Flash outlines
    await flashOutlines(affected, 260);

    // Fade out and shatter
    await Promise.all([
      fadeOutTriangles(affected, 200),
      shatterTriangles(affected)
    ]);

    // Roll stones (phase 3+)
    affected.forEach(k => {
      if (Math.random() < phaseStoneChance()) {
        triangles[k].isStone = true;
        triangles[k].mesh.setStone();
      }
    });

    // Refill colors (skip stones)
    affected.forEach(k => {
      if (triangles[k].isStone) return;
      const newColor = randomActiveColor();
      triangles[k].color = newColor;
      triangles[k].mesh.setColor(newColor);
    });

    // Fade in
    await fadeInTriangles(affected.filter(k => !triangles[k].isStone), 260);

    // Check phase advancement
    if (shouldAdvancePhase()) {
      await playPhaseTransition();
    }

    // Check game over
    if (!anyValidVertexExists()) {
      return triggerGameOver();
    }
  }
  gameState.currentCascade = 0;
}
```

### 14.4 Tween helper

```javascript
const easings = {
  linear: t => t,
  easeInOutCubic: t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2,
  easeOutCubic: t => 1 - Math.pow(1 - t, 3),
  sinePulse: t => Math.sin(t * Math.PI)
};

function tween(durationMs, easing, onFrame) {
  return new Promise(resolve => {
    const t0 = performance.now();
    const ease = typeof easing === 'string' ? easings[easing] : easing;
    function frame() {
      const raw = Math.min((performance.now() - t0) / durationMs, 1);
      onFrame(ease(raw), raw);
      if (raw < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}
```

### 14.5 Selective bloom outline (sketch)

```javascript
// Outline construction
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

function makeTriangleOutline(vertices, neonColor) {
  const geom = new LineGeometry();
  const positions = [
    ...vertices[0], ...vertices[1], ...vertices[2], ...vertices[0]
  ];
  geom.setPositions(positions);

  const mat = new LineMaterial({
    color: neonColor,
    linewidth: 3, // in pixels
    transparent: true,
    opacity: 1.0,
    depthTest: false
  });
  mat.resolution.set(window.innerWidth, window.innerHeight);

  const line = new Line2(geom, mat);
  line.layers.set(1); // bloom layer
  return line;
}
```

The full selective-bloom composite setup (scene walk, material darkening for non-bloom objects, render target juggling) is involved — adapt it from the Three.js example. Don't try to invent it.

### 14.6 Grid floor shader

```javascript
const gridMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0x00F0FF) }
  },
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vWorldPos;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uColor;
    varying vec2 vUv;
    varying vec3 vWorldPos;
    void main() {
      vec2 scrolled = vUv + vec2(0.0, uTime * 0.01);
      vec2 grid = abs(fract(scrolled * 40.0 - 0.5) - 0.5) / fwidth(scrolled * 40.0);
      float line = 1.0 - min(min(grid.x, grid.y), 1.0);

      // Fade with distance from camera (z in world space)
      float dist = length(vWorldPos.xz);
      float fade = smoothstep(80.0, 10.0, dist);

      gl_FragColor = vec4(uColor * line * fade, line * fade * 0.8);
    }
  `,
  transparent: true,
  depthWrite: false
});

const gridPlane = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), gridMat);
gridPlane.rotation.x = -Math.PI / 2;
gridPlane.position.y = -4;
gridPlane.layers.enable(1); // optional: also bloom
scene.add(gridPlane);
```

---

## 15. Platform and performance notes

- **Bloom is the most expensive pass.** On mid-range mobile, render the bloom pass at half resolution: `bloomPass.setSize(window.innerWidth / 2, window.innerHeight / 2)`.
- **InstancedMesh for particles.** Don't spawn 72 separate meshes per hex clear — use one `InstancedMesh` with 72+ instances per particle emitter.
- **Avoid re-allocating geometries.** Triangle meshes should be created once and reused; only their material colors change.
- **Line2 resolution update.** On every window resize, update `LineMaterial.resolution` for every outline material. Keep a registry of outline materials to iterate.
- **Pixel ratio.** Cap at `Math.min(window.devicePixelRatio, 2)` to avoid hairline-retina performance death on iPhones.
- **Audio autoplay.** Browsers block audio until user interaction. Initialize Tone.js on first pointerdown.
- **Preserving battery.** Pause render loop when document is `hidden` (visibility API). Resume on visibilitychange.

---

## 16. Out of scope for v1

These are tempting but should wait:

- **Puzzle mode** with fixed boards, move limits, hand-designed levels.
- **Meta-progression** (unlockable color palettes, board shapes, power-ups between runs).
- **Power-ups** mid-run (bombs, color-swap, shuffle, undo).
- **Dual-ring spins** that spin two adjacent rings simultaneously.
- **Leaderboards** or online score submission.
- **Custom board shapes** (hexagonal, triangular, ring, etc.).
- **Multiple simultaneous palettes** per hex (color-coded zones).

Keep v1 focused: one board shape, one mode (arcade endless), four phases, stones, cascade scoring, neon aesthetic. Ship that, then decide what to build next based on how it actually plays.

---

## 17. Success criteria for v1

The build is done when:

1. A new run starts in Phase 1 with 3 colors and 0 stones.
2. Every tap lands a smooth 340ms 60° rotation with neon glow intact throughout.
3. Completed hexes shatter into visible neon particles and refill correctly.
4. Cascades stack visually and audibly (score multiplier visible).
5. Phase transitions happen at the right thresholds with a clearly readable announcement.
6. Stones appear in phase 3+ and reduce the tappable vertex set correctly.
7. Run ends when no vertex is tappable; game-over screen shows accurate stats.
8. Everything runs at 60fps on a mid-range mobile device.
9. The background grid floor reads as depth without overwhelming the foreground.
10. You play it for ten minutes and want to play it again.

Point 10 is the only one that matters.
