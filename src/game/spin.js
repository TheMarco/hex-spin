import * as THREE from 'three';
import { ring, vPos, key } from '../utils/math.js';
import { isValidVertex } from './board.js';
import { tween } from '../utils/animate.js';
import { gameState, withBusy } from './state.js';
import { resolveCompletions } from './rules.js';

// CW shift: slot i receives the color that was in slot (i+5)%6.
export function shiftColorsCW(colors) {
  return colors.map((_, i) => colors[(i + 5) % colors.length]);
}

export async function spin({
  k,
  j,
  board,
  phantomSlots,
  boardGroup,
  triangleViews,
  effects,
  hooks,
  applyColorShift = true,
}) {
  if (gameState.status === 'game_over') return false;
  if (gameState.status === 'phase_transition') return false;
  if (!isValidVertex(k, j, board)) return false;

  const result = await withBusy(async () => {
    const ts = ring(k, j);
    const [vx, vy] = vPos(k, j);
    const vertexKey = key(k, j);
    const phantomMap = phantomSlots?.[vertexKey];

    // Build 6-slot descriptor: each slot is either a real triangle or a
    // phantom sitting in the hidden buffer for this vertex.
    const slots = ts.map(([c, r], idx) => {
      const tKey = key(c, r);
      const t = board[tKey];
      if (t) return { type: 'real', idx, tKey, color: t.color };
      return { type: 'phantom', idx, color: phantomMap ? phantomMap[idx] : undefined };
    });
    const origColors = slots.map((s) => s.color);

    // Pivot rotation animates only real triangles.
    const pivot = new THREE.Group();
    pivot.position.set(vx, vy, 0);
    boardGroup.add(pivot);
    const realGroups = slots
      .filter((s) => s.type === 'real')
      .map((s) => triangleViews[s.tKey].group);
    for (const g of realGroups) pivot.attach(g);

    await tween(340, 'easeInOutCubic', (eased) => {
      pivot.rotation.z = -eased * (Math.PI / 3);
    });

    for (const g of realGroups) {
      boardGroup.attach(g);
      g.position.set(0, 0, 0);
      g.rotation.set(0, 0, 0);
      g.scale.set(1, 1, 1);
      g.updateMatrix();
    }
    boardGroup.remove(pivot);

    if (applyColorShift) {
      const shifted = shiftColorsCW(origColors);
      slots.forEach((s, i) => {
        const newColor = shifted[i];
        if (newColor === undefined) return; // phantom slot had no seed
        if (s.type === 'real') {
          board[s.tKey].color = newColor;
          triangleViews[s.tKey].setColor(newColor);
        } else if (phantomMap) {
          phantomMap[s.idx] = newColor;
        }
      });
    }

    gameState.spins++;

    await resolveCompletions({
      board,
      triangleViews,
      activeColors: gameState.activeColors,
      effects,
      hooks,
      onCascadeWave: (info) => {
        gameState.currentCascade = info.cascade;
        gameState.longestCascade = Math.max(gameState.longestCascade, info.cascade);
        gameState.hexCount += info.hexes.length;
        hooks?.onCascadeWave?.(info);
      },
    });
    gameState.currentCascade = 0;

    return true;
  });

  return result === true;
}
