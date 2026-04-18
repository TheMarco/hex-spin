import * as THREE from 'three';
import { vPos, ROWS, COLS } from '../utils/math.js';
import { isValidVertex } from '../game/board.js';

const HIT_RADIUS = 0.4;

// Clockwise-rotate SVG cursor, white with black outline for legibility on any
// background. 28px, hotspot centered.
const ROTATE_CURSOR_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'>" +
  "<g stroke='black' stroke-width='4.5'>" +
  "<polyline points='22 4 22 10 16 10'/>" +
  "<path d='M20 14.5a8.5 8.5 0 1 1 -2 -8.9L22 10'/>" +
  '</g>' +
  "<g stroke='white' stroke-width='2.5'>" +
  "<polyline points='22 4 22 10 16 10'/>" +
  "<path d='M20 14.5a8.5 8.5 0 1 1 -2 -8.9L22 10'/>" +
  '</g>' +
  '</svg>';
const ROTATE_CURSOR = `url("data:image/svg+xml;utf8,${encodeURIComponent(ROTATE_CURSOR_SVG)}") 14 14, pointer`;

export function setupPointer({ canvas, camera, board: initialBoard, boardGroup, onTap }) {
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

  function onPointerDown(ev) {
    const v = pointerToVertex(ev);
    if (v) onTap(v.k, v.j);
  }

  let cursorHinting = false;
  function onPointerMove(ev) {
    if (ev.pointerType === 'touch') return;
    const hovering = Boolean(pointerToVertex(ev));
    if (hovering === cursorHinting) return;
    cursorHinting = hovering;
    canvas.style.cursor = hovering ? ROTATE_CURSOR : '';
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);

  return {
    rebuildHitCircles,
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      hitGeom.dispose();
      hitMaterial.dispose();
    },
  };
}
