import { ROWS, COLS, ring, isRealVertex, key, vPos } from '../utils/math.js';
import { gameState, nextPhaseFromHexCount, advancePhase } from './state.js';

export const MAX_CASCADE = 50;

// Spec §5 scoring: 100 × 2^(phase-1) × 2^(cascade-1) × m
export function computeWaveScore(phase, cascade, m) {
  return 100 * Math.pow(2, phase - 1) * Math.pow(2, cascade - 1) * m;
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

    const pointsPerHex = computeWaveScore(gameState.phase, cascade, done.length);
    if (onCascadeWave) onCascadeWave({ cascade, hexes: done, pointsPerHex });

    const affectedKeys = new Set();
    for (const d of done) for (const [c, r] of d.ts) affectedKeys.add(key(c, r));
    const affected = [...affectedKeys];

    for (const d of done) {
      const [vx, vy] = vPos(d.k, d.j);
      effects?.hexPulse?.(vx, vy, d.color);
      effects?.implode?.(vx, vy, d.color);
      if (effects?.shatter) {
        setTimeout(() => effects.shatter(vx, vy, d.color, 10), 360);
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

  // Phase advance after cascade fully resolves so player isn't interrupted.
  const next = nextPhaseFromHexCount(gameState.phase, gameState.hexCount);
  if (next) {
    advancePhase(next);
    hooks?.onPhaseChange?.(next);
  }

  return { cascades: cascade, totalHexes };
}
