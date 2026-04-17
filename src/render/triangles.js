import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { triangleVertices, vPos } from '../utils/math.js';
import { darkVariant } from '../utils/colors.js';
import { tween } from '../utils/animate.js';

const SHRINK = 0.92;
const BLOOM_LAYER = 1;
const OUTLINE_PIXEL_WIDTH = 2;

// Shared registry — every LineMaterial registers itself here so resize
// can update its `resolution` uniform (Line2 requirement, spec §15).
export const outlineMaterials = new Set();

export function refreshOutlineResolution(width, height) {
  for (const m of outlineMaterials) m.resolution.set(width, height);
}

function shrunkCorners(col, row) {
  const corners = triangleVertices(col, row).map(([k, j]) => vPos(k, j));
  const cx = (corners[0][0] + corners[1][0] + corners[2][0]) / 3;
  const cy = (corners[0][1] + corners[1][1] + corners[2][1]) / 3;
  return corners.map(([x, y, z]) => [cx + (x - cx) * SHRINK, cy + (y - cy) * SHRINK, z]);
}

export class Triangle {
  constructor(col, row, neonColor) {
    this.col = col;
    this.row = row;
    this.color = neonColor;

    const corners = shrunkCorners(col, row);

    // Fill mesh (layer 0, dark variant)
    const fillGeom = new THREE.BufferGeometry();
    fillGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([...corners[0], ...corners[1], ...corners[2]]), 3)
    );
    fillGeom.setIndex([0, 1, 2]);
    fillGeom.computeVertexNormals();

    this.fillMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(darkVariant(neonColor)),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1,
    });
    this.fillMesh = new THREE.Mesh(fillGeom, this.fillMaterial);

    // Outline (layer 1 = bloom, neon, Line2 with pixel-width)
    const outlineGeom = new LineGeometry();
    outlineGeom.setPositions([
      ...corners[0],
      ...corners[1],
      ...corners[2],
      ...corners[0], // close loop
    ]);

    this.outlineMaterial = new LineMaterial({
      color: new THREE.Color(neonColor),
      linewidth: OUTLINE_PIXEL_WIDTH,
      transparent: true,
      opacity: 1,
      depthTest: false,
    });
    this.outlineMaterial.resolution.set(window.innerWidth, window.innerHeight);
    outlineMaterials.add(this.outlineMaterial);

    this.outlineMesh = new Line2(outlineGeom, this.outlineMaterial);
    this.outlineMesh.layers.set(BLOOM_LAYER);
    this.outlineMesh.computeLineDistances();

    this.group = new THREE.Group();
    this.group.add(this.fillMesh);
    this.group.add(this.outlineMesh);
  }

  setColor(neonHex) {
    this.color = neonHex;
    this.fillMaterial.color.set(darkVariant(neonHex));
    this.outlineMaterial.color.set(neonHex);
  }

  fade(toOpacity, durationMs) {
    const fromFill = this.fillMaterial.opacity;
    const fromOutline = this.outlineMaterial.opacity;
    return tween(durationMs, 'linear', (t) => {
      this.fillMaterial.opacity = fromFill + (toOpacity - fromFill) * t;
      this.outlineMaterial.opacity = fromOutline + (toOpacity - fromOutline) * t;
    });
  }

  flash(durationMs) {
    // Pulse outline opacity 1 → ~1.85 → 1 via sine. Bloom turns the brightness
    // bump into a visible white-hot flash (spec §6.5).
    return tween(durationMs, 'sinePulse', (eased) => {
      this.outlineMaterial.opacity = 1 + eased * 0.85;
    }).then(() => {
      this.outlineMaterial.opacity = 1;
    });
  }

  dispose() {
    this.fillMesh.geometry.dispose();
    this.fillMaterial.dispose();
    this.outlineMesh.geometry.dispose();
    outlineMaterials.delete(this.outlineMaterial);
    this.outlineMaterial.dispose();
  }
}
