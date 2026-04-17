import { describe, it, expect } from 'vitest';
import {
  S,
  H,
  ROWS,
  COLS,
  HEX_SIDE,
  HEX_CENTER_K,
  HEX_CENTER_J,
  vPos,
  key,
  ring,
  triangleVertices,
  isUpTriangle,
  isRealVertex,
  isInsideHex,
  easings,
} from '../src/utils/math.js';

const eps = 1e-6;

describe('constants', () => {
  it('S = 1.0', () => expect(S).toBe(1.0));
  it('H = S * sqrt(3) / 2', () => expect(H).toBeCloseTo(Math.sqrt(3) / 2, 10));
  it('ROWS = 7, COLS = 12 (grid holds side-3 hex)', () => {
    expect(ROWS).toBe(7);
    expect(COLS).toBe(12);
  });
  it('HEX_SIDE = 3, center at (6, 3)', () => {
    expect(HEX_SIDE).toBe(3);
    expect(HEX_CENTER_K).toBe(6);
    expect(HEX_CENTER_J).toBe(3);
    // center must be a real vertex
    expect((HEX_CENTER_K + HEX_CENTER_J) % 2).toBe(1);
  });
});

describe('isInsideHex', () => {
  it('includes the triangle at hex center', () => {
    // Triangle (5, 3) is directly under the center vertex (6, 3)
    expect(isInsideHex(5, 3)).toBe(true);
  });
  it('excludes corner triangles of the bounding grid', () => {
    expect(isInsideHex(0, 0)).toBe(false);
    expect(isInsideHex(11, 0)).toBe(false);
    expect(isInsideHex(0, 6)).toBe(false);
    expect(isInsideHex(11, 6)).toBe(false);
  });
  it('total inside count = 6 × HEX_SIDE² = 54', () => {
    let count = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (isInsideHex(c, r)) count++;
      }
    }
    expect(count).toBe(6 * HEX_SIDE * HEX_SIDE);
  });
});

describe('vPos', () => {
  it('vPos(0, 0) is origin', () => {
    expect(vPos(0, 0)).toEqual([0, 0, 0]);
  });
  it('vPos(2, 1) = [1.0, -0.866..., 0]', () => {
    const [x, y, z] = vPos(2, 1);
    expect(x).toBeCloseTo(1.0, 10);
    expect(y).toBeCloseTo(-Math.sqrt(3) / 2, 10);
    expect(z).toBe(0);
  });
  it('y is negative for j>0 (top-of-screen orientation)', () => {
    expect(vPos(0, 5)[1]).toBeLessThan(0);
  });
});

describe('key', () => {
  it('formats col,row', () => expect(key(3, 4)).toBe('3,4'));
});

describe('isRealVertex', () => {
  it('true when (k+j) is odd', () => {
    expect(isRealVertex(2, 1)).toBe(true);
    expect(isRealVertex(3, 0)).toBe(true);
  });
  it('false when (k+j) is even', () => {
    expect(isRealVertex(2, 2)).toBe(false);
    expect(isRealVertex(0, 0)).toBe(false);
  });
});

describe('ring', () => {
  it('returns 6 pairs CW from N for (2,1)', () => {
    expect(ring(2, 1)).toEqual([
      [1, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [0, 1],
      [0, 0],
    ]);
  });
  it('rotational pattern alternates types per spec §3.4', () => {
    const r = ring(4, 3);
    expect(r).toHaveLength(6);
    const types = r.map(([c, row]) => isUpTriangle(c, row));
    // Per spec: slot 0 (N) is down, 1 (NE) up, 2 (SE) down, 3 (S) up, 4 (SW) down, 5 (NW) up
    expect(types).toEqual([false, true, false, true, false, true]);
  });
});

describe('isUpTriangle', () => {
  it('(col+row) even → up', () => {
    expect(isUpTriangle(0, 0)).toBe(true);
    expect(isUpTriangle(1, 1)).toBe(true);
    expect(isUpTriangle(3, 5)).toBe(true);
  });
  it('(col+row) odd → down', () => {
    expect(isUpTriangle(1, 0)).toBe(false);
    expect(isUpTriangle(2, 1)).toBe(false);
  });
});

describe('triangleVertices', () => {
  it('up-triangle (0,0) → apex(1,0), base-left(0,1), base-right(2,1)', () => {
    expect(triangleVertices(0, 0)).toEqual([
      [1, 0],
      [0, 1],
      [2, 1],
    ]);
  });
  it('down-triangle (1,0) → top-left(1,0), top-right(3,0), apex(2,1)', () => {
    expect(triangleVertices(1, 0)).toEqual([
      [1, 0],
      [3, 0],
      [2, 1],
    ]);
  });
});

describe('easings', () => {
  it('linear identity', () => {
    expect(easings.linear(0)).toBe(0);
    expect(easings.linear(0.5)).toBe(0.5);
    expect(easings.linear(1)).toBe(1);
  });
  it('easeInOutCubic boundary + midpoint', () => {
    expect(easings.easeInOutCubic(0)).toBe(0);
    expect(easings.easeInOutCubic(1)).toBe(1);
    expect(easings.easeInOutCubic(0.5)).toBeCloseTo(0.5, eps);
  });
  it('easeOutCubic boundary', () => {
    expect(easings.easeOutCubic(0)).toBe(0);
    expect(easings.easeOutCubic(1)).toBe(1);
  });
  it('sinePulse 0,1 → 0; 0.5 → 1', () => {
    expect(easings.sinePulse(0)).toBeCloseTo(0, eps);
    expect(easings.sinePulse(1)).toBeCloseTo(0, eps);
    expect(easings.sinePulse(0.5)).toBeCloseTo(1, eps);
  });
});
