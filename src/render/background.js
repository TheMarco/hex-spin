import * as THREE from 'three';
import { NEON, BG } from '../utils/colors.js';

const BLOOM_LAYER = 1;

// Tron-floor grid receding into the distance. Spec §6.7, §14.6.
export function createBackground({ scene }) {
  scene.fog = new THREE.FogExp2(new THREE.Color(BG).getHex(), 0.02);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(NEON.cyan) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      void main() {
        vec2 scrolled = vUv + vec2(0.0, uTime * 0.012);
        vec2 grid = abs(fract(scrolled * 40.0 - 0.5) - 0.5) / fwidth(scrolled * 40.0);
        float line = 1.0 - min(min(grid.x, grid.y), 1.0);
        // Fade with distance from origin in xz-plane.
        float dist = length(vWorldPos.xz);
        float fade = smoothstep(80.0, 6.0, dist);
        gl_FragColor = vec4(uColor * line * fade, line * fade * 0.85);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  const plane = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), material);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -4;
  plane.layers.set(BLOOM_LAYER); // subtle glow per spec §6.7
  scene.add(plane);

  function update(timeMs) {
    material.uniforms.uTime.value = timeMs * 0.001;
  }

  return { update, plane, material };
}
