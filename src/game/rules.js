import { ROWS, COLS, ring, isRealVertex, key, vPos } from '../utils/math.js';
import { gameState, nextPhaseFromHexCount, advancePhase, freshnessMultiplier } from './state.js';

export const MAX_CASCADE = 50;

// Scoring: 100 × freshMult × 2^(phase-1) × 2^(cascade-1) × m
// freshMult rewards fast hits (2.0× on first spin after last clear → 1.1× floor).
export function computeWaveScore(phase, cascade, m, freshMult = 1) {
  return 100 * freshMult * Math.pow(2, phase - 1) * Math.pow(2, cascade - 1) * m;
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
  return () => activeColors[Math.floor(Math.random() * activeColors.length)];
}

export async function resolveCompletions(ctx) {
  const { board, triangleViews, activeColors, onCascadeWave, effects, hooks } = ctx;
  const pickColor = ctx.pickColor ?? defaultPicker(activeColors);

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
    if (onCascadeWave) onCascadeWave({ cascade, hexes: done, pointsPerHex, freshMult });

    const affectedKeys = new Set();
    for (const d of done) for (const [c, r] of d.ts) affectedKeys.add(key(c, r));
    const affected = [...affectedKeys];

    for (const d of done) {
      const [vx, vy] = vPos(d.k, d.j);
      effects?.hexPulse?.(vx, vy, d.color);
      effects?.implode?.(vx, vy, d.color);
      effects?.streaks?.(vx, vy, d.color);
      if (effects?.glitter) setTimeout(() => effects.glitter(vx, vy, d.color), 240);
      if (effects?.shatter) {
        setTimeout(() => effects.shatter(vx, vy, d.color, 16), 360);
      }
    }

    await Promise.all(affected.map((k) => triangleViews[k].flash?.(260)));
    await Promise.all(affected.map((k) => triangleViews[k].fade?.(0, 200)));

    // Refill — only visible triangles get new colors. Phantom slots are sacred.
    for (const k of affected) {
      const c = pickColor();
      board[k].color = c;
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
