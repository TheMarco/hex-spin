import { key, ring } from '../utils/math.js';

// Briefly switch ring triangle fills to their bright neon color, then restore.
// Visual debug helper for M2 — replaced by real spin in M3.
export function flashRing(triangleViews, k, j, durationMs = 220) {
  const ts = ring(k, j);
  const restored = ts.map(([c, r]) => {
    const view = triangleViews[key(c, r)];
    if (!view) return null;
    const original = view.color;
    view.fillMaterial.color.set(original); // bright neon
    return { view, original };
  });
  setTimeout(() => {
    for (const r of restored) {
      if (!r) continue;
      r.view.setColor(r.original); // back to dark variant
    }
  }, durationMs);
}
