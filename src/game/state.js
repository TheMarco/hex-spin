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

// Freshness multiplier — rewards fast hits. Reset after any cascade that clears.
// Scales score from 2.0× (first spin after last clear) down to 1.1× (10+ spins).
export const FRESH_BONUS_MAX = 1000;
export const FRESH_BONUS_MIN = 100;
export const FRESH_BONUS_STEP = 100;

// Color elimination — clearing the last triangle of a color awards a flat
// bonus (scaled by phase) and locks that color out of refills for a few spins,
// giving the player a temporary thinned-palette window to chain follow-ups.
export const COLOR_ELIM_BONUS_BASE = 5000;
export const COLOR_ELIM_HEAT_BONUS = 0.18;
export const COLOR_ELIM_SUPPRESSION_SPINS = 4;

export function drainMultiplierForPhase(phase) {
  return 1 + (phase - 1) * HEAT_PHASE_DRAIN_SCALE;
}

export function freshnessMultiplier(spinsSinceLastClear) {
  const raw = FRESH_BONUS_MAX - FRESH_BONUS_STEP * (spinsSinceLastClear - 1);
  const bonus = Math.max(FRESH_BONUS_MIN, Math.min(FRESH_BONUS_MAX, raw));
  return 1 + bonus / 1000;
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
  spinsSinceLastClear: 0,
  busy: false,
  status: 'idle',
  activeColors: activePalette(1),
  heat: HEAT_START,
  suppressedColors: {},
};

export function resetGameState() {
  gameState.phase = 1;
  gameState.hexCount = 0;
  gameState.score = 0;
  gameState.longestCascade = 0;
  gameState.currentCascade = 0;
  gameState.spins = 0;
  gameState.spinsSinceLastClear = 0;
  gameState.busy = false;
  gameState.status = 'idle';
  gameState.activeColors = activePalette(1);
  gameState.heat = HEAT_START;
  gameState.suppressedColors = {};
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

// Jump the run state to the start of a given phase. Used by the ?phase= URL param.
// Sets hexCount to the entry threshold so natural progression to the next phase still works.
export function setInitialPhase(toPhase) {
  const clamped = Math.max(1, Math.min(4, Math.floor(toPhase)));
  gameState.phase = clamped;
  gameState.activeColors = activePalette(clamped);
  gameState.hexCount = clamped === 1 ? 0 : PHASE_THRESHOLDS[clamped];
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

// Color suppression: refills skip these colors for the recorded number of
// spins so the eliminated color stays off the board long enough for the
// player to set up a follow-up combo on a thinned palette.
export function suppressColor(color, spins = COLOR_ELIM_SUPPRESSION_SPINS) {
  if (!color) return;
  gameState.suppressedColors[color] = spins;
}

export function isColorSuppressed(color) {
  return (gameState.suppressedColors[color] ?? 0) > 0;
}

// Decrement every counter once. Removes entries that hit zero. Called once
// per successful spin so suppression is measured in player taps.
export function tickColorSuppression() {
  for (const color of Object.keys(gameState.suppressedColors)) {
    const next = gameState.suppressedColors[color] - 1;
    if (next <= 0) delete gameState.suppressedColors[color];
    else gameState.suppressedColors[color] = next;
  }
}

// Picker pool for refills: activeColors minus suppressed. Falls back to the
// full palette if suppression would empty the pool (can happen if multiple
// colors are eliminated at low phase counts).
export function getPickableColors() {
  const pool = gameState.activeColors.filter((c) => !isColorSuppressed(c));
  return pool.length > 0 ? pool : gameState.activeColors;
}
