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

function addVec(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subVec(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function centroidOf(corners) {
  return [
    (corners[0][0] + corners[1][0] + corners[2][0]) / 3,
    (corners[0][1] + corners[1][1] + corners[2][1]) / 3,
    (corners[0][2] + corners[1][2] + corners[2][2]) / 3,
  ];
}

function perpOffset(a, b, length) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [(-dy / len) * length, (dx / len) * length, 0];
}

function polygonPoints(center, radius, sides, rotation = 0) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i * 2 * Math.PI) / sides;
    pts.push([
      center[0] + Math.cos(a) * radius,
      center[1] + Math.sin(a) * radius,
      center[2],
    ]);
  }
  return pts;
}

function radialPoint(from, center, distance) {
  const dir = subVec(center, from);
  const len = Math.hypot(dir[0], dir[1]) || 1;
  return [from[0] + (dir[0] / len) * distance, from[1] + (dir[1] / len) * distance, from[2]];
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
    1: 0.525,
    2: 0.6,
    3: 0.675,
    4: 0.75,
  }[phase] ?? 0.525;
}

function createDetailGeometry(outerCorners, phase) {
  const panelCorners = scaledCorners(outerCorners, PANEL_SCALE);
  const segments = [];
  const center = centroidOf(panelCorners);

  switch (phase) {
    case 2: {
      // Segmented control-panel look: same outer panel seam, but with
      // medians carving the face into three wedges around a compact core.
      const coreCorners = scaledCorners(outerCorners, NODE_SCALE);
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
      // Faceted armored plating: twin parallel hull trim with clean radial
      // panel seams and matching side seams — stealth-fighter vibe.
      pushLoop(segments, panelCorners);
      const inner = scaledCorners(outerCorners, 0.46);
      pushLoop(segments, inner);
      for (let i = 0; i < 3; i++) {
        // Radial corner seam (straight, aligned — not twisted).
        pushSegment(segments, panelCorners[i], inner[i]);
        // Parallel side-panel seam between outer and inner edge midpoints.
        const outerMid = mixPoint(panelCorners[i], panelCorners[(i + 1) % 3], 0.5);
        const innerMid = mixPoint(inner[i], inner[(i + 1) % 3], 0.5);
        pushSegment(segments, outerMid, innerMid);
        // Short inward tick on the inner edge mid — armor overlap detail.
        const innerTick = radialPoint(innerMid, center, 0.1);
        pushSegment(segments, innerMid, innerTick);
      }
      break;
    }
    case 4: {
      // Reactor hull: double trim, hex core vent, radial struts with clamps,
      // and a micro vent inside the reactor — the busiest, most ship-like.
      pushLoop(segments, panelCorners);
      const inner = scaledCorners(outerCorners, 0.52);
      pushLoop(segments, inner);
      const reactor = polygonPoints(center, 0.2, 6, 0);
      pushLoop(segments, reactor);
      pushLoop(segments, polygonPoints(center, 0.08, 6, Math.PI / 6));
      for (let i = 0; i < 3; i++) {
        // Radial strut from hull corner to inner ring.
        pushSegment(segments, panelCorners[i], inner[i]);
        const strutMid = mixPoint(panelCorners[i], inner[i], 0.55);
        const perp = perpOffset(panelCorners[i], inner[i], 0.07);
        pushSegment(segments, subVec(strutMid, perp), addVec(strutMid, perp));
        // Short radial feed from inner corner in toward the reactor hex.
        pushSegment(segments, inner[i], radialPoint(inner[i], center, 0.22));
        // Side seam between outer and inner edge midpoints.
        const outerMid = mixPoint(panelCorners[i], panelCorners[(i + 1) % 3], 0.5);
        const innerMid = mixPoint(inner[i], inner[(i + 1) % 3], 0.5);
        pushSegment(segments, outerMid, innerMid);
      }
      break;
    }
    case 1:
    default: {
      // Baseline PCB/chip read from the current implementation.
      const coreCorners = scaledCorners(outerCorners, NODE_SCALE);
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
      alphaToCoverage: true,
    });
    this.outlineMaterial.resolution.set(window.innerWidth, window.innerHeight);
    outlineMaterials.add(this.outlineMaterial);
    this.outlineMesh = new Line2(outlineGeom, this.outlineMaterial);
    this.outlineMesh.layers.set(BLOOM_LAYER);
    this.outlineMesh.computeLineDistances();

    this.detailMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(neonColor),
      transparent: true,
      opacity: 1,
      depthTest: false,
    });
    this.detailMesh = new THREE.LineSegments(createDetailGeometry(this.outerCorners, this.phase), this.detailMaterial);

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
