import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const BLOOM_LAYER = 1;
// Spec defaults (1.5/0.75/0) read as a wash at this camera distance —
// outline halos overlap and bleed into the fills. Toned down for clarity.
const BLOOM_STRENGTH = 0.48;
const BLOOM_RADIUS = 0.28;
const BLOOM_THRESHOLD = 0.12;

const bloomLayer = new THREE.Layers();
bloomLayer.set(BLOOM_LAYER);

const darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });

// Adapted from Three.js example webgl_postprocessing_unreal_bloom_selective.
// Two composers: one renders only bloom-layer objects (with non-bloom darkened
// to black) into a bloom texture; the other renders the full scene and
// additively composites the bloom texture on top.
export function createComposer({ renderer, scene, camera }) {
  const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
  const isMobile = window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent);
  const bloomPixelRatio = isMobile ? 0.5 : 1;

  const renderPass = new RenderPass(scene, camera);

  const bloomPass = new UnrealBloomPass(size, BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);

  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.setPixelRatio(bloomPixelRatio);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(renderPass);
  bloomComposer.addPass(bloomPass);

  const mixPass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: { value: null },
        bloomTexture: { value: bloomComposer.renderTarget2.texture },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D baseTexture;
        uniform sampler2D bloomTexture;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv);
        }
      `,
      defines: {},
    }),
    'baseTexture'
  );
  mixPass.needsSwap = true;

  const shockUniforms = {
    tDiffuse: { value: null },
    uCenter: { value: new THREE.Vector2(0, 0) },
    uTime: { value: 1 },
    uAmp: { value: 0 },
    uActive: { value: 0 },
    uAspect: { value: size.x / size.y },
  };
  const shockPass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: shockUniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 uCenter;
        uniform float uTime;
        uniform float uAmp;
        uniform float uActive;
        uniform float uAspect;
        varying vec2 vUv;
        void main() {
          vec3 color = texture2D(tDiffuse, vUv).rgb;
          if (uActive > 0.5) {
            vec2 centerUv = uCenter * 0.5 + 0.5;
            vec2 toCenter = vUv - centerUv;
            vec2 corrected = vec2(toCenter.x * uAspect, toCenter.y);
            // Flat-top hex distance — matches the board silhouette so the
            // shockwave reads as a hex pulse, not a circular ripple.
            vec2 a = abs(corrected);
            float dist = max(a.y / 0.86602540378, a.x + a.y * 0.57735026919);
            float radius = uTime * 0.85;
            float thickness = 0.07;
            float ring = smoothstep(thickness, 0.0, abs(dist - radius));
            float falloff = pow(1.0 - uTime, 1.5);
            float displacement = ring * uAmp * falloff;
            vec2 dir = toCenter / max(length(toCenter), 1e-5);
            vec2 distortedUv = vUv - dir * displacement;
            vec3 base = texture2D(tDiffuse, distortedUv).rgb;
            vec3 cR = texture2D(tDiffuse, distortedUv + dir * displacement * 0.45).rgb;
            vec3 cB = texture2D(tDiffuse, distortedUv - dir * displacement * 0.45).rgb;
            vec3 chroma = vec3(cR.r, base.g, cB.b);
            color = mix(base, chroma, ring);
            color += vec3(0.55, 0.75, 1.0) * ring * falloff * 0.45;
          }
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    }),
    'tDiffuse'
  );

  const finalComposer = new EffectComposer(renderer);
  finalComposer.addPass(renderPass);
  finalComposer.addPass(mixPass);
  finalComposer.addPass(shockPass);
  finalComposer.addPass(new OutputPass());

  const baseStrength = BLOOM_STRENGTH;
  let kickAmp = 0;
  let kickAge = 0;
  let kickDur = 0;
  let shockAge = 0;
  let shockDur = 0;
  let lastRenderMs = null;

  function kickBloom(amount, durMs = 350) {
    if (amount > kickAmp * Math.max(0, 1 - kickAge / Math.max(kickDur, 1))) {
      kickAmp = amount;
      kickDur = durMs;
      kickAge = 0;
    }
  }

  function triggerShockwave({ ndc, durMs = 480, amp = 0.014 }) {
    shockUniforms.uCenter.value.copy(ndc);
    shockUniforms.uAmp.value = amp;
    shockDur = durMs;
    shockAge = 0;
  }

  function tickEffects(dt) {
    if (kickDur > 0) {
      kickAge += dt;
      const t = Math.min(kickAge / kickDur, 1);
      const decay = Math.pow(1 - t, 2);
      bloomPass.strength = baseStrength + kickAmp * decay;
      if (t >= 1) {
        kickAmp = 0;
        kickDur = 0;
        bloomPass.strength = baseStrength;
      }
    } else {
      bloomPass.strength = baseStrength;
    }
    if (shockDur > 0) {
      shockAge += dt;
      const t = Math.min(shockAge / shockDur, 1);
      shockUniforms.uTime.value = t;
      shockUniforms.uActive.value = 1;
      if (t >= 1) {
        shockDur = 0;
        shockUniforms.uActive.value = 0;
      }
    } else {
      shockUniforms.uActive.value = 0;
    }
  }

  const stashed = new Map();
  function darkenNonBloomed(obj) {
    if (!obj.material) return;
    if (bloomLayer.test(obj.layers)) return; // bloom-layer object: keep visible
    stashed.set(obj.uuid, obj.material);
    obj.material = darkMaterial;
  }
  function restoreMaterial(obj) {
    const m = stashed.get(obj.uuid);
    if (m) {
      obj.material = m;
      stashed.delete(obj.uuid);
    }
  }

  function render() {
    const now = performance.now();
    const dt = lastRenderMs == null ? 16 : Math.min(now - lastRenderMs, 100);
    lastRenderMs = now;
    tickEffects(dt);
    // Pass 1: bloom only — darken non-bloom objects, render, extract bloom.
    scene.traverse(darkenNonBloomed);
    bloomComposer.render();
    scene.traverse(restoreMaterial);
    // Pass 2: render scene normally + composite bloom additively.
    finalComposer.render();
  }

  function setSize(width, height) {
    bloomComposer.setSize(width, height);
    finalComposer.setSize(width, height);
    bloomPass.setSize(width, height);
    shockUniforms.uAspect.value = width / height;
  }

  return { render, setSize, bloomPass, kickBloom, triggerShockwave };
}
