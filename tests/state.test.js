import { describe, it, expect, beforeEach } from 'vitest';
import {
  gameState,
  resetGameState,
  withBusy,
  nextPhaseFromHexCount,
  advancePhase,
} from '../src/game/state.js';
import { getThemeIdForPhase, getThemePhasePalettes } from '../src/utils/colors.js';

beforeEach(() => resetGameState());

describe('gameState defaults', () => {
  it('starts in phase 1, status idle, not busy', () => {
    expect(gameState.phase).toBe(1);
    expect(gameState.hexCount).toBe(0);
    expect(gameState.score).toBe(0);
    expect(gameState.longestCascade).toBe(0);
    expect(gameState.currentCascade).toBe(0);
    expect(gameState.spinsSinceLastClear).toBe(0);
    expect(gameState.busy).toBe(false);
    expect(gameState.status).toBe('idle');
  });
});

describe('withBusy', () => {
  it('locks during async work, unlocks after', async () => {
    expect(gameState.busy).toBe(false);
    const promise = withBusy(async () => {
      expect(gameState.busy).toBe(true);
    });
    expect(gameState.busy).toBe(true);
    await promise;
    expect(gameState.busy).toBe(false);
  });

  it('unlocks even if work throws', async () => {
    await expect(withBusy(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(gameState.busy).toBe(false);
  });

  it('returns null when already busy (re-entrant guard)', async () => {
    gameState.busy = true;
    const result = await withBusy(async () => 'should-not-run');
    expect(result).toBeNull();
    gameState.busy = false;
  });
});

describe('nextPhaseFromHexCount', () => {
  it('returns 2 at hexCount 11, not before', () => {
    expect(nextPhaseFromHexCount(1, 10)).toBeNull();
    expect(nextPhaseFromHexCount(1, 11)).toBe(2);
  });
  it('returns 3 at hexCount 26', () => {
    expect(nextPhaseFromHexCount(2, 25)).toBeNull();
    expect(nextPhaseFromHexCount(2, 26)).toBe(3);
  });
  it('returns 4 at hexCount 51', () => {
    expect(nextPhaseFromHexCount(3, 50)).toBeNull();
    expect(nextPhaseFromHexCount(3, 51)).toBe(4);
  });
  it('returns null after phase 4 (terminal phase)', () => {
    expect(nextPhaseFromHexCount(4, 999)).toBeNull();
  });
  it('does not skip phases — only advances by one', () => {
    // Going from phase 1 with hexCount 100 should return 2 (next), not 4.
    expect(nextPhaseFromHexCount(1, 100)).toBe(2);
  });
});

describe('advancePhase', () => {
  it('updates phase and activeColors length', () => {
    expect(gameState.activeColors).toHaveLength(3);
    advancePhase(2);
    expect(gameState.phase).toBe(2);
    expect(gameState.activeColors).toHaveLength(4);
    advancePhase(3);
    expect(gameState.activeColors).toHaveLength(5);
    advancePhase(4);
    expect(gameState.activeColors).toHaveLength(6);
  });
});

describe('phase-driven themes', () => {
  it('maps each phase to its fixed theme', () => {
    expect(getThemeIdForPhase(1)).toBe('arcade');
    expect(getThemeIdForPhase(2)).toBe('reactor');
    expect(getThemeIdForPhase(3)).toBe('void');
    expect(getThemeIdForPhase(4)).toBe('solar');
  });

  it('advancePhase switches active colors to that phase theme palette', () => {
    advancePhase(2);
    expect(gameState.activeColors).toEqual(getThemePhasePalettes(getThemeIdForPhase(2))[2]);

    advancePhase(4);
    expect(gameState.activeColors).toEqual(getThemePhasePalettes(getThemeIdForPhase(4))[4]);
  });

  it('resetGameState restores the phase 1 theme palette', () => {
    advancePhase(4);
    resetGameState();
    expect(gameState.phase).toBe(1);
    expect(gameState.activeColors).toEqual(getThemePhasePalettes(getThemeIdForPhase(1))[1]);
  });
});
