import * as THREE from 'three';

const BLOOM_LAYER = 1;

export function createParticleSystem({ boardGroup }) {
  const live = [];

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

  // Tiny bright flash at hex center — replaces the old expanding circle.
  const flashGeom = new THREE.CircleGeometry(0.18, 24);

  function shatter(localX, localY, color, count = 6) {
    // Subtle outward burst — smaller, fewer, shorter-lived than the implosion.
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
      m.scale.setScalar(0.6);
      m.layers.set(BLOOM_LAYER);
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 1.0;
      m.userData = {
        kind: 'shatter',
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + Math.random() * 0.3,
        vRot: (Math.random() - 0.5) * 8,
        age: 0,
        lifeMs: 480,
      };
      boardGroup.add(m);
      live.push(m);
    }
  }

  // Particles rush in from outside the hex toward its center, accelerating.
  // This is the primary "pop" for hex completion.
  function implode(localX, localY, color, count = 28) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 1.35 + Math.random() * 0.5;
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
        vRot: (Math.random() - 0.5) * 6,
        age: 0,
        lifeMs: 420,
      };
      boardGroup.add(m);
      live.push(m);
    }
  }

  function hexPulse(localX, localY, color) {
    // Thin hex-shaped shockwave, tight and quick.
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.9,
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
      lifeMs: 280,
      fromScale: 0.55,
      toScale: 1.05,
    };
    boardGroup.add(ring);
    live.push(ring);

    // Bright pinpoint flash at dead center
    const flashMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffffff'),
      transparent: true,
      opacity: 1,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const flash = new THREE.Mesh(flashGeom, flashMat);
    flash.position.set(localX, localY, 0.05);
    flash.scale.setScalar(0.3);
    flash.layers.set(BLOOM_LAYER);
    flash.renderOrder = 7;
    flash.userData = { kind: 'flash', age: 0, lifeMs: 180 };
    boardGroup.add(flash);
    live.push(flash);
  }

  // Legacy name, kept for compatibility with any other callers —
  // now resolves to hexPulse so "pulseRing" is still valid.
  const pulseRing = hexPulse;

  function update(deltaMs) {
    const dt = deltaMs * 0.001;
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.userData.age += deltaMs;
      const t = Math.min(p.userData.age / p.userData.lifeMs, 1);
      if (t >= 1) {
        boardGroup.remove(p);
        p.material.dispose();
        live.splice(i, 1);
        continue;
      }
      switch (p.userData.kind) {
        case 'hexring': {
          const eased = 1 - Math.pow(1 - t, 3);
          const s = p.userData.fromScale + (p.userData.toScale - p.userData.fromScale) * eased;
          p.scale.set(s, s, 1);
          p.material.opacity = (1 - eased) * 0.9;
          break;
        }
        case 'flash': {
          // Fast pop, short fade
          const s = 0.3 + t * 0.9;
          p.scale.set(s, s, 1);
          p.material.opacity = 1 - Math.pow(t, 2);
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

  return { shatter, pulseRing, hexPulse, implode, update };
}
