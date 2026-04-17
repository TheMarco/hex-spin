import { describe, it, expect, beforeAll } from 'vitest';
import { tween } from '../src/utils/animate.js';

beforeAll(() => {
  if (typeof globalThis.requestAnimationFrame === 'undefined') {
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  }
});

describe('tween', () => {
  it('resolves after roughly the requested duration', async () => {
    const start = performance.now();
    await tween(80, 'linear', () => {});
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(60);
    expect(elapsed).toBeLessThan(300);
  });

  it('final onFrame call has eased value 1', async () => {
    let last = -1;
    await tween(60, 'linear', (t) => {
      last = t;
    });
    expect(last).toBe(1);
  });

  it('accepts function easing', async () => {
    let last = -1;
    await tween(60, (t) => t * t, (eased) => {
      last = eased;
    });
    expect(last).toBe(1);
  });
});
