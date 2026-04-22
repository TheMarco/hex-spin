import { NEON } from '../utils/colors.js';
import { createBoardFromPreset } from '../game/board.js';
import { findCompletedHexes } from '../game/rules.js';
import { ring, key } from '../utils/math.js';
import { gameState, resetGameState, HEAT_MAX } from '../game/state.js';

// Ring cells to highlight with bright-outline pulses before each step's spin.
// Step 1 targets W_5 = (5,2), which sits above the pivot so the narration
// banner doesn't overlap it on landscape/desktop.
const STEP1_HIGHLIGHT = ring(5, 2).map(([c, r]) => key(c, r));
const STEP2_HIGHLIGHT = [
  ...ring(8, 3).map(([c, r]) => key(c, r)),
  ...ring(5, 4).map(([c, r]) => key(c, r)),
];
// All 6 cyan cells that will get eliminated (W_5's ring + the one rotating in).
const STEP3_HIGHLIGHT = ring(5, 2).map(([c, r]) => key(c, r));
// Reverse-direction step targets W_5 again; highlight its ring + pivot ring so
// the viewer sees the source cells and where the CCW carry is going.
const STEP4_HIGHLIGHT = ring(5, 2).map(([c, r]) => key(c, r));

const M = NEON.magenta;
const C = NEON.cyan;
const P = NEON.purple;

// Mulberry32 — deterministic, so each demo run looks the same.
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Parity refill — keeps cleared hexes from refilling uniform. 3 up + 3 down
// around every vertex → never monochrome, so no cascade after the intended clear.
const refillPicker = (cell) => ((cell.col + cell.row) % 2 === 0 ? M : P);

function cloneBoard(board) {
  const out = {};
  for (const k of Object.keys(board)) out[k] = { ...board[k] };
  return out;
}

// Ring rotation simulator. CW: post[i] = pre[(i+5)%6]; CCW: post[i] = pre[(i+1)%6].
function simulateRotation(board, pivotK, pivotJ, direction = 'cw') {
  const next = cloneBoard(board);
  const cells = ring(pivotK, pivotJ);
  const pre = cells.map(([c, r]) => next[key(c, r)]?.color);
  const step = direction === 'ccw' ? 1 : 5;
  for (let i = 0; i < 6; i++) {
    const [c, r] = cells[i];
    const k = key(c, r);
    if (next[k]) next[k].color = pre[(i + step) % 6];
  }
  return next;
}

function simulateRefill(board, hexes, pickColor) {
  const out = cloneBoard(board);
  for (const h of hexes) {
    for (const [c, r] of h.ts) {
      const k = key(c, r);
      if (out[k]) out[k].color = pickColor(out[k]);
    }
  }
  return out;
}

// Build a demo board: seeded-random filler + re-roll until every constraint holds.
// Constraints: no pre-complete hex; the spin at (pivotK, pivotJ) completes exactly
// the intended hex vertices; post-refill has no completions (no cascade).
function buildDemoBoard({ overrides, palette, pivotK, pivotJ, intendedHexes, direction = 'cw' }) {
  const intended = new Set(intendedHexes.map(([k, j]) => `${k},${j}`));
  for (let seed = 7; seed < 50000; seed++) {
    const rand = mulberry32(seed);
    const filler = () => palette[Math.floor(rand() * palette.length)];
    const board = createBoardFromPreset(overrides, filler);

    if (findCompletedHexes(board).length > 0) continue;

    const afterSpin = simulateRotation(board, pivotK, pivotJ, direction);
    const completed = findCompletedHexes(afterSpin);
    if (completed.length !== intended.size) continue;
    const completedKeys = new Set(completed.map((h) => `${h.k},${h.j}`));
    let matches = true;
    for (const k of intended) if (!completedKeys.has(k)) matches = false;
    if (!matches) continue;

    const afterRefill = simulateRefill(afterSpin, completed, refillPicker);
    if (findCompletedHexes(afterRefill).length > 0) continue;

    return board;
  }
  throw new Error('Demo: no valid board within seed budget');
}

// Step 1: tap (6,3); W_5=(5,2) completes with magenta. Pre P ring pattern
// (P,C,P,C,M,M) so only the (T_5,T_0) post pair matches. W_5 is the upper-left
// outer vertex — stays clear of the bottom-centered demo banner.
function buildStep1Board() {
  return buildDemoBoard({
    overrides: {
      '5,2': P,
      '6,2': C,
      '6,3': P,
      '5,3': C,
      '4,3': M,
      '4,2': M,
      '4,1': M,
      '5,1': M,
      '3,2': M,
      '3,1': M,
    },
    palette: [M, P, C],
    pivotK: 6,
    pivotJ: 3,
    intendedHexes: [[5, 2]],
  });
}

