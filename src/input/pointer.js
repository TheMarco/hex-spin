import * as THREE from 'three';
import { vPos, ROWS, COLS } from '../utils/math.js';
import { isValidVertex } from '../game/board.js';

const HIT_RADIUS = 0.4;

// Rotate cursor SVGs — white with black outline for legibility on any
// background. 28px, hotspot centered. Two variants, one per rotation direction.
function rotateCursor(direction) {
  const path =
    direction === 'ccw'
      ? "<polyline points='2 4 2 10 8 10'/><path d='M4 14.5a8.5 8.5 0 1 0 2 -8.9L2 10'/>"
      : "<polyline points='22 4 22 10 16 10'/><path d='M20 14.5a8.5 8.5 0 1 1 -2 -8.9L22 10'/>";
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'>" +
    `<g stroke='black' stroke-width='4.5'>${path}</g>` +
    `<g stroke='white' stroke-width='2.5'>${path}</g>` +
    '</svg>';
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 14 14, pointer`;
}
const ROTATE_CURSOR_CW = rotateCursor('cw');
const ROTATE_CURSOR_CCW = rotateCursor('ccw');

export function setupPointer({
  canvas,
  camera,
  board: initialBoard,
  boardGroup,
  onTap,
  getDirection,
}) {
  const hitGroup = new THREE.Group();
  boardGroup.add(hitGroup);
  const hitCircles = [];
  let board = initialBoard;

  const hitMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const hitGeom = new THREE.CircleGeometry(HIT_RADIUS, 16);

  function rebuildHitCircles(newBoard) {
    if (newBoard) board = newBoard;
    while (hitCircles.length) {
      const m = hitCircles.pop();
      hitGroup.remove(m);
    }
    for (let j = 0; j <= ROWS; j++) {
      for (let k = 0; k <= COLS; k++) {
        if (!isValidVertex(k, j, board)) continue;
        const [x, y, z] = vPos(k, j);
        const m = new THREE.Mesh(hitGeom, hitMaterial);
        m.position.set(x, y, z + 0.01);
        m.userData = { k, j };
        hitGroup.add(m);
        hitCircles.push(m);
      }
    }
  }

  rebuildHitCircles();

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pointerToVertex(ev) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(hitCircles, false);
    return hits.length ? hits[0].object.userData : null;
  }

  function resolveDirection(ev) {
    if (ev?.shiftKey) return 'ccw';
    return getDirection?.() || 'cw';
  }

  function onPointerDown(ev) {
    const v = pointerToVertex(ev);
    if (v) onTap(v.k, v.j, resolveDirection(ev));
  }

  let cursorHinting = false;
  let cursorDirection = 'cw';
  function applyCursor() {
    if (!cursorHinting) {
      canvas.style.cursor = '';
      return;
    }
    canvas.style.cursor = cursorDirection === 'ccw' ? ROTATE_CURSOR_CCW : ROTATE_CURSOR_CW;
  }
  function onPointerMove(ev) {
    if (ev.pointerType === 'touch') return;
    const hovering = Boolean(pointerToVertex(ev));
    const nextDir = resolveDirection(ev);
    if (hovering === cursorHinting && nextDir === cursorDirection) return;
    cursorHinting = hovering;
    cursorDirection = nextDir;
    applyCursor();
  }

  // Refresh the cursor when the reverse modifier is pressed/released while the
  // pointer is already hovering over a vertex.
  function refreshCursor() {
    if (!cursorHinting) return;
    cursorDirection = getDirection?.() || 'cw';
    applyCursor();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);

  return {
    rebuildHitCircles,
    refreshCursor,
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      hitGeom.dispose();
      hitMaterial.dispose();
    },
  };
}
