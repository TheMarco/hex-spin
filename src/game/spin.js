import * as THREE from 'three';
import { ring, vPos, key } from '../utils/math.js';
import { isValidVertex } from './board.js';
import { tween } from '../utils/animate.js';
import { gameState, withBusy, tickColorSuppression } from './state.js';
import { resolveCompletions } from './rules.js';
import { buildSpinSlots, planSpin } from './spin-model.js';
import { Triangle } from '../render/triangles.js';

export { shiftColorsCW } from './spin-model.js';

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
  deferResolve = false,
  pickColor,
  direction = 'cw',
}) {
  if (gameState.status === 'game_over') return false;
  if (gameState.status === 'phase_transition') return false;
  if (gameState.status === 'paused') return false;
  if (!isValidVertex(k, j, board)) return false;

  const result = await withBusy(async () => {
    hooks?.onSpinStart?.({ k, j });
    const ts = ring(k, j);
    const [vx, vy] = vPos(k, j);
    const vertexKey = key(k, j);
    const phantomMap = phantomSlots?.[vertexKey];
    const slots = buildSpinSlots(ts, board, phantomMap);
    const transition = planSpin(slots, direction);
    const rotationSign = direction === 'ccw' ? 1 : -1;

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
    const fadeInGhostIdxSet = new Set(transition.fadeInGhostIndices);

    for (const sourceIdx of transition.ghostSourceIndices) {
      const slot = slots[sourceIdx];
      const ghost = new Triangle(slot.cr[0], slot.cr[1], slot.color, { phase: gameState.phase });
      boardGroup.add(ghost.group);
      pivot.attach(ghost.group);
      ghost.setOpacity(0);
      ghostByIdx.set(sourceIdx, ghost);
      if (fadeInGhostIdxSet.has(sourceIdx)) fadeInGhosts.push(ghost);
      // phantom→phantom: leave at opacity 0 forever (will be disposed)
    }
    for (const tKey of transition.exitingRealKeys) {
      fadeOutReals.push(triangleViews[tKey]);
    }

    await tween(340, 'easeInOutCubic', (eased) => {
      pivot.rotation.z = rotationSign * eased * (Math.PI / 3);
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
      for (const tKey of transition.exitingRealKeys) {
        const view = triangleViews[tKey];
        view.group.parent?.remove(view.group);
        view.dispose();
      }

      // Promote ghosts landing on real slots; dispose the rest.
      const promoted = new Map();
      const promotedTargetsBySource = new Map(
        transition.remapRealTargets
          .filter((target) => target.sourceType === 'phantom')
          .map((target) => [target.sourceIdx, target.targetKey])
      );
      for (const [sourceIdx, ghost] of ghostByIdx) {
        const targetKey = promotedTargetsBySource.get(sourceIdx);
        if (targetKey) {
          boardGroup.attach(ghost.group);
          promoted.set(targetKey, ghost);
        } else {
          ghost.group.parent?.remove(ghost.group);
          ghost.dispose();
        }
      }

      boardGroup.remove(pivot);

      // Rebuild the ring's triangleViews entries in-place.
      const remapped = {};
      for (const target of transition.remapRealTargets) {
        remapped[target.targetKey] =
          target.sourceType === 'real' ? triangleViews[target.sourceKey] : promoted.get(target.targetKey);
      }
      for (const slot of slots) {
        if (slot.type === 'real') delete triangleViews[slot.tKey];
      }
      Object.assign(triangleViews, remapped);

      // Update the logical board + phantom buffer to match the carry.
      for (const target of transition.remapRealTargets) {
        if (target.color !== undefined) board[target.targetKey].color = target.color;
      }
      if (phantomMap) {
        for (const assignment of transition.phantomAssignments) {
          phantomMap[assignment.targetIdx] = assignment.color;
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
    gameState.spinsSinceLastClear++;
    tickColorSuppression();

    if (!deferResolve) {
      await resolveCompletions({
        board,
        triangleViews,
        activeColors: gameState.activeColors,
        effects,
        hooks,
        pickColor,
        onCascadeWave: (info) => {
          gameState.currentCascade = info.cascade;
          gameState.longestCascade = Math.max(gameState.longestCascade, info.cascade);
          gameState.hexCount += info.hexes.length;
          hooks?.onCascadeWave?.(info);
        },
        onHexBeat: hooks?.onHexBeat,
      });
      gameState.currentCascade = 0;
    }

    return true;
  });

  return result === true;
}
