import { describe, it, expect } from 'vitest';
import { computeWaveScore, computeMultiKillBonus } from '../src/game/rules.js';
import { freshnessMultiplier } from '../src/game/state.js';

describe('computeWaveScore', () => {
  // pointsPerHex = 100 × freshMult × 2^(phase-1) × 2^(cascade-1)
  // `m` no longer scales per-hex — multi-kill reward is a flat wave bonus
  // handled by computeMultiKillBonus. freshMult defaults to 1 (neutral).

  it('Phase 1, wave 1: 100 per hex', () => {
    expect(computeWaveScore(1, 1, 1)).toBe(100);
  });

  it('Phase 4, wave 1: 800 per hex', () => {
    expect(computeWaveScore(4, 1, 1)).toBe(800);
  });

  it('Phase 1, wave 2: 200 per hex (cascade ×2)', () => {
    expect(computeWaveScore(1, 2, 1)).toBe(200);
  });

  it('Phase 1, wave 3: 400 per hex', () => {
    expect(computeWaveScore(1, 3, 1)).toBe(400);
  });

  it('per-hex is independent of wave size (m)', () => {
    expect(computeWaveScore(2, 1, 1)).toBe(computeWaveScore(2, 1, 2));
    expect(computeWaveScore(2, 1, 1)).toBe(computeWaveScore(2, 1, 3));
  });

  it('applies freshness multiplier when provided', () => {
    expect(computeWaveScore(1, 1, 1, 2.0)).toBe(200);
    expect(computeWaveScore(4, 3, 1, 1.5)).toBe(4800);
  });
});

describe('computeMultiKillBonus', () => {
  // Flat per-wave bonus. Shape: 0 at m=1, jumps hard at m=2 (skillful dual),
  // tapers for m≥3 (usually luck). Scaled by freshMult × phase × cascade.

  it('returns 0 for a single-hex wave', () => {
    expect(computeMultiKillBonus(1, 1, 1, 2)).toBe(0);
  });

  it('dual kill is front-loaded (m=2 shape = 6)', () => {
    expect(computeMultiKillBonus(2, 1, 1, 1)).toBe(600);
  });

  it('triple kill tapers (m=3 shape = 7.5)', () => {
    expect(computeMultiKillBonus(3, 1, 1, 1)).toBe(750);
  });

  it('quad kill tapers further (m=4 shape = 8)', () => {
    expect(computeMultiKillBonus(4, 1, 1, 1)).toBe(800);
  });

  it('scales with phase / cascade / freshMult', () => {
    expect(computeMultiKillBonus(2, 4, 1, 1)).toBe(600 * 8);
    expect(computeMultiKillBonus(2, 1, 3, 1)).toBe(600 * 4);
    expect(computeMultiKillBonus(2, 1, 1, 2)).toBe(600 * 2);
  });

  it('dual-kill wave total out-rewards m=1 but sits close to m=3', () => {
    // Per-wave total = m × pointsPerHex + multiKillBonus.
    const hex = computeWaveScore(1, 1, 1, 2); // 200
    const dual = 2 * hex + computeMultiKillBonus(2, 1, 1, 2); // 400 + 1200
    const triple = 3 * hex + computeMultiKillBonus(3, 1, 1, 2); // 600 + 1500
    expect(dual).toBe(1600);
    expect(triple).toBe(2100);
    // Ratio dual:triple is now ~0.76 (was 0.44 under quadratic m²).
    expect(dual / triple).toBeGreaterThan(0.7);
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
