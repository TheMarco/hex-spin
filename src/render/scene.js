import * as THREE from 'three';
import { S, H, HEX_CENTER_K, HEX_CENTER_J } from '../utils/math.js';
import { BG } from '../utils/colors.js';
import { Triangle } from './triangles.js';

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, -1.5, 10);
  camera.lookAt(0, 0, 0);

  const boardGroup = new THREE.Group();
  // Center the hex on world origin by negating the hex center's local pos.
  boardGroup.position.set((-HEX_CENTER_K * S) / 2, HEX_CENTER_J * H, 0);
  scene.add(boardGroup);

  return { scene, camera, boardGroup };
}

export function mountBoard(boardGroup, board) {
  const triangleViews = {};
  for (const k of Object.keys(board)) {
    const t = board[k];
    const view = new Triangle(t.col, t.row, t.color);
    triangleViews[k] = view;
    boardGroup.add(view.group);
  }
  return triangleViews;
}

export function unmountBoard(boardGroup, triangleViews) {
  for (const k of Object.keys(triangleViews)) {
    const v = triangleViews[k];
    boardGroup.remove(v.group);
    v.dispose();
    delete triangleViews[k];
  }
}
