import * as THREE from 'three';
import { vPos, ROWS, COLS } from '../utils/math.js';
import { isValidVertex } from '../game/board.js';

const HIT_RADIUS = 0.4;

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

  canvas.addEventListener('pointerdown', onPointerDown);

  return {
    rebuildHitCircles,
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      hitGeom.dispose();
      hitMaterial.dispose();
    },
  };
}
