// Play.fun Browser SDK integration — https://docs.play.fun
//
// Thin lifecycle module loaded only by the Play.fun build entry. Mirrors the
// defensive style of src/rcadia.js: a typeof guard on the global SDK, a
// `sdkReady` flag, and silent fallbacks so the game keeps running even if the
// SDK script fails to load or the page is opened outside the Play.fun shell.
//
// The module watches `gameState` directly (same singleton imported across the
// app), so no hooks have to be wired into main.js. It reports score deltas via
// `sdk.addPoints()` during play and triggers `sdk.endGame()` once on the
// transition into `game_over`.

import { gameState } from './game/state.js';

let sdk = null;
let sdkReady = false;
let lastReportedScore = 0;
let endGameFired = false;
let watcherId = null;

function safeOn(event, handler) {
  if (!sdk || typeof sdk.on !== 'function') return;
  try {
    sdk.on(event, handler);
  } catch {
    /* listener registration failure swallowed */
  }
}

function tick() {
  if (!sdk || !sdkReady) return;

  const score = Number(gameState.score) || 0;
  if (score > lastReportedScore) {
    const delta = score - lastReportedScore;
    lastReportedScore = score;
    try {
      sdk.addPoints(delta);
    } catch {
      /* addPoints failures shouldn't break the run */
    }
  }

  if (!endGameFired && gameState.status === 'game_over' && score > 0) {
    endGameFired = true;
    Promise.resolve()
      .then(() => sdk.endGame())
      .catch(() => {
        /* end-game modal errors swallowed; player still sees the game-over overlay */
      });
  }
}

export function initPlayfun({ gameId, theme = 'dark' } = {}) {
  if (typeof window === 'undefined') return;
  if (typeof OpenGameSDK === 'undefined') {
    // SDK script didn't load (offline / blocked / standalone preview). Game
    // continues to run normally; no points are reported.
    return;
  }
  if (!gameId) {
    console.warn('[playfun] initPlayfun called without gameId — SDK not initialized.');
    return;
  }

  try {
    // eslint-disable-next-line no-undef
    sdk = new OpenGameSDK({
      ui: { usePointsWidget: true, theme },
      logLevel: 'info',
    });
  } catch (err) {
    console.warn('[playfun] failed to construct OpenGameSDK:', err);
    sdk = null;
    return;
  }

  safeOn('OnReady', () => {
    sdkReady = true;
  });
  safeOn('SavePointsSuccess', () => {});
  safeOn('SavePointsFailed', () => {});

  // The SDK opens fullscreen modals for login/endGame. Game-over already
  // halts gameplay; login can happen mid-run. For v1 we accept that small
  // window of heat drain — the alternative requires exposing main.js's
  // togglePause(), which would be a larger change to the regular version.

  try {
    sdk.init({ gameId });
  } catch (err) {
    console.warn('[playfun] sdk.init failed:', err);
    sdk = null;
    return;
  }

  if (watcherId == null) {
    watcherId = setInterval(tick, 250);
  }
}

export function isPlayfunReady() {
  return Boolean(sdk && sdkReady);
}
