import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { ring, triangleVertices, vPos } from '../utils/math.js';
import { outlineMaterials } from './triangles.js';

const BLOOM_LAYER = 1;

// Six outer corners of the hex ring around vertex (k, j), in CW order.
function hexCornersAroundVertex(k, j) {
  const ringCells = ring(k, j);
  const pivotKey = `${k},${j}`;
  const seen = new Set();
  const corners = [];
  for (const [col, row] of ringCells) {
    const verts = triangleVertices(col, row);
    for (const [vk, vj] of verts) {
      const key = `${vk},${vj}`;
      if (key === pivotKey) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      corners.push([vk, vj]);
    }
  }
  // Sort CW starting from north around the pivot.
  const [px, py] = vPos(k, j);
  corners.sort((a, b) => {
    const [ax, ay] = vPos(a[0], a[1]);
    const [bx, by] = vPos(b[0], b[1]);
    const angleA = Math.atan2(ay - py, ax - px);
    const angleB = Math.atan2(by - py, bx - px);
    return angleB - angleA;
  });
  return corners.map(([vk, vj]) => vPos(vk, vj));
}

export function createHexHighlight({ boardGroup, k, j, color = '#ffffff' }) {
  const corners = hexCornersAroundVertex(k, j);

  const positions = [];
  for (const [x, y] of corners) positions.push(x, y, 0.02);
  positions.push(corners[0][0], corners[0][1], 0.02);

  const geom = new LineGeometry();
  geom.setPositions(positions);

  // Boost the tint toward white so the bloom pass picks it up hard.
  const boosted = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35);

  const material = new LineMaterial({
    color: boosted,
    linewidth: 4,
    transparent: true,
    opacity: 1,
    depthTest: false,
    alphaToCoverage: true,
  });
  material.resolution.set(window.innerWidth, window.innerHeight);
  outlineMaterials.add(material);

  const line = new Line2(geom, material);
  line.layers.set(BLOOM_LAYER);
  line.computeLineDistances();
  line.renderOrder = 5;
  boardGroup.add(line);

  // A second, wider line behind the main one so bloom radiates further.
  const glowMaterial = new LineMaterial({
    color: new THREE.Color(color),
    linewidth: 9,
    transparent: true,
    opacity: 0.6,
    depthTest: false,
    alphaToCoverage: true,
  });
  glowMaterial.resolution.set(window.innerWidth, window.innerHeight);
  outlineMaterials.add(glowMaterial);

  const glowLine = new Line2(geom, glowMaterial);
  glowLine.layers.set(BLOOM_LAYER);
  glowLine.computeLineDistances();
  glowLine.renderOrder = 4;
  boardGroup.add(glowLine);

  let rafId = null;
  const start = performance.now();
  function animate() {
    const t = (performance.now() - start) / 1000;
    // Breathing pulse between bright and very bright — never dim.
    const pulse = 0.82 + 0.18 * Math.abs(Math.sin(t * 2.8));
    material.opacity = pulse;
    glowMaterial.opacity = 0.45 + 0.35 * Math.abs(Math.sin(t * 2.8));
    rafId = requestAnimationFrame(animate);
  }
  animate();

  return {
    dispose() {
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = null;
      boardGroup.remove(line);
      boardGroup.remove(glowLine);
      geom.dispose();
      outlineMaterials.delete(material);
      outlineMaterials.delete(glowMaterial);
      material.dispose();
      glowMaterial.dispose();
    },
  };
}
