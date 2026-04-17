import * as THREE from 'three';
import { ring, vPos, key } from '../utils/math.js';
import { isValidVertex } from './board.js';
import { tween } from '../utils/animate.js';
import { gameState, withBusy } from './state.js';
import { resolveCompletions } from './rules.js';
import { Triangle } from '../render/triangles.js';

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
      if (t) return { type: 'real', idx, tKey, cr: [c, r], color: t.color };
      return { type: 'phantom', idx, cr: [c, r], color: phantomMap ? phantomMap[idx] : undefined };
    });

    // Pivot rotation. Real triangles rotate physically; phantom slots get a
    // temporary "ghost" Triangle rendered at the off-board position carrying
    // the hidden color — so the player visibly watches that color arc in.
    const pivot = new THREE.Group();
    pivot.position.set(vx, vy, 0);
    boardGroup.add(pivot);

    const realGroups = slots
      .filter((s) => s.type === 'real')
      .map((s) => triangleViews[s.tKey].group);
    for (const g of realGroups) pivot.attach(g);

    // Build ghosts for phantom slots. Only show the ones whose rotation target
    // is a real slot (those visibly enter the board); phantom→phantom stays
    // hidden throughout. Also track real triangles whose target is phantom —
    // those need to fade out as they exit the hex boundary.
    const fadeInGhosts = [];
    const fadeOutReals = [];
    const ghostByIdx = new Map();

    for (const s of slots) {
      const targetIdx = (s.idx + 1) % 6;
      const target = slots[targetIdx];

      if (s.type === 'phantom') {
        if (s.color === undefined) continue;
        const ghost = new Triangle(s.cr[0], s.cr[1], s.color);
        boardGroup.add(ghost.group);
        pivot.attach(ghost.group);
        ghost.setOpacity(0);
        ghostByIdx.set(s.idx, ghost);
        if (target.type === 'real') fadeInGhosts.push(ghost);
        // phantom→phantom: leave at opacity 0 forever (will be disposed)
      } else if (target.type === 'phantom') {
        // Real triangle about to exit the hex boundary.
        fadeOutReals.push(triangleViews[s.tKey]);
      }
    }

    await tween(340, 'easeInOutCubic', (eased) => {
      pivot.rotation.z = -eased * (Math.PI / 3);
      for (const ghost of fadeInGhosts) ghost.setOpacity(eased);
      for (const view of fadeOutReals) view.setOpacity(1 - eased);
    });

    if (applyColorShift) {
      // Post-tween: bake pivot transform into each group, reassign
      // triangleViews keys to follow physical positions, dispose exited
      // reals, promote entered ghosts. No color swap or snap-back — the
      // rotation IS the state change (spec §3.5).

      // Bake world transform into local for every surviving real group.
      for (const g of realGroups) boardGroup.attach(g);

      // Dispose reals that exited the hex (real → phantom target).
      for (let i = 0; i < 6; i++) {
        const s = slots[i];
        const t = slots[(i + 1) % 6];
        if (s.type === 'real' && t.type === 'phantom') {
          const view = triangleViews[s.tKey];
          view.group.parent?.remove(view.group);
          view.dispose();
        }
      }

      // Promote ghosts landing on real slots; dispose the rest.
      const promoted = new Map();
      for (let i = 0; i < 6; i++) {
        const ghost = ghostByIdx.get(i);
        if (!ghost) continue;
        const t = slots[(i + 1) % 6];
        if (t.type === 'real') {
          boardGroup.attach(ghost.group);
          promoted.set(t.tKey, ghost);
        } else {
          ghost.group.parent?.remove(ghost.group);
          ghost.dispose();
        }
      }

      boardGroup.remove(pivot);

      // Rebuild the ring's triangleViews entries in-place.
      const remapped = {};
      for (let i = 0; i < 6; i++) {
        const s = slots[i];
        const t = slots[(i + 1) % 6];
        if (t.type !== 'real') continue;
        remapped[t.tKey] =
          s.type === 'real' ? triangleViews[s.tKey] : promoted.get(t.tKey);
      }
      for (let i = 0; i < 6; i++) {
        if (slots[i].type === 'real') delete triangleViews[slots[i].tKey];
      }
      Object.assign(triangleViews, remapped);

      // Update the logical board + phantom buffer to match the carry.
      for (let i = 0; i < 6; i++) {
        const s = slots[i];
        const t = slots[(i + 1) % 6];
        if (t.type === 'real') {
          if (s.color !== undefined) board[t.tKey].color = s.color;
        } else if (phantomMap) {
          phantomMap[t.idx] = s.color;
        }
      }
    } else {
      // Visual-only rotation — snap everything back and dispose ghosts.
      for (const g of realGroups) {
        boardGroup.attach(g);
        g.position.set(0, 0, 0);
        g.rotation.set(0, 0, 0);
        g.scale.set(1, 1, 1);
        g.updateMatrix();
      }
      boardGroup.remove(pivot);
      for (const ghost of ghostByIdx.values()) {
        ghost.group.parent?.remove(ghost.group);
        ghost.dispose();
      }
      for (const view of fadeOutReals) view.setOpacity(1);
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
