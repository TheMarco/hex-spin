import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { triangleVertices, vPos } from '../utils/math.js';
import { getThemeIdForPhase, getThemeVisuals } from '../utils/colors.js';
import { outlineMaterials } from './triangles.js';

const BLOOM_LAYER = 1;
const CURRENT_Z = 0.014;

function hash01(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function vertexKey([k, j]) {
  return `${k},${j}`;
}

function edgeKey(a, b) {
  const ak = vertexKey(a);
  const bk = vertexKey(b);
  return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
}

function mixPoint(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function collectInteriorEdges(board) {
  const edges = new Map();
  for (const triangle of Object.values(board)) {
    const vertices = triangleVertices(triangle.col, triangle.row);
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      const k = edgeKey(a, b);
      const entry = edges.get(k);
      if (entry) {
        entry.count += 1;
      } else {
        edges.set(k, { a, b, count: 1 });
      }
    }
  }
  return Array.from(edges.values()).filter((edge) => edge.count === 2);
}

function createLightningEdgePositions(aVertex, bVertex, seed) {
  const a = vPos(...aVertex);
  const b = vPos(...bVertex);
  const edgeX = b[0] - a[0];
  const edgeY = b[1] - a[1];
  const edgeLen = Math.hypot(edgeX, edgeY) || 1;
  const perpX = -edgeY / edgeLen;
  const perpY = edgeX / edgeLen;

  const p1 = mixPoint(a, b, 0.24);
  const p2 = mixPoint(a, b, 0.49);
  const p3 = mixPoint(a, b, 0.74);
  const amp1 = (hash01(seed + 1.1) - 0.5) * 0.08;
  const amp2 = (hash01(seed + 2.2) - 0.5) * 0.12;
  const amp3 = (hash01(seed + 3.3) - 0.5) * 0.08;

  return [
    ...a,
    p1[0] + perpX * amp1,
    p1[1] + perpY * amp1,
    p1[2],
    p2[0] + perpX * amp2,
    p2[1] + perpY * amp2,
    p2[2],
    p3[0] + perpX * amp3,
    p3[1] + perpY * amp3,
    p3[2],
    ...b,
  ];
}

function seamStyleForPhase(phase) {
  return (
    {
      1: {
        glowWidth: 3.4,
        coreWidth: 1.05,
        dashSize: 0.28,
        dashGap: 0.78,
        glowBaseOpacity: 0.018,
        glowStrikeOpacity: 0.2,
        coreBaseOpacity: 0,
        coreStrikeOpacity: 1.1,
      },
      2: {
        glowWidth: 3.7,
        coreWidth: 1.12,
        dashSize: 0.3,
        dashGap: 0.74,
        glowBaseOpacity: 0.024,
        glowStrikeOpacity: 0.22,
        coreBaseOpacity: 0,
        coreStrikeOpacity: 1.18,
      },
      3: {
        glowWidth: 4.0,
        coreWidth: 1.18,
        dashSize: 0.32,
        dashGap: 0.7,
        glowBaseOpacity: 0.026,
        glowStrikeOpacity: 0.24,
        coreBaseOpacity: 0,
        coreStrikeOpacity: 1.25,
      },
      4: {
        glowWidth: 4.4,
        coreWidth: 1.26,
        dashSize: 0.34,
        dashGap: 0.66,
        glowBaseOpacity: 0.03,
        glowStrikeOpacity: 0.29,
        coreBaseOpacity: 0,
        coreStrikeOpacity: 1.36,
      },
    }[phase] ?? {
      glowWidth: 3.4,
      coreWidth: 1.05,
      dashSize: 0.28,
      dashGap: 0.78,
      glowBaseOpacity: 0.018,
      glowStrikeOpacity: 0.2,
      coreBaseOpacity: 0,
      coreStrikeOpacity: 1.1,
    }
  );
}

function seamColorsForPhase(phase) {
  const visuals = getThemeVisuals(getThemeIdForPhase(phase));
  return {
    glow: new THREE.Color(visuals.flash).lerp(new THREE.Color('#ffffff'), 0.2),
    core: new THREE.Color('#ffffff'),
  };
}

export function createSeamCurrent({ board, boardGroup, phase = 1 }) {
  const group = new THREE.Group();
  group.position.z = CURRENT_Z;
  boardGroup.add(group);

  const interiorEdges = collectInteriorEdges(board);
  const boltCount = interiorEdges.length;
  // Stratified strike-phase offsets so bolts fire evenly across the cycle
  // in both space and time. Stratum assignment is driven by each bolt's
  // seed hash (not its index) so spatial neighbors don't end up in adjacent
  // time slots.
  const strataOrder = Array.from({ length: boltCount }, (_, i) => i).sort(
    (a, b) => hash01(a * 13.17 + 0.37 + 11.7) - hash01(b * 13.17 + 0.37 + 11.7)
  );

  const bolts = interiorEdges.map((edge, idx) => {
    const seed = idx * 13.17 + 0.37;
    const positions = createLightningEdgePositions(edge.a, edge.b, seed);
    // Each bolt fires once per cycle, with a short fixed-duration pulse.
    // Cycle length + duration are decoupled so "less frequent" doesn't also
    // mean "each flash lasts longer".
    const cyclePeriod = 20 + hash01(seed + 3.8) * 12; // 20–32 s per bolt
    const strikeDuration = 0.22; // s, fixed flare
    const stratumIdx = strataOrder[idx];
    const stratumSize = cyclePeriod / Math.max(1, boltCount);
    const strikePhase = stratumIdx * stratumSize + hash01(seed + 5.5) * stratumSize;

    const glowGeom = new LineGeometry();
    glowGeom.setPositions(positions);
    const glowMaterial = new LineMaterial({
      color: new THREE.Color('#ffffff'),
      linewidth: 3.4,
      transparent: true,
      opacity: 0.02,
      depthTest: false,
      dashed: true,
      dashSize: 0.16,
      gapSize: 0.88,
    });
    glowMaterial.resolution.set(window.innerWidth, window.innerHeight);
    glowMaterial.userData.anim = {
      dashOffset: hash01(seed + 7.3),
      driftSpeed: 2.1 + hash01(seed + 9.1) * 1.35,
      cyclePeriod,
      strikeDuration,
      strikePhase,
      glowBaseOpacity: 0.018,
      glowStrikeOpacity: 0.2,
      coreBaseOpacity: 0,
      coreStrikeOpacity: 1.1,
    };
    outlineMaterials.add(glowMaterial);
    const glow = new Line2(glowGeom, glowMaterial);
    glow.layers.set(BLOOM_LAYER);
    glow.renderOrder = 2;
    glow.computeLineDistances();

    const coreGeom = new LineGeometry();
    coreGeom.setPositions(positions);
    const coreMaterial = new LineMaterial({
      color: new THREE.Color('#ffffff'),
      linewidth: 1.05,
      transparent: true,
      opacity: 0,
      depthTest: false,
      dashed: true,
      dashSize: 0.16,
      gapSize: 0.88,
    });
    coreMaterial.resolution.set(window.innerWidth, window.innerHeight);
    coreMaterial.userData.anim = glowMaterial.userData.anim;
    outlineMaterials.add(coreMaterial);
    const core = new Line2(coreGeom, coreMaterial);
    core.layers.set(BLOOM_LAYER);
    core.renderOrder = 3;
    core.computeLineDistances();

    group.add(glow);
    group.add(core);
    return { glow, core, glowMaterial, coreMaterial };
  });

  function applyPhase(phaseNumber) {
    const style = seamStyleForPhase(phaseNumber);
    const colors = seamColorsForPhase(phaseNumber);
    for (const bolt of bolts) {
      bolt.glowMaterial.color.copy(colors.glow);
      bolt.glowMaterial.linewidth = style.glowWidth;
      bolt.glowMaterial.dashSize = style.dashSize;
      bolt.glowMaterial.gapSize = style.dashGap;

      bolt.coreMaterial.color.copy(colors.core);
      bolt.coreMaterial.linewidth = style.coreWidth;
      bolt.coreMaterial.dashSize = style.dashSize * 0.86;
      bolt.coreMaterial.gapSize = style.dashGap;

      bolt.glowMaterial.userData.anim.glowBaseOpacity = style.glowBaseOpacity;
      bolt.glowMaterial.userData.anim.glowStrikeOpacity = style.glowStrikeOpacity;
      bolt.glowMaterial.userData.anim.coreBaseOpacity = style.coreBaseOpacity;
      bolt.glowMaterial.userData.anim.coreStrikeOpacity = style.coreStrikeOpacity;
    }
  }

  applyPhase(phase);

  return {
    update(timeMs) {
      const t = timeMs * 0.001;
      for (const bolt of bolts) {
        const anim = bolt.glowMaterial.userData.anim;
        const drift = anim.dashOffset - t * anim.driftSpeed;
        const period = anim.cyclePeriod;
        const pos = (((t + anim.strikePhase) % period) + period) % period;
        let energy = 0;
        if (pos < anim.strikeDuration) {
          energy = Math.sin((pos / anim.strikeDuration) * Math.PI);
        }

        bolt.glowMaterial.dashOffset = drift;
        bolt.coreMaterial.dashOffset = drift - 0.035;
        bolt.glowMaterial.opacity = anim.glowBaseOpacity + energy * anim.glowStrikeOpacity;
        bolt.coreMaterial.opacity = anim.coreBaseOpacity + energy * anim.coreStrikeOpacity;
      }
    },

    setPhase(phaseNumber) {
      applyPhase(phaseNumber);
    },

    dispose() {
      boardGroup.remove(group);
      for (const bolt of bolts) {
        bolt.glow.geometry.dispose();
        outlineMaterials.delete(bolt.glowMaterial);
        bolt.glowMaterial.dispose();
        bolt.core.geometry.dispose();
        outlineMaterials.delete(bolt.coreMaterial);
        bolt.coreMaterial.dispose();
      }
    },
  };
}
