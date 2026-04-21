import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { findCompletedHexes, resolveCompletions, MAX_CASCADE } from '../src/game/rules.js';
import { ROWS, COLS, ring, key, isInsideHex } from '../src/utils/math.js';
import { gameState, resetGameState, isColorSuppressed } from '../src/game/state.js';

beforeAll(() => {
  if (typeof globalThis.requestAnimationFrame === 'undefined') {
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  }
});

beforeEach(() => resetGameState());

// Hex-shaped test board: same filter as production createBoard but
// deterministic coloring for assertions.
function makeBoard(colorAt = () => 'red') {
  const board = {};
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isInsideHex(c, r)) continue;
      board[key(c, r)] = {
        col: c,
        row: r,
        color: colorAt(c, r),
        isUp: (c + r) % 2 === 0,
      };
    }
  }
  return board;
}

describe('findCompletedHexes', () => {
  it('empty for a 3-color stripe board (no full hex possible)', () => {
    const palette = ['A', 'B', 'C'];
    const b = makeBoard((c, r) => palette[(c + r) % 3]);
    expect(findCompletedHexes(b)).toEqual([]);
  });

  it('finds every interior vertex when all triangles share one color', () => {
    const b = makeBoard(() => 'X');
    const hits = findCompletedHexes(b);
    // 19 interior vertices on a side-3 hex (3n² − 3n + 1).
    expect(hits.length).toBe(19);
    for (const h of hits) expect(h.color).toBe('X');
  });

  it('finds exactly 1 hex when only ring(6,3) is monochrome', () => {
    const palette = ['A', 'B', 'C'];
    const b = makeBoard((c, r) => palette[(c + r) % 3]);
    for (const [c, r] of ring(6, 3)) b[key(c, r)].color = 'X';
    const hits = findCompletedHexes(b);
    expect(hits).toHaveLength(1);
    expect(hits[0].k).toBe(6);
    expect(hits[0].j).toBe(3);
    expect(hits[0].color).toBe('X');
  });
});

describe('resolveCompletions', () => {
  it('clears 1 hex, refills, increments hexCount', async () => {
    const palette = ['A', 'B', 'C'];
    const b = makeBoard((c, r) => palette[(c + r) % 3]);
    for (const [c, r] of ring(6, 3)) b[key(c, r)].color = 'X';
    const fakeViews = makeFakeViews(b);
    let unique = 0;
    const ctx = {
      board: b,
      triangleViews: fakeViews,
      activeColors: ['BG'],
      pickColor: () => `U${unique++}`,
      onCascadeWave: () => {},
    };
    const summary = await resolveCompletions(ctx);
    expect(summary.totalHexes).toBe(1);
    expect(summary.cascades).toBe(1);
  });

  it('chains cascades when refill creates a new hex', async () => {
    const palette = ['A', 'B', 'C'];
    const b = makeBoard((c, r) => palette[(c + r) % 3]);
    for (const [c, r] of ring(6, 3)) b[key(c, r)].color = 'X';
    const fakeViews = makeFakeViews(b);
    let calls = 0;
    let unique = 0;
    const ctx = {
      board: b,
      triangleViews: fakeViews,
      activeColors: ['X'],
      pickColor: () => {
        if (calls < 6) {
          calls++;
          return 'X';
        }
        return `U${unique++}`;
      },
      onCascadeWave: () => {},
    };
    const summary = await resolveCompletions(ctx);
    expect(summary.cascades).toBe(2);
  });

  it('caps cascade depth at MAX_CASCADE with a warning', async () => {
    const b = makeBoard(() => 'X');
    const fakeViews = makeFakeViews(b);
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      const ctx = {
        board: b,
        triangleViews: fakeViews,
        activeColors: ['X'], // every refill creates new hexes → infinite cascade
        onCascadeWave: () => {},
      };
      const summary = await resolveCompletions(ctx);
      expect(summary.cascades).toBe(MAX_CASCADE);
      expect(warnings.some((w) => w.toLowerCase().includes('cascade'))).toBe(true);
    } finally {
      console.warn = origWarn;
    }
  });
});

describe('color elimination', () => {
  it('fires onColorEliminated and suppresses the color when its last cells clear', async () => {
    // Build a board where color X exists ONLY in ring(6,3). Clearing that hex
    // strips the last X off the board → eliminated.
    const palette = ['A', 'B', 'C'];
    const b = makeBoard((c, r) => palette[(c + r) % 3]);
    for (const [c, r] of ring(6, 3)) b[key(c, r)].color = 'X';
    const fakeViews = makeFakeViews(b);
    const events = [];
    let unique = 0;
    const ctx = {
      board: b,
      triangleViews: fakeViews,
      activeColors: ['X', 'A', 'B', 'C'],
      pickColor: () => `U${unique++}`, // never refill X back
      onCascadeWave: () => {},
      hooks: { onColorEliminated: (info) => events.push(info) },
    };
    // Stage gameState so suppression detection is well-defined.
    gameState.activeColors = ['X', 'A', 'B', 'C'];
    await resolveCompletions(ctx);
    expect(events).toHaveLength(1);
    expect(events[0].colors).toEqual(['X']);
    expect(isColorSuppressed('X')).toBe(true);
  });

  it('does not re-fire while the color is already suppressed', async () => {
    const palette = ['A', 'B', 'C'];
    const b = makeBoard((c, r) => palette[(c + r) % 3]);
    for (const [c, r] of ring(6, 3)) b[key(c, r)].color = 'X';
    const fakeViews = makeFakeViews(b);
    const events = [];
    let unique = 0;
    gameState.activeColors = ['X', 'A', 'B', 'C'];
    // Pre-suppress X.
    gameState.suppressedColors = { X: 3 };
    const ctx = {
      board: b,
      triangleViews: fakeViews,
      activeColors: gameState.activeColors,
      pickColor: () => `U${unique++}`,
      onCascadeWave: () => {},
      hooks: { onColorEliminated: (info) => events.push(info) },
    };
    await resolveCompletions(ctx);
    expect(events).toHaveLength(0);
  });
});

function makeFakeViews(board) {
  const views = {};
  for (const k of Object.keys(board)) {
    views[k] = {
      color: board[k].color,
      isStone: false,
      setColor(c) {
        this.color = c;
      },
      setStone() {
        this.isStone = true;
      },
      fade: () => Promise.resolve(),
      flash: () => Promise.resolve(),
    };
  }
  return views;
}
