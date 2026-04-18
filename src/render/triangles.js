import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { triangleVertices, vPos } from '../utils/math.js';
import { darkVariant } from '../utils/colors.js';
import { tween } from '../utils/animate.js';

const SHRINK = 0.92;
const PANEL_SCALE = 0.72; // inset hull-panel seam
const NODE_SCALE = 0.18; // inner "chip" node
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

function mixPoint(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function pushSegment(segments, a, b) {
  segments.push(...a, ...b);
}

function pushLoop(segments, corners) {
  for (let i = 0; i < corners.length; i++) {
    pushSegment(segments, corners[i], corners[(i + 1) % corners.length]);
  }
}

function detailIntensityForPhase(phase) {
  return {
    1: 0.42,
    2: 0.48,
    3: 0.54,
    4: 0.6,
  }[phase] ?? 0.42;
}

function createDetailGeometry(outerCorners, phase) {
  const panelCorners = scaledCorners(outerCorners, PANEL_SCALE);
  const latticeCorners = scaledCorners(outerCorners, 0.5);
  const coreCorners = scaledCorners(outerCorners, NODE_SCALE);
  const segments = [];

  switch (phase) {
    case 2: {
      // Segmented control-panel look: same outer panel seam, but with
      // medians carving the face into three wedges around a compact core.
      pushLoop(segments, panelCorners);
      pushLoop(segments, coreCorners);
      for (let i = 0; i < panelCorners.length; i++) {
        const oppositeMid = mixPoint(
          panelCorners[(i + 1) % panelCorners.length],
          panelCorners[(i + 2) % panelCorners.length],
          0.5
        );
        pushSegment(segments, panelCorners[i], oppositeMid);
      }
      break;
    }
    case 3: {
      // Twisted lattice: a second inset triangle and offset braces that make
      // the interior feel more energized without changing the silhouette.
      pushLoop(segments, panelCorners);
      pushLoop(segments, latticeCorners);
      for (let i = 0; i < panelCorners.length; i++) {
        pushSegment(segments, panelCorners[i], latticeCorners[(i + 1) % latticeCorners.length]);
      }
      break;
    }
    case 4: {
      // Reactor core: nested rings and mid-edge links create the densest
      // interior pattern of the run while keeping the outside identical.
      pushLoop(segments, panelCorners);
      pushLoop(segments, latticeCorners);
      pushLoop(segments, coreCorners);
      for (let i = 0; i < panelCorners.length; i++) {
        const edgeMid = mixPoint(panelCorners[i], panelCorners[(i + 1) % panelCorners.length], 0.5);
        pushSegment(segments, edgeMid, latticeCorners[i]);
        pushSegment(segments, latticeCorners[i], coreCorners[(i + 1) % coreCorners.length]);
      }
      break;
    }
    case 1:
    default: {
      // Baseline PCB/chip read from the current implementation.
      pushLoop(segments, panelCorners);
      pushLoop(segments, coreCorners);
      for (let i = 0; i < panelCorners.length; i++) {
        pushSegment(segments, coreCorners[i], panelCorners[i]);
      }
      break;
    }
  }

  const detailGeom = new THREE.BufferGeometry();
  detailGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segments), 3));
  return detailGeom;
}

export class Triangle {
  constructor(col, row, neonColor, { phase = 1 } = {}) {
    this.col = col;
    this.row = row;
    this.color = neonColor;
    this.phase = phase;
    this.currentOpacity = 1;

    const baseCorners = triangleVertices(col, row).map(([k, j]) => vPos(k, j));
    this.outerCorners = scaledCorners(baseCorners, SHRINK);

    // Dark fill (layer 0)
    const fillGeom = new THREE.BufferGeometry();
    fillGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([...this.outerCorners[0], ...this.outerCorners[1], ...this.outerCorners[2]]),
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
      ...this.outerCorners[0],
      ...this.outerCorners[1],
      ...this.outerCorners[2],
      ...this.outerCorners[0],
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

    // Inner detail only. The outer triangle silhouette remains unchanged
    // across phases; phase styling happens entirely inside this layer.
    this.detailMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(neonColor),
      transparent: true,
      opacity: 1,
      depthTest: false,
    });
    this.detailMesh = new THREE.LineSegments(createDetailGeometry(this.outerCorners, this.phase), this.detailMaterial);
    // Force detail to render after the dark fill. Without this, THREE's
    // transparent sort can tie at z=0 and fill draws over detail for some
    // orientations (noticed: down-triangles losing the design).
    this.fillMesh.renderOrder = 0;
    this.detailMesh.renderOrder = 1;
    this.detailMesh.position.z = 0.01;
    this.applyDetailColor();

    this.group = new THREE.Group();
    this.group.add(this.fillMesh);
    this.group.add(this.outlineMesh);
    this.group.add(this.detailMesh);
  }

  applyDetailColor() {
    this.detailMaterial.color.set(this.color).multiplyScalar(detailIntensityForPhase(this.phase));
  }

  setColor(neonHex) {
    this.color = neonHex;
    this.fillMaterial.color.set(darkVariant(neonHex));
    this.outlineMaterial.color.set(neonHex);
    this.applyDetailColor();
  }

  setPhaseStyle(phase) {
    if (this.phase === phase) return;
    this.phase = phase;
    this.detailMesh.geometry.dispose();
    this.detailMesh.geometry = createDetailGeometry(this.outerCorners, phase);
    this.applyDetailColor();
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
