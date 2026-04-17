import { describe, it, expect } from 'vitest';
import { shiftColorsCW } from '../src/game/spin.js';

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
