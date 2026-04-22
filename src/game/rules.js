import { ROWS, COLS, ring, isRealVertex, key, vPos } from '../utils/math.js';
import {
  gameState,
  nextPhaseFromHexCount,
  advancePhase,
  freshnessMultiplier,
  isColorSuppressed,
  suppressColor,
} from './state.js';

export const MAX_CASCADE = 50;
// Gap between per-hex pops in a multi-hex wave. Each hex fires audio + VFX in
// one synchronous instruction, then we wait this long before the next.
export const HEX_BEAT_MS = 200;

// Scoring: pointsPerHex = 100 × freshMult × 2^(phase-1) × 2^(cascade-1).
// freshMult rewards fast hits (2.0× on first spin after last clear → 1.1× floor).
// `m` (wave size) intentionally does NOT scale per-hex: a dual kill is rewarded
// via a flat multi-kill bonus (see computeMultiKillBonus) that front-loads at
// m=2 and tapers for m≥3, since m=2 is skill and m≥3 is usually luck.
export function computeWaveScore(phase, cascade, m, freshMult = 1) {
  return 100 * freshMult * Math.pow(2, phase - 1) * Math.pow(2, cascade - 1);
}

// Flat bonus applied once per wave when ≥2 hexes pop simultaneously. Scales
// with freshMult / phase / cascade so it stays proportional to the wave's own
// per-hex math. Shape front-loads at m=2 (dual kill = skillful setup) and
// tapers for larger m (deep multis are mostly RNG).
export function computeMultiKillBonus(m, phase, cascade, freshMult = 1) {
  if (m < 2) return 0;
  const shape = m === 2 ? 6 : m === 3 ? 7.5 : 8 + (m - 4);
  return 100 * shape * freshMult * Math.pow(2, phase - 1) * Math.pow(2, cascade - 1);
}

export function findCompletedHexes(board) {
  const done = [];
  for (let j = 0; j <= ROWS; j++) {
    for (let k = 0; k <= COLS; k++) {
      if (!isRealVertex(k, j)) continue;
      const ts = ring(k, j);
      const cells = [];
      let skip = false;
      for (const [c, r] of ts) {
        const t = board[key(c, r)];
        if (!t) {
          skip = true;
          break;
        }
        cells.push(t);
      }
      if (skip) continue;
      const first = cells[0].color;
      if (cells.every((t) => t.color === first)) {
        done.push({ k, j, ts, color: first });
      }
    }
  }
  return done;
}

function defaultPicker(activeColors) {
  return () => {
    const pool = activeColors.filter((c) => !isColorSuppressed(c));
    const eff = pool.length > 0 ? pool : activeColors;
    return eff[Math.floor(Math.random() * eff.length)];
  };
}

export async function resolveCompletions(ctx) {
  const { board, triangleViews, activeColors, onCascadeWave, onHexBeat, effects, hooks } = ctx;
  const pickColor = ctx.pickColor ?? defaultPicker(activeColors);
  // Stagger is purely presentational — skip the awaits in tests (no effects).
  const shouldStagger = !!effects;

  let cascade = 0;
  let totalHexes = 0;
  // Freshness is locked at the start of the tap's cascade so every wave from
  // this spin shares the same bonus (spec: one fresh tap, one reward tier).
  const freshMult = freshnessMultiplier(gameState.spinsSinceLastClear);

  while (true) {
    const done = findCompletedHexes(board);
    if (done.length === 0) break;

    cascade++;
    if (cascade > MAX_CASCADE) {
      console.warn(`Cascade depth exceeded ${MAX_CASCADE}; aborting to avoid infinite loop.`);
      cascade = MAX_CASCADE;
      break;
    }
    totalHexes += done.length;

    const pointsPerHex = computeWaveScore(gameState.phase, cascade, done.length, freshMult);
    const multiKillBonus = computeMultiKillBonus(
      done.length,
      gameState.phase,
      cascade,
      freshMult,
    );
    if (onCascadeWave)
      onCascadeWave({ cascade, hexes: done, pointsPerHex, multiKillBonus, freshMult });

    const affectedKeys = new Set();
    for (const d of done) for (const [c, r] of d.ts) affectedKeys.add(key(c, r));
    const affected = [...affectedKeys];

    for (let i = 0; i < done.length; i++) {
      const d = done[i];
      const [vx, vy] = vPos(d.k, d.j);
      if (onHexBeat) onHexBeat({ hex: d, index: i, count: done.length, cascade });
      effects?.hexPulse?.(vx, vy, d.color);
      effects?.implode?.(vx, vy, d.color);
      effects?.streaks?.(vx, vy, d.color);
      if (effects?.shatter) {
        setTimeout(() => effects.shatter(vx, vy, d.color, 16), 360);
      }
      if (shouldStagger && i < done.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, HEX_BEAT_MS));
      }
    }

    await Promise.all(affected.map((k) => triangleViews[k].flash?.(260)));
    await Promise.all(affected.map((k) => triangleViews[k].fade?.(0, 200)));

    // Color elimination: fires only when *this wave's clears* take a color from
    // present → absent. We compare colors in the affected (cleared) cells
    // against colors still on the rest of the board. Just checking "absent
    // from board" would re-fire on every later wave once suppression decays
    // (colors stay absent until a refill randomly reintroduces them).
    const affectedSet = new Set(affected);
    const clearedColors = new Set();
    const remainingColors = new Set();
    for (const k of Object.keys(board)) {
      if (affectedSet.has(k)) clearedColors.add(board[k].color);
      else remainingColors.add(board[k].color);
    }
    const eliminated = activeColors.filter(
      (c) => clearedColors.has(c) && !remainingColors.has(c),
    );
    if (eliminated.length > 0) {
      for (const c of eliminated) suppressColor(c);
      hooks?.onColorEliminated?.({
        colors: eliminated,
        cascade,
        phase: gameState.phase,
        freshMult,
      });
    }

    // Refill — only visible triangles get new colors. Phantom slots are sacred.
    // pickColor receives the cell so custom pickers (e.g. the demo) can pick
    // deterministically based on triangle parity.
    for (const k of affected) {
      const cell = board[k];
      const c = pickColor(cell);
      cell.color = c;
      triangleViews[k].setColor(c);
    }

    await Promise.all(affected.map((k) => triangleViews[k].fade?.(1, 260)));
  }

  // Reset the freshness counter when this tap cleared anything — next spin
  // starts a new run-up.
  if (totalHexes > 0) gameState.spinsSinceLastClear = 0;

  // Phase advance after cascade fully resolves so player isn't interrupted.
  const next = nextPhaseFromHexCount(gameState.phase, gameState.hexCount);
  if (next) {
    advancePhase(next);
    hooks?.onPhaseChange?.(next);
  }

  return { cascades: cascade, totalHexes };
}
