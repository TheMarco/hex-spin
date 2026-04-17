import { easings } from './math.js';

export function tween(durationMs, easing, onFrame) {
  return new Promise((resolve) => {
    const ease = typeof easing === 'string' ? easings[easing] : easing;
    const t0 = performance.now();
    function frame() {
      const raw = Math.min((performance.now() - t0) / durationMs, 1);
      onFrame(ease(raw), raw);
      if (raw < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}
