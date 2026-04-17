import { describe, it, expect } from 'vitest';
import {
  createBoard,
  createPhantomSlots,
  isValidVertex,
  listValidVertices,
  realRingCount,
} from '../src/game/board.js';
import { isUpTriangle, HEX_SIDE } from '../src/utils/math.js';
import { PHASE_PALETTES } from '../src/utils/colors.js';

describe('createBoard', () => {
  it('produces 6 × HEX_SIDE² triangles (hex-shaped field)', () => {
    const board = createBoard(PHASE_PALETTES[1]);
    expect(Object.keys(board).length).toBe(6 * HEX_SIDE * HEX_SIDE);
    expect(Object.keys(board).length).toBe(54);
  });

  it('each triangle has color from active palette', () => {
    const palette = PHASE_PALETTES[1];
    const board = createBoard(palette);
    for (const t of Object.values(board)) {
      expect(palette).toContain(t.color);
    }
  });

  it('classifies up/down per (col+row)%2', () => {
    const board = createBoard(PHASE_PALETTES[1]);
    for (const t of Object.values(board)) {
      expect(t.isUp).toBe(isUpTriangle(t.col, t.row));
    }
  });
});

describe('createPhantomSlots', () => {
  const board = createBoard(PHASE_PALETTES[1]);
  const palette = PHASE_PALETTES[1];
  const slots = createPhantomSlots(board, palette);

  it('seeds a phantom-color map only for boundary vertices', () => {
    // Interior vertices (full 6 real triangles) have no phantom slots.
    // Boundary vertices (corner/edge) do.
    // Total tappable = 37, interior = 19, boundary = 18.
    expect(Object.keys(slots).length).toBe(18);
  });

  it('each phantom slot color is from active palette', () => {
    for (const vertexKey of Object.keys(slots)) {
      for (const slotIdx of Object.keys(slots[vertexKey])) {
        expect(palette).toContain(slots[vertexKey][slotIdx]);
      }
    }
  });

  it('phantom slot count per vertex = 6 − realRingCount', () => {
    for (const vertexKey of Object.keys(slots)) {
      const [k, j] = vertexKey.split(',').map(Number);
      const realCount = realRingCount(k, j, board);
      const phantomCount = Object.keys(slots[vertexKey]).length;
      expect(realCount + phantomCount).toBe(6);
    }
  });
});

describe('isValidVertex', () => {
  const board = createBoard(PHASE_PALETTES[1]);

  it('false for non-real vertex (k+j even)', () => {
    expect(isValidVertex(2, 2, board)).toBe(false);
    expect(isValidVertex(6, 6, board)).toBe(false);
  });

  it('true at the hex center (full interior)', () => {
    expect(isValidVertex(6, 3, board)).toBe(true);
  });

  it('false for vertices well outside the hex', () => {
    expect(isValidVertex(1, 1, board)).toBe(false);
    expect(isValidVertex(11, 6, board)).toBe(false);
  });

  it('true for boundary vertices (corners / edges tappable)', () => {
    // At least one known corner — find it via listValidVertices
    const valids = listValidVertices(board);
    let hasBoundary = false;
    for (const [k, j] of valids) {
      if (realRingCount(k, j, board) < 6) {
        hasBoundary = true;
        break;
      }
    }
    expect(hasBoundary).toBe(true);
  });

  it('produces 37 tappable vertices on a clean side-3 hex', () => {
    // Total vertices in hex of side n = 3n² + 3n + 1. For n=3: 37.
    expect(listValidVertices(board).length).toBe(37);
  });
});
