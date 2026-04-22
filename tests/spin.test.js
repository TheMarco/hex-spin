import { describe, it, expect } from 'vitest';
import { ring } from '../src/utils/math.js';
import { buildSpinSlots, planSpin, shiftColorsCW } from '../src/game/spin-model.js';

describe('shiftColorsCW', () => {
  it('CW shift: slot i receives color from slot (i+5)%6 — i.e. previous N→NE', () => {
    expect(shiftColorsCW(['A', 'B', 'C', 'D', 'E', 'F'])).toEqual([
      'F',
      'A',
      'B',
      'C',
      'D',
      'E',
    ]);
  });

  it('six shifts return to original', () => {
    let c = ['A', 'B', 'C', 'D', 'E', 'F'];
    for (let i = 0; i < 6; i++) c = shiftColorsCW(c);
    expect(c).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('three shifts on rotational [X,Y,Z,X,Y,Z] returns to itself', () => {
    let c = ['X', 'Y', 'Z', 'X', 'Y', 'Z'];
    for (let i = 0; i < 3; i++) c = shiftColorsCW(c);
    expect(c).toEqual(['X', 'Y', 'Z', 'X', 'Y', 'Z']);
  });

  it('does not mutate input', () => {
    const input = ['A', 'B', 'C', 'D', 'E', 'F'];
    shiftColorsCW(input);
    expect(input).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });
});

describe('buildSpinSlots', () => {
  it('builds mixed real/phantom descriptors from board + phantom map', () => {
    const ts = ring(2, 1);
    const board = {
      '2,0': { color: 'A' },
      '2,1': { color: 'B' },
      '0,1': { color: 'C' },
    };
    const phantomMap = { 0: 'P0', 3: 'P3', 5: 'P5' };

    expect(buildSpinSlots(ts, board, phantomMap)).toEqual([
      { type: 'phantom', idx: 0, cr: [1, 0], color: 'P0' },
      { type: 'real', idx: 1, tKey: '2,0', cr: [2, 0], color: 'A' },
      { type: 'real', idx: 2, tKey: '2,1', cr: [2, 1], color: 'B' },
      { type: 'phantom', idx: 3, cr: [1, 1], color: 'P3' },
      { type: 'real', idx: 4, tKey: '0,1', cr: [0, 1], color: 'C' },
      { type: 'phantom', idx: 5, cr: [0, 0], color: 'P5' },
    ]);
  });
});

describe('planSpin cw', () => {
  it('describes entering ghosts, exiting reals, and carry targets at the boundary', () => {
    const slots = buildSpinSlots(
      ring(2, 1),
      {
        '2,0': { color: 'A' },
        '2,1': { color: 'B' },
        '0,1': { color: 'C' },
      },
      { 0: 'P0', 3: 'P3', 5: 'P5' }
    );

    expect(planSpin(slots, 'cw')).toEqual({
      ghostSourceIndices: [0, 3, 5],
      fadeInGhostIndices: [0, 3],
      exitingRealKeys: ['2,1', '0,1'],
      remapRealTargets: [
        { targetKey: '2,0', sourceIdx: 0, sourceType: 'phantom', sourceKey: null, color: 'P0' },
        { targetKey: '2,1', sourceIdx: 1, sourceType: 'real', sourceKey: '2,0', color: 'A' },
        { targetKey: '0,1', sourceIdx: 3, sourceType: 'phantom', sourceKey: null, color: 'P3' },
      ],
      phantomAssignments: [
        { targetIdx: 3, color: 'B' },
        { targetIdx: 5, color: 'C' },
        { targetIdx: 0, color: 'P5' },
      ],
    });
  });

  it('defaults to cw when no direction is passed', () => {
    const ts = ring(6, 3);
    const board = Object.fromEntries(
      ts.map(([c, r], idx) => [`${c},${r}`, { color: String.fromCharCode(65 + idx) }])
    );
    const slots = buildSpinSlots(ts, board);

    expect(planSpin(slots)).toEqual({
      ghostSourceIndices: [],
      fadeInGhostIndices: [],
      exitingRealKeys: [],
      remapRealTargets: [
        { targetKey: '6,2', sourceIdx: 0, sourceType: 'real', sourceKey: '5,2', color: 'A' },
        { targetKey: '6,3', sourceIdx: 1, sourceType: 'real', sourceKey: '6,2', color: 'B' },
        { targetKey: '5,3', sourceIdx: 2, sourceType: 'real', sourceKey: '6,3', color: 'C' },
        { targetKey: '4,3', sourceIdx: 3, sourceType: 'real', sourceKey: '5,3', color: 'D' },
        { targetKey: '4,2', sourceIdx: 4, sourceType: 'real', sourceKey: '4,3', color: 'E' },
        { targetKey: '5,2', sourceIdx: 5, sourceType: 'real', sourceKey: '4,2', color: 'F' },
      ],
      phantomAssignments: [],
    });
  });
});

describe('planSpin ccw', () => {
  it('carries colors in the reverse direction (slot i sources from (i+1)%6)', () => {
    const ts = ring(6, 3);
    const board = Object.fromEntries(
      ts.map(([c, r], idx) => [`${c},${r}`, { color: String.fromCharCode(65 + idx) }])
    );
    const slots = buildSpinSlots(ts, board);

    expect(planSpin(slots, 'ccw')).toEqual({
      ghostSourceIndices: [],
      fadeInGhostIndices: [],
      exitingRealKeys: [],
      remapRealTargets: [
        { targetKey: '4,2', sourceIdx: 0, sourceType: 'real', sourceKey: '5,2', color: 'A' },
        { targetKey: '5,2', sourceIdx: 1, sourceType: 'real', sourceKey: '6,2', color: 'B' },
        { targetKey: '6,2', sourceIdx: 2, sourceType: 'real', sourceKey: '6,3', color: 'C' },
        { targetKey: '6,3', sourceIdx: 3, sourceType: 'real', sourceKey: '5,3', color: 'D' },
        { targetKey: '5,3', sourceIdx: 4, sourceType: 'real', sourceKey: '4,3', color: 'E' },
        { targetKey: '4,3', sourceIdx: 5, sourceType: 'real', sourceKey: '4,2', color: 'F' },
      ],
      phantomAssignments: [],
    });
  });

  it('six ccw steps return to the identity on interior rings', () => {
    const ts = ring(6, 3);
    const board = Object.fromEntries(
      ts.map(([c, r], idx) => [`${c},${r}`, { color: String.fromCharCode(65 + idx) }])
    );
    let colors = ts.map(([c, r]) => board[`${c},${r}`].color);
    for (let step = 0; step < 6; step++) {
      const slots = buildSpinSlots(
        ts,
        Object.fromEntries(ts.map(([c, r], i) => [`${c},${r}`, { color: colors[i] }]))
      );
      const plan = planSpin(slots, 'ccw');
      const next = colors.slice();
      for (const t of plan.remapRealTargets) {
        const targetIdx = ts.findIndex(([c, r]) => `${c},${r}` === t.targetKey);
        next[targetIdx] = t.color;
      }
      colors = next;
    }
    expect(colors).toEqual(ts.map(([c, r]) => board[`${c},${r}`].color));
  });

  it('cw then ccw on the same ring is a no-op', () => {
    const ts = ring(6, 3);
    const initial = ts.map((_, i) => String.fromCharCode(65 + i));
    const applyPlan = (colors, direction) => {
      const boardMap = Object.fromEntries(ts.map(([c, r], i) => [`${c},${r}`, { color: colors[i] }]));
      const slots = buildSpinSlots(ts, boardMap);
      const plan = planSpin(slots, direction);
      const next = colors.slice();
      for (const t of plan.remapRealTargets) {
        const targetIdx = ts.findIndex(([c, r]) => `${c},${r}` === t.targetKey);
        next[targetIdx] = t.color;
      }
      return next;
    };
    const afterCw = applyPlan(initial, 'cw');
    const afterCcw = applyPlan(afterCw, 'ccw');
    expect(afterCcw).toEqual(initial);
  });
});
