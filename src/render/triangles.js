import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { triangleVertices, vPos } from '../utils/math.js';
import { darkVariant } from '../utils/colors.js';
import { tween } from '../utils/animate.js';

const SHRINK = 0.92;
const PANEL_SCALE = 0.72; // inset hull-panel seam
const NODE_SCALE = 0.18;  // inner "chip" node
const DETAIL_DIM = 0.42;  // circuit details kept well below outline brightness
const BLOOM_LAYER = 1;
const OUTLINE_PIXEL_WIDTH = 2;

// Shared registry — every LineMaterial registers itself here so resize
// can update its `resolution` uniform (Line2 requirement, spec §15).
export const outlineMaterials = new Set();

export function refreshOutlineResolution(width, height) {
  for (const m of outlineMaterials) m.resolution.set(width, height);
}

function scaledCorners(corners, scale) {
  const cx = (corners[0][0] + corners[1][0] + corners[2][0]) / 3;
  const cy = (corners[0][1] + corners[1][1] + corners[2][1]) / 3;
  return corners.map(([x, y, z]) => [cx + (x - cx) * scale, cy + (y - cy) * scale, z]);
}

export class Triangle {
  constructor(col, row, neonColor) {
    this.col = col;
    this.row = row;
    this.color = neonColor;
    this.currentOpacity = 1;

    const baseCorners = triangleVertices(col, row).map(([k, j]) => vPos(k, j));
    const outerCorners = scaledCorners(baseCorners, SHRINK);
    const panelCorners = scaledCorners(outerCorners, PANEL_SCALE);
    const nodeCorners = scaledCorners(outerCorners, NODE_SCALE);

    // Dark fill (layer 0)
    const fillGeom = new THREE.BufferGeometry();
    fillGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([...outerCorners[0], ...outerCorners[1], ...outerCorners[2]]),
        3
      )
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

    // Bright outer outline — the only piece on the bloom layer (spec §15).
    const outlineGeom = new LineGeometry();
    outlineGeom.setPositions([
      ...outerCorners[0],
      ...outerCorners[1],
      ...outerCorners[2],
      ...outerCorners[0],
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

    // Circuit/hull-panel detail — panel seam + inner node + 3 traces linking
    // them. Single LineSegments, layer 0, muted color. Reads as etched panel
    // lines rather than glowing neon (spec tone: spaceship hull / PCB).
    const segPoints = [];
    for (let i = 0; i < 3; i++) {
      segPoints.push(...panelCorners[i], ...panelCorners[(i + 1) % 3]);
    }
    for (let i = 0; i < 3; i++) {
      segPoints.push(...nodeCorners[i], ...nodeCorners[(i + 1) % 3]);
    }
    for (let i = 0; i < 3; i++) {
      segPoints.push(...nodeCorners[i], ...panelCorners[i]);
    }
    const detailGeom = new THREE.BufferGeometry();
    detailGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segPoints), 3));
    this.detailMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(neonColor).multiplyScalar(DETAIL_DIM),
      transparent: true,
      opacity: 1,
      depthTest: false,
    });
    this.detailMesh = new THREE.LineSegments(detailGeom, this.detailMaterial);
    // Force detail to render after the dark fill. Without this, THREE's
    // transparent sort can tie at z=0 and fill draws over detail for some
    // orientations (noticed: down-triangles losing the design).
    this.fillMesh.renderOrder = 0;
    this.detailMesh.renderOrder = 1;
    this.detailMesh.position.z = 0.01;

    this.group = new THREE.Group();
    this.group.add(this.fillMesh);
    this.group.add(this.outlineMesh);
    this.group.add(this.detailMesh);
  }

  setColor(neonHex) {
    this.color = neonHex;
    this.fillMaterial.color.set(darkVariant(neonHex));
    this.outlineMaterial.color.set(neonHex);
    this.detailMaterial.color.set(neonHex).multiplyScalar(DETAIL_DIM);
  }

  setOpacity(op) {
    this.currentOpacity = op;
    this.fillMaterial.opacity = op;
    this.outlineMaterial.opacity = op;
    this.detailMaterial.opacity = op;
  }

  fade(toOpacity, durationMs) {
    const from = this.currentOpacity;
    return tween(durationMs, 'linear', (t) => {
      this.setOpacity(from + (toOpacity - from) * t);
    });
  }

  flash(durationMs) {
    // Pulse only the bright outline — bloom turns it into a white-hot flash
    // (spec §6.5). Detail layer stays calm so the "etched panel" read holds.
    return tween(durationMs, 'sinePulse', (eased) => {
      this.outlineMaterial.opacity = 1 + eased * 0.85;
    }).then(() => {
      this.outlineMaterial.opacity = this.currentOpacity;
    });
  }

  dispose() {
    this.fillMesh.geometry.dispose();
    this.fillMaterial.dispose();
    this.outlineMesh.geometry.dispose();
    outlineMaterials.delete(this.outlineMaterial);
    this.outlineMaterial.dispose();
    this.detailMesh.geometry.dispose();
    this.detailMaterial.dispose();
  }
}
