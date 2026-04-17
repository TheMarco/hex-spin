import { describe, it, expect, beforeEach } from 'vitest';
import {
  gameState,
  resetGameState,
  drainHeat,
  heatGainFromWave,
  addHeat,
  isHeatEmpty,
  drainMultiplierForPhase,
  HEAT_START,
  HEAT_DRAIN_PER_SEC,
  HEAT_HEX_BASE,
  HEAT_MAX,
} from '../src/game/state.js';

beforeEach(() => resetGameState());

describe('heat: initial state', () => {
  it('starts at HEAT_START', () => {
    expect(gameState.heat).toBe(HEAT_START);
  });
  it('is not empty at start', () => {
    expect(isHeatEmpty()).toBe(false);
  });
});

describe('drainHeat', () => {
  it('decreases heat at HEAT_DRAIN_PER_SEC in phase 1', () => {
    drainHeat(1); // 1 second
    expect(gameState.heat).toBeCloseTo(HEAT_START - HEAT_DRAIN_PER_SEC, 6);
  });
  it('drains faster in higher phases', () => {
    gameState.phase = 4;
    drainHeat(1);
    const expected = HEAT_START - HEAT_DRAIN_PER_SEC * drainMultiplierForPhase(4);
    expect(gameState.heat).toBeCloseTo(expected, 6);
  });
  it('clamps at 0', () => {
    drainHeat(1000);
    expect(gameState.heat).toBe(0);
    expect(isHeatEmpty()).toBe(true);
  });
  it('is paused when status !== idle', () => {
    gameState.status = 'phase_transition';
    drainHeat(5);
    expect(gameState.heat).toBe(HEAT_START);
    gameState.status = 'game_over';
    drainHeat(5);
    expect(gameState.heat).toBe(HEAT_START);
  });
});

describe('heatGainFromWave', () => {
  it('linear for single hex', () => {
    expect(heatGainFromWave(1)).toBeCloseTo(HEAT_HEX_BASE, 6);
  });
  it('quadratic in N for multi-hex waves', () => {
    expect(heatGainFromWave(2)).toBeCloseTo(HEAT_HEX_BASE * 4, 6);
    expect(heatGainFromWave(3)).toBeCloseTo(HEAT_HEX_BASE * 9, 6);
  });
});

describe('drainMultiplierForPhase', () => {
  it('phase 1 = 1.0×', () => expect(drainMultiplierForPhase(1)).toBeCloseTo(1.0, 6));
  it('monotonic: each phase drains faster', () => {
    expect(drainMultiplierForPhase(2)).toBeGreaterThan(drainMultiplierForPhase(1));
    expect(drainMultiplierForPhase(3)).toBeGreaterThan(drainMultiplierForPhase(2));
    expect(drainMultiplierForPhase(4)).toBeGreaterThan(drainMultiplierForPhase(3));
  });
});

describe('addHeat', () => {
  it('adds within bounds', () => {
    gameState.heat = 0.5;
    addHeat(0.2);
    expect(gameState.heat).toBeCloseTo(0.7, 6);
  });
  it('clamps at HEAT_MAX', () => {
    gameState.heat = 0.9;
    addHeat(0.5);
    expect(gameState.heat).toBe(HEAT_MAX);
  });
});
