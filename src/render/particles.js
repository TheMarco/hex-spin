import * as THREE from 'three';
import { DEFAULT_THEME_ID, getThemeVisuals } from '../utils/colors.js';

const BLOOM_LAYER = 1;

export function createParticleSystem({ boardGroup }) {
  const live = [];
  let themeVisuals = getThemeVisuals(DEFAULT_THEME_ID);

  const PARTICLE_SIZE = 0.07;
  const ph = (PARTICLE_SIZE * Math.sqrt(3)) / 2;
  const triGeom = new THREE.BufferGeometry();
  triGeom.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array([
        0,
        (ph * 2) / 3,
        0,
        -PARTICLE_SIZE / 2,
        -ph / 3,
        0,
        PARTICLE_SIZE / 2,
        -ph / 3,
        0,
      ]),
      3
    )
  );
  triGeom.setIndex([0, 1, 2]);

  // Hexagonal ring, oriented pointy-top to match the hex perimeter.
  const hexRingGeom = new THREE.RingGeometry(0.92, 1.02, 6);
  hexRingGeom.rotateZ(Math.PI / 2);

  // 4-point sparkle star: 4 long spikes + pinched waist between them.
  const sparkGeom = (() => {
    const geom = new THREE.BufferGeometry();
    const spikeLong = 0.09;
    const core = 0.012;
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? spikeLong : core;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    pts.push([0, 0]);
    const centerIdx = 8;
    const positions = [];
    for (const [x, y] of pts) positions.push(x, y, 0);
    const indices = [];
    for (let i = 0; i < 8; i++) indices.push(centerIdx, i, (i + 1) % 8);
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geom.setIndex(indices);
    return geom;
  })();

  function removeLiveParticle(particle, index) {
    boardGroup.remove(particle);
    particle.material?.dispose?.();
    if (particle.userData.disposeGeometry) {
      particle.geometry?.dispose?.();
    }
    live.splice(index, 1);
  }

  function shatter(localX, localY, color, count = 6) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: c,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(triGeom, mat);
      m.position.set(localX, localY, 0.05);
      m.scale.setScalar(0.8);
      m.layers.set(BLOOM_LAYER);
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.3 + Math.random() * 1.6;
      m.userData = {
        kind: 'shatter',
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + Math.random() * 0.4,
        vRot: (Math.random() - 0.5) * 10,
        age: 0,
        lifeMs: 640,
      };
      boardGroup.add(m);
      live.push(m);
    }
  }

  // Particles rush in from outside the hex toward its center, accelerating.
  // This is the primary "pop" for hex completion.
  function implode(localX, localY, color, count = 42) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 1.65 + Math.random() * 0.75;
      const startX = localX + Math.cos(angle) * dist;
      const startY = localY + Math.sin(angle) * dist;

      const mat = new THREE.MeshBasicMaterial({
        color: c,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(triGeom, mat);
      m.position.set(startX, startY, 0.06);
      m.rotation.z = Math.random() * Math.PI * 2;
      m.scale.setScalar(0.5 + Math.random() * 0.4);
      m.layers.set(BLOOM_LAYER);
      m.userData = {
        kind: 'implode',
        startX,
        startY,
        targetX: localX,
        targetY: localY,
        vRot: (Math.random() - 0.5) * 8,
        age: 0,
        lifeMs: 460,
      };
      boardGroup.add(m);
      live.push(m);
    }
  }

  function sparkle(localX, localY, color, count = 24) {
    const base = new THREE.Color(color);
    const white = new THREE.Color('#ffffff');
    for (let i = 0; i < count; i++) {
      const tint = base.clone().lerp(white, 0.35 + Math.random() * 0.55);
      const mat = new THREE.MeshBasicMaterial({
        color: tint,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(sparkGeom, mat);
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.1 + Math.random() * 2.4;
      const baseScale = 0.55 + Math.random() * 1.1;
      m.position.set(localX, localY, 0.06);
      m.rotation.z = Math.random() * Math.PI * 2;
      m.scale.setScalar(baseScale);
      m.layers.set(BLOOM_LAYER);
      m.renderOrder = 7;
      m.userData = {
        kind: 'sparkle',
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vRot: (Math.random() - 0.5) * 5,
        drag: 3.2 + Math.random() * 2.2,
        twinkleSpeed: 14 + Math.random() * 22,
        twinklePhase: Math.random() * Math.PI * 2,
        baseScale,
        age: 0,
        lifeMs: 720 + Math.random() * 420,
      };
      boardGroup.add(m);
      live.push(m);
    }
  }

  // Comet-tail streaks radiating outward. Stretched along velocity so they read
  // as fast-moving trails rather than little triangles.
  function streaks(localX, localY, color, count = 14) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = 2.6 + Math.random() * 2.0;
      const mat = new THREE.MeshBasicMaterial({
        color: c.clone().lerp(new THREE.Color('#ffffff'), 0.25 + Math.random() * 0.35),
        transparent: true,
        opacity: 1,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(triGeom, mat);
      m.position.set(localX, localY, 0.06);
      m.rotation.z = angle - Math.PI / 2;
      m.scale.set(0.5, 3.4 + Math.random() * 2.2, 1);
      m.layers.set(BLOOM_LAYER);
      m.renderOrder = 7;
      m.userData = {
        kind: 'streak',
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        drag: 1.8 + Math.random() * 0.8,
        baseWidth: 0.5,
        age: 0,
        lifeMs: 380 + Math.random() * 200,
      };
      boardGroup.add(m);
      live.push(m);
    }
  }

  // Slow-falling glitter that drifts down after the main pop. Twinkles as it falls.
  function glitter(localX, localY, color, count = 18) {
    const base = new THREE.Color(color);
    const white = new THREE.Color('#ffffff');
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 1.3;
      const mat = new THREE.MeshBasicMaterial({
        color: base.clone().lerp(white, 0.4 + Math.random() * 0.45),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(sparkGeom, mat);
      m.position.set(localX, localY, 0.06);
      m.rotation.z = Math.random() * Math.PI * 2;
      const baseScale = 0.35 + Math.random() * 0.45;
      m.scale.setScalar(baseScale);
      m.layers.set(BLOOM_LAYER);
      m.renderOrder = 7;
      m.userData = {
        kind: 'glitter',
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 0.7,
        vRot: (Math.random() - 0.5) * 4,
        gravity: 1.4 + Math.random() * 0.7,
        delay: 60 + Math.random() * 220,
        twinkleSpeed: 12 + Math.random() * 20,
        twinklePhase: Math.random() * Math.PI * 2,
        baseScale,
        age: 0,
        lifeMs: 1200 + Math.random() * 500,
      };
      boardGroup.add(m);
      live.push(m);
    }
  }

  function hexPulse(localX, localY, color = themeVisuals.pulse) {
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(hexRingGeom, ringMat);
    ring.position.set(localX, localY, 0.04);
    ring.scale.set(0.55, 0.55, 1);
    ring.layers.set(BLOOM_LAYER);
    ring.renderOrder = 6;
    ring.userData = {
      kind: 'hexring',
      age: 0,
      lifeMs: 420,
      fromScale: 0.55,
      toScale: 1.6,
      peakOpacity: 1,
    };
    boardGroup.add(ring);
    live.push(ring);

    sparkle(localX, localY, color, 32);
    // Firework-style second pop after the initial flash settles.
    setTimeout(() => sparkle(localX, localY, color, 18), 140);
  }

  // Legacy name, kept for compatibility with any other callers —
  // now resolves to hexPulse so "pulseRing" is still valid.
  const pulseRing = hexPulse;

  function setTheme(themeId) {
    themeVisuals = getThemeVisuals(themeId);
  }

  function update(deltaMs) {
    const dt = deltaMs * 0.001;
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.userData.age += deltaMs;
      const t = Math.min(p.userData.age / p.userData.lifeMs, 1);
      if (t >= 1) {
        removeLiveParticle(p, i);
        continue;
      }
      switch (p.userData.kind) {
        case 'hexring': {
          const eased = 1 - Math.pow(1 - t, 3);
          const s = p.userData.fromScale + (p.userData.toScale - p.userData.fromScale) * eased;
          p.scale.set(s, s, 1);
          p.material.opacity = (1 - eased) * (p.userData.peakOpacity ?? 0.9);
          break;
        }
        case 'sparkle': {
          const dragMul = Math.exp(-p.userData.drag * dt);
          p.userData.vx *= dragMul;
          p.userData.vy *= dragMul;
          p.position.x += p.userData.vx * dt;
          p.position.y += p.userData.vy * dt;
          p.rotation.z += p.userData.vRot * dt;
          const twinkle =
            0.45 +
            0.55 *
              Math.abs(Math.sin(p.userData.age * 0.001 * p.userData.twinkleSpeed + p.userData.twinklePhase));
          const fade = Math.pow(1 - t, 1.6);
          p.material.opacity = twinkle * fade;
          const s = p.userData.baseScale * (1 - t * 0.35);
          p.scale.setScalar(s);
          break;
        }
        case 'implode': {
          // ease-in (accelerate inward)
          const eased = t * t;
          p.position.x = p.userData.startX + (p.userData.targetX - p.userData.startX) * eased;
          p.position.y = p.userData.startY + (p.userData.targetY - p.userData.startY) * eased;
          p.rotation.z += p.userData.vRot * dt;
          // Sine opacity: grows from 0, peaks near end, vanishes at impact.
          const op = Math.sin(t * Math.PI);
          p.material.opacity = op;
          // Scale down as it converges — classic implosion "sucked in" feel.
          const dieScale = 1 - Math.pow(t, 3);
          const baseScale = 0.5 + 0.4 * op;
          p.scale.setScalar(baseScale * dieScale);
          break;
        }
        case 'streak': {
          const dragMul = Math.exp(-p.userData.drag * dt);
          p.userData.vx *= dragMul;
          p.userData.vy *= dragMul;
          p.position.x += p.userData.vx * dt;
          p.position.y += p.userData.vy * dt;
          const speedNow = Math.hypot(p.userData.vx, p.userData.vy);
          p.scale.set(p.userData.baseWidth, Math.max(0.5, speedNow * 1.4), 1);
          p.material.opacity = Math.pow(1 - t, 1.4);
          break;
        }
        case 'glitter': {
          if (p.userData.age < p.userData.delay) {
            p.material.opacity = 0;
            break;
          }
          p.userData.vy -= p.userData.gravity * dt;
          p.position.x += p.userData.vx * dt;
          p.position.y += p.userData.vy * dt;
          p.rotation.z += p.userData.vRot * dt;
          const visT = (p.userData.age - p.userData.delay) /
            Math.max(1, p.userData.lifeMs - p.userData.delay);
          const tw =
            0.4 +
            0.6 *
              Math.abs(
                Math.sin(p.userData.age * 0.001 * p.userData.twinkleSpeed + p.userData.twinklePhase)
              );
          p.material.opacity = tw * Math.pow(1 - visT, 1.4);
          break;
        }
        case 'shatter':
        default: {
          p.userData.vy -= 2.5 * dt;
          p.position.x += p.userData.vx * dt;
          p.position.y += p.userData.vy * dt;
          p.rotation.z += p.userData.vRot * dt;
          p.material.opacity = 1 - t;
          break;
        }
      }
    }
  }

  return {
    shatter,
    sparkle,
    streaks,
    glitter,
    pulseRing,
    hexPulse,
    implode,
    update,
    setTheme,
  };
}
