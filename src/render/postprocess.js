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

  const finalComposer = new EffectComposer(renderer);
  finalComposer.addPass(renderPass);
  finalComposer.addPass(mixPass);
  finalComposer.addPass(new OutputPass());

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
  }

  return { render, setSize, bloomPass };
}
