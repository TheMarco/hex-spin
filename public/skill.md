# Rotatron — Agent Playbook

Rotatron is a single-player, real-time arcade puzzler on a hex-shaped triangle grid. Tap a vertex, six triangles around it rotate 60° clockwise carrying their colors, matching hexagons shatter. A heat bar drains continuously; clears refill it; empty heat ends the run. No opponent, no turns — you race the heat.

## Your role

You are the sole player. There is no color assignment, no turn ordering, no opponent to track. Every tick of wall-clock time drains heat, so latency costs survival.

Rotatron integrates the RCADIA Tournament SDK (`INITIALIZE` on load, `CONSUME_LIFE` + `SUBMIT_SCORE` on game over). The Agent SDK postMessage protocol described below mirrors the internal game state for agents that can interact in real time.

## State shape

```json
{
  "phase": 1,
  "score": 0,
  "heat": 1.0,
  "spinsSinceLastClear": 0,
  "activeColors": ["#ff3b6b", "#00e5ff", "#ffb300"],
  "suppressedColors": {},
  "status": "idle",
  "board": [
    { "col": 3, "row": 0, "color": "#ff3b6b", "isUp": false },
    { "col": 4, "row": 0, "color": "#00e5ff", "isUp": true }
  ]
}
```

- `phase` — integer 1..4. Each phase adds one color and increases heat drain (+22% per phase over baseline).
- `score` — cumulative points this run.
- `heat` — float in [0, 1]. Drains continuously while `status === "idle"`. Reaches 0 → game over.
- `spinsSinceLastClear` — integer used for freshness multiplier. Taps that clear hexes reset it.
- `activeColors` — array of hex color strings currently in circulation.
- `suppressedColors` — map of `{ color: spinsRemaining }` — colors recently eliminated, temporarily excluded from refills.
- `status` — one of `idle`, `phase_transition`, `paused`, `game_over`, `title`. Actions are only accepted while `idle`.
- `board` — array of 54 triangle cells. `(col, row)` identifies the slot, `isUp = (col + row) % 2 === 0`, `color` is the current fill.

The board is a flat-top hex made of 54 small triangles inside a 12×7 rectangular scan. Cells outside the hex are not present in the array.

## Action shape

```json
{ "type": "spin", "k": 6, "j": 3 }
```

- `type` — must be `"spin"`.
- `k`, `j` — vertex coordinates. A vertex is valid iff `(k + j) % 2 === 1` and its six-triangle ring intersects the playable hex. The tapped vertex becomes the pivot; the six triangles around it rotate 60° clockwise, carrying their colors one slot forward in the ring.

Edge vertices are playable. Their rings include "phantom" slots outside the board that hold hidden colors; those colors can be pulled onto the board by spinning at the edge.

## Rules

- A hexagon completes when all six triangles in a vertex's ring share the same color.
- Completed hexes shatter, score points, refill heat, and are replaced with new colors from `activeColors` (minus currently suppressed colors).
- Cascades chain: refills that form new hexes detonate the next wave, up to 50 deep.
- Scoring per cleared hex: `100 × freshMult × 2^(phase-1) × 2^(cascade-1)`.
- Multi-kill bonus (2+ hexes in one wave): `100 × shape(m) × freshMult × 2^(phase-1) × 2^(cascade-1)` where `shape(2)=6, shape(3)=7.5, shape(m≥4)=8+(m-4)`.
- Freshness multiplier: `1 + clamp(1000 − 100·(spinsSinceLastClear − 1), 100, 1000) / 1000` — ranges from 2.0× (first spin) to 1.1× (10+ spins).
- Clearing the last triangle of a color awards `1500 × freshMult × 2^(phase-1)` and suppresses that color from refills for 4 spins.
- Phase advances at score thresholds `{ 2: 11, 3: 26, 4: 51 }` cleared hexes. Phase transitions introduce one new color and briefly pause input.

## Picking a move

- Legal vertices are all `(k, j)` with `(k + j) % 2 === 1` inside or on the hex boundary.
- Ring geometry is clockwise starting from the north slot; slot `i` receives the color from slot `(i + 5) % 6`.
- Heuristics: prefer spins that immediately complete a hex; otherwise prefer spins that set up a complete-on-next-spin state; otherwise conserve heat by tapping the vertex that creates the shortest path to a completion.

## How the game ends

| Reason       | Meaning                                        | Result                     |
| ------------ | ---------------------------------------------- | -------------------------- |
| `heat_empty` | Heat bar reached 0 while status was `idle`.    | Final score submitted.     |
| `player_quit`| Page closed or navigated away.                 | No score submitted.        |

Rotatron has no win condition — only a high-score chase. Longer survival at higher phases multiplies everything.

## Turn timeout

There is no turn timeout. Heat drains at `HEAT_DRAIN_PER_SEC = 0.00886` scaled by phase (phase 1 ≈ 113 s grace from full to empty, phase 4 ≈ 68 s). Every second of inaction shrinks the window for the next clear.

## Gotchas

- **Vertex parity:** `(k + j)` must be odd. Even-parity `(k, j)` points are triangle edges, not corners, and will be rejected.
- **Busy lock:** while a spin + cascade is resolving (`gameState.busy === true`), new actions are rejected. Wait for `status === "idle"` and `busy === false` before submitting.
- **Phantom slots:** colors entering from off-board come from a persistent hidden buffer. The buffer survives between spins but reseeds on phase change.
- **Completion detection skips phantoms:** a ring of six matching colors only counts as a completed hex if all six slots are real (on-board) triangles. Phantom-backed rings never complete.
- **Cascades share freshness:** the freshness multiplier is locked at the start of each cascade, so every wave from one tap pays at the same tier.

## Minimal loop (pseudocode)

```js
// Agent integration sketch — subscribe to state, submit actions via postMessage.
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.type !== 'STATE') return;
  if (msg.state.status !== 'idle') return;

  const vertex = pickBestVertex(msg.state);
  if (!vertex) return;

  window.parent.postMessage(
    { type: 'ACTION', action: { type: 'spin', k: vertex.k, j: vertex.j } },
    '*'
  );
});
```
