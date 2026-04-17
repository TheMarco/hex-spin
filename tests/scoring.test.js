import { describe, it, expect } from 'vitest';
import { computeWaveScore } from '../src/game/rules.js';

describe('computeWaveScore', () => {
  // Spec §5: pointsPerHex = 100 × 2^(phase-1) × 2^(cascade_index) × m
  // cascade_index = cascade - 1 (cascade is 1-based)

  it('Phase 1, wave 1, 1 hex: 100', () => {
    expect(computeWaveScore(1, 1, 1)).toBe(100);
  });

  it('Phase 4, wave 1, 1 hex: 800', () => {
    expect(computeWaveScore(4, 1, 1)).toBe(800);
  });

  it('Phase 1, wave 2, 1 hex: 200 (cascade ×2)', () => {
    expect(computeWaveScore(1, 2, 1)).toBe(200);
  });

  it('Phase 1, wave 3, 1 hex: 400', () => {
    expect(computeWaveScore(1, 3, 1)).toBe(400);
  });

  it('Phase 2, wave 1, 2 simultaneous hexes: 400 each', () => {
    expect(computeWaveScore(2, 1, 2)).toBe(400);
  });

  it('Phase 3, wave 3, 3 simultaneous: 4800 each', () => {
    expect(computeWaveScore(3, 3, 3)).toBe(4800);
  });
});
