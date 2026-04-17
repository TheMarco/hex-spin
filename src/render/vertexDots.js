import * as THREE from 'three';
import { vPos, ROWS, COLS } from '../utils/math.js';
import { isValidVertex } from '../game/board.js';
import { NEON } from '../utils/colors.js';

const BLOOM_LAYER = 1;

// Tappable-vertex indicators. Each is a pair: bright inner core + pulsing
// outer ring. Breathing is (k+j)-staggered so the board shimmers, not blinks.
export function createVertexDots({ board: initialBoard, boardGroup }) {
  const group = new THREE.Group();
  boardGroup.add(group);
  const dots = [];
  let board = initialBoard;

  // Geometries shared across all dots
  const coreGeom = new THREE.CircleGeometry(0.045, 24);
  const ringGeom = new THREE.RingGeometry(0.085, 0.11, 24);

  function disposeAll() {
    while (dots.length) {
      const d = dots.pop();
      group.remove(d.core);
      group.remove(d.ring);
      d.coreMat.dispose();
      d.ringMat.dispose();
    }
  }

  function rebuild(newBoard) {
    if (newBoard) board = newBoard;
    disposeAll();
    for (let j = 0; j <= ROWS; j++) {
      for (let k = 0; k <= COLS; k++) {
        if (!isValidVertex(k, j, board)) continue;
        const [x, y, z] = vPos(k, j);

        const coreMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(NEON.cyan),
          transparent: true,
          opacity: 1,
          depthTest: false,
          depthWrite: false,
        });
        const core = new THREE.Mesh(coreGeom, coreMat);
        core.position.set(x, y, z + 0.02);
        core.renderOrder = 5;
        core.layers.set(BLOOM_LAYER);

        const ringMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(NEON.cyan),
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.position.set(x, y, z + 0.015);
        ring.renderOrder = 4;
        ring.layers.set(BLOOM_LAYER);

        group.add(core);
        group.add(ring);
        dots.push({
          core,
          ring,
          coreMat,
          ringMat,
          phaseOffset: ((k * 3 + j * 7) % 13) * 0.18,
        });
      }
    }
  }

  rebuild();

  function update(timeMs) {
    const t = timeMs * 0.001;
    for (const d of dots) {
      // 2.2s cycle, sine eased.
      const phase = (Math.sin((t + d.phaseOffset) * (Math.PI / 1.1)) + 1) * 0.5;
      d.coreMat.opacity = 0.6 + 0.4 * phase;
      // Ring pulses ~180° out of phase with core so the two read as breathing.
      const ringPhase = (Math.sin((t + d.phaseOffset + 1.1) * (Math.PI / 1.1)) + 1) * 0.5;
      d.ringMat.opacity = 0.35 + 0.45 * ringPhase;
      const scale = 0.9 + 0.35 * ringPhase;
      d.ring.scale.set(scale, scale, 1);
    }
  }

  return { rebuild, update };
}
