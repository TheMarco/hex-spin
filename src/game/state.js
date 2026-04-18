import { getThemeIdForPhase, getThemePhasePalettes } from '../utils/colors.js';

export const PHASE_THRESHOLDS = { 2: 11, 3: 26, 4: 51 };

// Heat bar — replaces stones as the run-end mechanic. 0..1 range.
// Drains while idle, refills on clears. Empty = game over.
// Drain scales with phase so higher levels feel more urgent:
//   phase 1: 1.0× (base 0.7%/s → 143s grace)
//   phase 2: 1.22×               (117s)
//   phase 3: 1.44×                (99s)
//   phase 4: 1.66×                (86s)
export const HEAT_START = 1.0;
export const HEAT_MAX = 1.0;
export const HEAT_DRAIN_PER_SEC = 0.007;
export const HEAT_PHASE_DRAIN_SCALE = 0.22; // +22% drain per phase beyond 1
export const HEAT_HEX_BASE = 0.18;
export const HEAT_PHASE_BONUS = 0.4;
export const HEAT_DANGER = 0.3;

export function drainMultiplierForPhase(phase) {
  return 1 + (phase - 1) * HEAT_PHASE_DRAIN_SCALE;
}

function activePalette(phase) {
  return [...getThemePhasePalettes(getThemeIdForPhase(phase))[phase]];
}

export const gameState = {
  phase: 1,
  hexCount: 0,
  score: 0,
  longestCascade: 0,
  currentCascade: 0,
  spins: 0,
  busy: false,
  status: 'idle',
  activeColors: activePalette(1),
  heat: HEAT_START,
};

export function resetGameState() {
  gameState.phase = 1;
  gameState.hexCount = 0;
  gameState.score = 0;
  gameState.longestCascade = 0;
  gameState.currentCascade = 0;
  gameState.spins = 0;
  gameState.busy = false;
  gameState.status = 'idle';
  gameState.activeColors = activePalette(1);
  gameState.heat = HEAT_START;
}

export function nextPhaseFromHexCount(currentPhase, hexCount) {
  for (const next of [2, 3, 4]) {
    if (next > currentPhase && hexCount >= PHASE_THRESHOLDS[next]) return next;
  }
  return null;
}

export function advancePhase(toPhase) {
  gameState.phase = toPhase;
  gameState.activeColors = activePalette(toPhase);
}

export async function withBusy(work) {
  if (gameState.busy) return null;
  gameState.busy = true;
  try {
    return await work();
  } finally {
    gameState.busy = false;
  }
}

// Heat: drained only while the run is active (not during phase transitions or game over).
export function drainHeat(deltaSeconds) {
  if (gameState.status !== 'idle') return;
  const rate = HEAT_DRAIN_PER_SEC * drainMultiplierForPhase(gameState.phase);
  gameState.heat = Math.max(0, gameState.heat - rate * deltaSeconds);
}

// Heat gain from a single cascade wave of N hexes. Quadratic in N so chains
// of multiple simultaneous hexes are strongly rewarded.
export function heatGainFromWave(nHexes) {
  return HEAT_HEX_BASE * nHexes * nHexes;
}

export function addHeat(amount) {
  gameState.heat = Math.min(HEAT_MAX, gameState.heat + amount);
}

export function isHeatEmpty() {
  return gameState.heat <= 0.0001;
}