// Step 2: tap (6,3); W_1=(8,3) and W_3=(5,4) complete at once. Pattern
// (M,M,C,C,M,C) around the pivot; W_1 outer 4 all M, W_3 outer 4 all C.
function buildStep2Board() {
  return buildDemoBoard({
    overrides: {
      '5,2': M,
      '6,2': M,
      '6,3': C,
      '5,3': C,
      '4,3': M,
      '4,2': C,
      '7,2': M,
      '8,2': M,
      '8,3': M,
      '7,3': M,
      '5,4': C,
      '4,4': C,
      '3,4': C,
      '3,3': C,
    },
    palette: [M, P, C],
    pivotK: 6,
    pivotJ: 3,
    intendedHexes: [
      [8, 3],
      [5, 4],
    ],
  });
}

// Step 3: tap (6,3); W_5=(5,2) completes with cyan and it's the only cyan left
// on the board, so the clear eliminates the color. Filler excludes cyan so the
// elimination is guaranteed. W_5 is the upper-left outer vertex — stays clear
// of the bottom-centered narration banner.
function buildStep3Board() {
  return buildDemoBoard({
    overrides: {
      '5,2': M,
      '6,2': P,
      '6,3': M,
      '5,3': P,
      '4,3': C,
      '4,2': C,
      '4,1': C,
      '5,1': C,
      '3,2': C,
      '3,1': C,
    },
    palette: [M, P],
    pivotK: 6,
    pivotJ: 3,
    intendedHexes: [[5, 2]],
  });
}

// Step 4: CCW spin at (6,3) completes W_5=(5,2) with magenta. Same spin done
// CW would NOT complete it — so the step is only solvable by reversing. After
// CCW: (5,2) ← pre-(6,2), (4,2) ← pre-(5,2). Pre-(6,2)=M, pre-(5,2)=M, outer
// W_5 cells (4,1)(5,1)(3,1)(3,2) all M; pre-(4,2)=P keeps W_5 un-completed
// before the spin and blocks a CW completion ((5,2) would become P).
function buildStep4Board() {
  return buildDemoBoard({
    overrides: {
      '5,2': M,
      '6,2': M,
      '6,3': P,
      '5,3': C,
      '4,3': C,
      '4,2': P,
      '4,1': M,
      '5,1': M,
      '3,2': M,
      '3,1': M,
    },
    palette: [M, P, C],
    pivotK: 6,
    pivotJ: 3,
    intendedHexes: [[5, 2]],
    direction: 'ccw',
  });
}

