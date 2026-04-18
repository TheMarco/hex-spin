import { describe, it, expect } from 'vitest';
import { computeWaveScore } from '../src/game/rules.js';
import { freshnessMultiplier } from '../src/game/state.js';

describe('computeWaveScore', () => {
  // pointsPerHex = 100 × freshMult × 2^(phase-1) × 2^(cascade-1) × m
  // freshMult defaults to 1 (neutral) so these baseline cases ignore freshness.

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

  it('applies freshness multiplier when provided', () => {
    expect(computeWaveScore(1, 1, 1, 2.0)).toBe(200);
    expect(computeWaveScore(4, 3, 2, 1.5)).toBe(9600);
  });
});

describe('freshnessMultiplier', () => {
  it('peaks at 2.0× on the first spin after the last clear', () => {
    expect(freshnessMultiplier(1)).toBeCloseTo(2.0);
  });

  it('decays by 0.1× per spin', () => {
    expect(freshnessMultiplier(2)).toBeCloseTo(1.9);
    expect(freshnessMultiplier(5)).toBeCloseTo(1.6);
  });

  it('hits the 1.1× floor at spin 10', () => {
    expect(freshnessMultiplier(10)).toBeCloseTo(1.1);
  });

  it('stays at the 1.1× floor for spins beyond 10', () => {
    expect(freshnessMultiplier(11)).toBeCloseTo(1.1);
    expect(freshnessMultiplier(99)).toBeCloseTo(1.1);
  });
});
