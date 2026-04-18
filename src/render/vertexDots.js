import * as THREE from 'three';
import { vPos, ROWS, COLS } from '../utils/math.js';
import { isValidVertex } from '../game/board.js';
import { DEFAULT_THEME_ID, getThemeVisuals } from '../utils/colors.js';
const BLOOM_LAYER = 1;

// Tappable-vertex hinge: flat-top hex outline (vertices aligned with the 6
// edges emanating from this vertex toward neighbor vertices), 6 radial spoke
// teeth at those vertices, bright core. Static — no pulse, no outer halo.
export function createVertexDots({ board: initialBoard, boardGroup }) {
  const group = new THREE.Group();
  boardGroup.add(group);
  const dots = [];
  let board = initialBoard;
  let themeVisuals = getThemeVisuals(DEFAULT_THEME_ID);

  const HEX_R = 0.1;
  const CORE_R = 0.042;
  const SPOKE_INNER = 0.1;
  const SPOKE_OUTER = 0.14;

  const coreGeom = new THREE.CircleGeometry(CORE_R, 24);

  // Flat-top hex outline: 6 vertices at 0°, 60°, … 300°.
  const hexPoints = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    hexPoints.push([Math.cos(a) * HEX_R, Math.sin(a) * HEX_R, 0]);
  }
  const hexSegArr = [];
  for (let i = 0; i < 6; i++) {
    hexSegArr.push(...hexPoints[i], ...hexPoints[(i + 1) % 6]);
  }
  const hexGeom = new THREE.BufferGeometry();
  hexGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(hexSegArr), 3));

  // Spokes: 6 short radial segments at the hex vertex directions.
  const spokeArr = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    spokeArr.push(cosA * SPOKE_INNER, sinA * SPOKE_INNER, 0);
    spokeArr.push(cosA * SPOKE_OUTER, sinA * SPOKE_OUTER, 0);
  }
  const spokeGeom = new THREE.BufferGeometry();
  spokeGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(spokeArr), 3));

  function disposeAll() {
    while (dots.length) {
      const d = dots.pop();
      for (const m of d.meshes) group.remove(m);
      for (const mat of d.materials) mat.dispose();
    }
  }

  function rebuild(newBoard) {
    if (newBoard) board = newBoard;
    disposeAll();
    for (let j = 0; j <= ROWS; j++) {
      for (let k = 0; k <= COLS; k++) {
        if (!isValidVertex(k, j, board)) continue;
        const [x, y, z] = vPos(k, j);

        const hexMat = new THREE.LineBasicMaterial({
          color: new THREE.Color(themeVisuals.vertex),
          transparent: true,
          opacity: 0.95,
          depthTest: false,
          depthWrite: false,
        });
        const hex = new THREE.LineSegments(hexGeom, hexMat);
        hex.position.set(x, y, z + 0.014);
        hex.renderOrder = 5;
        hex.layers.set(BLOOM_LAYER);

        const spokesMat = new THREE.LineBasicMaterial({
          color: new THREE.Color(themeVisuals.vertex),
          transparent: true,
          opacity: 0.85,
          depthTest: false,
          depthWrite: false,
        });
        const spokes = new THREE.LineSegments(spokeGeom, spokesMat);
        spokes.position.set(x, y, z + 0.014);
        spokes.renderOrder = 5;
        spokes.layers.set(BLOOM_LAYER);

        const coreMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(themeVisuals.vertexCore),
          transparent: true,
          opacity: 1,
          depthTest: false,
          depthWrite: false,
        });
        const core = new THREE.Mesh(coreGeom, coreMat);
        core.position.set(x, y, z + 0.02);
        core.renderOrder = 6;
        core.layers.set(BLOOM_LAYER);

        group.add(hex);
        group.add(spokes);
        group.add(core);

        dots.push({
          meshes: [hex, spokes, core],
          materials: [hexMat, spokesMat, coreMat],
        });
      }
    }
  }

  function setTheme(themeId) {
    themeVisuals = getThemeVisuals(themeId);
    rebuild();
  }

  rebuild();

  return { rebuild, setTheme, update: () => {} };
}