export function createDemo({ container, runtime, onEnd }) {
  const narr = document.createElement('div');
  narr.className = 'demo-narration';
  narr.innerHTML = `
    <div class="demo-head">
      <div class="demo-step-label">STEP 1 / 5</div>
      <button class="demo-skip" data-action="skip" aria-label="Skip demo">SKIP ×</button>
    </div>
    <div class="demo-title"></div>
    <div class="demo-body"></div>
  `;
  container.appendChild(narr);

  const stepLabel = narr.querySelector('.demo-step-label');
  const titleEl = narr.querySelector('.demo-title');
  const bodyEl = narr.querySelector('.demo-body');

  let aborted = false;
  let running = true;
  const aborts = [];

  function setStep(n, title, body) {
    stepLabel.textContent = `STEP ${n} / 5`;
    titleEl.textContent = title;
    bodyEl.innerHTML = body;
    narr.classList.remove('pulse');
    void narr.offsetWidth;
    narr.classList.add('pulse');
  }

  const wait = (ms) =>
    new Promise((resolve) => {
      const id = setTimeout(resolve, ms);
      aborts.push(() => {
        clearTimeout(id);
        resolve();
      });
    });

  // Pulse the outlines of a set of cells a few times so the viewer sees
  // which triangles matter before the spin fires. Runs in parallel with wait().
  function pulseHighlight(cellKeys, cycles = 3, cycleMs = 900) {
    let stopped = false;
    aborts.push(() => {
      stopped = true;
    });
    (async () => {
      for (let i = 0; i < cycles && !stopped; i++) {
        runtime.flashCells(cellKeys, cycleMs * 0.75);
        await new Promise((r) => setTimeout(r, cycleMs));
      }
    })();
  }

  const highlights = [];
  function addHexHighlight(k, j, color) {
    highlights.push(runtime.highlightHex(k, j, color));
  }
  function clearHexHighlights() {
    while (highlights.length) highlights.pop().dispose();
  }

  function cleanup() {
    if (!running) return;
    running = false;
    clearHexHighlights();
    runtime.flashReverseBtn?.(false);
    runtime.pressReverseBtn?.(false);
    gameState.demoActive = false;
    narr.classList.add('leaving');
    setTimeout(() => narr.remove(), 280);
    onEnd?.();
  }

  function skipAll() {
    aborted = true;
    while (aborts.length) aborts.pop()();
    cleanup();
  }

  narr.querySelector('.demo-skip').addEventListener('click', skipAll);

  // Tap/click anywhere during the demo exits it. Attach to window in the
  // capture phase so it fires before any other listener; remove on cleanup.
  const onAnyPointer = (ev) => {
    // Let the skip button handle itself to avoid double-fire.
    if (ev.target && ev.target.closest && ev.target.closest('.demo-skip')) return;
    skipAll();
  };
  window.addEventListener('pointerdown', onAnyPointer, { capture: true });
  aborts.push(() => window.removeEventListener('pointerdown', onAnyPointer, { capture: true }));

  (async () => {
    resetGameState();
    gameState.demoActive = true;
    runtime.applyThemePresentation(1);
    runtime.hud.refresh();
    runtime.hud.updateHeat(HEAT_MAX);

    // Step 1
    setStep(
      1,
      'MAKE A HEX',
      'Six triangles of the same color around a vertex <strong>shatter</strong> the hex. The glowing ring shows the target — watch it complete as the center spins.',
    );
    runtime.rebuildWithPreset(buildStep1Board());
    await wait(900);
    if (aborted) return;
    clearHexHighlights();
    addHexHighlight(5, 2, M);
    pulseHighlight(STEP1_HIGHLIGHT, 4, 900);
    await wait(3800);
    if (aborted) return;
    clearHexHighlights();
    await runtime.spinAt(6, 3, refillPicker);
    if (aborted) return;
    await wait(3800);
    if (aborted) return;

    // Step 2
    setStep(
      2,
      'STACK COMBOS',
      'Two hexes completing in a single spin fire a <strong>DUAL KILL</strong> bonus. The two glowing rings are both one move away.',
    );
    runtime.rebuildWithPreset(buildStep2Board());
    await wait(900);
    if (aborted) return;
    clearHexHighlights();
    addHexHighlight(8, 3, M);
    addHexHighlight(5, 4, C);
    pulseHighlight(STEP2_HIGHLIGHT, 4, 900);
    await wait(3800);
    if (aborted) return;
    clearHexHighlights();
    await runtime.spinAt(6, 3, refillPicker);
    if (aborted) return;
    await wait(4200);
    if (aborted) return;

    // Step 3
    setStep(
      3,
      'ELIMINATE A COLOR',
      'Thin a color down with <strong>edge spins</strong>. Clear the last hex of it and <strong>COLOR CLEARED</strong> pays a huge bonus — the glowing cells are the last of the color.',
    );
    runtime.rebuildWithPreset(buildStep3Board());
    await wait(900);
    if (aborted) return;
    clearHexHighlights();
    addHexHighlight(5, 2, C);
    pulseHighlight(STEP3_HIGHLIGHT, 4, 900);
    await wait(3800);
    if (aborted) return;
    clearHexHighlights();
    await runtime.spinAt(6, 3, refillPicker);
    if (aborted) return;
    await wait(4500);
    if (aborted) return;

    // Step 4 — reverse direction. Tap normally spins CW; holding the modifier
    // reverses to CCW. Copy differs on touch vs mouse: on mobile we point at
    // the on-screen button, on desktop we point at the Shift key.
    const isTouch =
      typeof window !== 'undefined' &&
      (matchMedia('(hover: none) and (pointer: coarse)').matches ||
        'ontouchstart' in window);
    const reverseBody = isTouch
      ? 'Hold the <strong>DIRECTION</strong> button below while tapping to spin <strong>counter-clockwise</strong>. Saves a ton of moves.'
      : 'Hold <strong>SHIFT</strong> while tapping to spin <strong>counter-clockwise</strong>. Saves a ton of moves.';
    setStep(4, 'SPIN BOTH WAYS', reverseBody);
    runtime.rebuildWithPreset(buildStep4Board());
    runtime.flashReverseBtn?.(true);
    await wait(900);
    if (aborted) return;
    clearHexHighlights();
    addHexHighlight(5, 2, M);
    pulseHighlight(STEP4_HIGHLIGHT, 4, 900);
    await wait(3800);
    if (aborted) return;
    clearHexHighlights();
    // Swap from the attention pulse to a full pressed-look for the spin so
    // the viewer sees the icon swap to CCW and the frame fill in — same
    // visual the player will get when they hold the button themselves.
    runtime.flashReverseBtn?.(false);
    runtime.pressReverseBtn?.(true);
    await runtime.spinAt(6, 3, refillPicker, 'ccw');
    runtime.pressReverseBtn?.(false);
    if (aborted) return;
    await wait(3800);
    if (aborted) return;

    // Step 5 — heat warning, no spin
    setStep(
      5,
      "DON'T LET HEAT HIT ZERO",
      'The bar at the top drains constantly. Shattering hexes refills it. If it empties, the run ends.',
    );
    runtime.flashHeatWarning();
    await wait(4500);
    if (aborted) return;

    cleanup();
  })();

  return {
    stop: () => {
      aborted = true;
      while (aborts.length) aborts.pop()();
      cleanup();
    },
  };
}
