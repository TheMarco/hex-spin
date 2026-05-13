// Play.fun build entry. Loaded only by playfun.html.
//
// 1. Tells main.js to reserve 15% of viewport height at the top for Play.fun
//    chrome (fitCamera reads window.__rotatronTopInsetPx — 0 in the standalone
//    build, so the regular index.html is unchanged).
// 2. Initializes the Play.fun Browser SDK with the registered gameId.
// 3. Imports main.js to boot the game with the same code path as the
//    standalone build.

import { initPlayfun } from './playfun.js';

// Fixed 75px reservation for Play.fun chrome. Kept in sync with the
// #playfun-topbar height / HUD offsets in playfun.html.
window.__rotatronTopInsetPx = 75;

const PLAYFUN_GAME_ID = '693fc7d8-e444-4c58-a78e-014d33b94331';

initPlayfun({ gameId: PLAYFUN_GAME_ID });

// Boot the game (side-effect import — main.js auto-runs on load).
import('./main.js');
