import { key } from '../utils/math.js';

// CW shift: slot i receives the color that was in slot (i+5)%6.
export function shiftColorsCW(colors) {
  return colors.map((_, i) => colors[(i + 5) % colors.length]);
}

// Build the 6-slot descriptor around a vertex. Each slot is either a real
// triangle that currently exists on the board or a phantom color stored in the
// boundary buffer for that vertex.
export function buildSpinSlots(ts, board, phantomMap) {
  return ts.map(([c, r], idx) => {
    const tKey = key(c, r);
    const triangle = board[tKey];
    if (triangle) return { type: 'real', idx, tKey, cr: [c, r], color: triangle.color };
    return { type: 'phantom', idx, cr: [c, r], color: phantomMap ? phantomMap[idx] : undefined };
  });
}

// Describe the bookkeeping for one clockwise step around the ring. This is the
// pure carry model that the animated Three.js path in spin.js applies.
export function planClockwiseSpin(slots) {
  const ghostSourceIndices = [];
  const fadeInGhostIndices = [];
  const exitingRealKeys = [];
  const remapRealTargets = [];
  const phantomAssignments = [];

  for (const slot of slots) {
    const target = slots[(slot.idx + 1) % slots.length];

    if (slot.type === 'phantom' && slot.color !== undefined) {
      ghostSourceIndices.push(slot.idx);
      if (target.type === 'real') fadeInGhostIndices.push(slot.idx);
    }

    if (slot.type === 'real' && target.type === 'phantom') {
      exitingRealKeys.push(slot.tKey);
    }

    if (target.type === 'real') {
      remapRealTargets.push({
        targetKey: target.tKey,
        sourceIdx: slot.idx,
        sourceType: slot.type,
        sourceKey: slot.tKey ?? null,
        color: slot.color,
      });
    } else {
      phantomAssignments.push({ targetIdx: target.idx, color: slot.color });
    }
  }

  return {
    ghostSourceIndices,
    fadeInGhostIndices,
    exitingRealKeys,
    remapRealTargets,
    phantomAssignments,
  };
}
