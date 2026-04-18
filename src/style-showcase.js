import * as THREE from 'three';
import { createComposer } from './render/postprocess.js';
import { createBackground } from './render/background.js';
import { refreshOutlineResolution, Triangle } from './render/triangles.js';
import {
  getThemeCssVars,
  getThemeIdForPhase,
  getThemePhasePalettes,
  getThemeVisuals,
} from './utils/colors.js';

const canvas = document.getElementById('style-scene');
const phaseCards = Array.from(document.querySelectorAll('[data-phase-card]'));

const scene = new THREE.Scene();
scene.background = new THREE.Color(getThemeVisuals(getThemeIdForPhase(1)).sceneBg);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, -0.15, 14);
camera.lookAt(0, 0, 0);
camera.layers.enable(1);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);

const { render: renderFrame, setSize } = createComposer({ renderer, scene, camera });
const background = createBackground({ scene });

const showcaseGroup = new THREE.Group();
scene.add(showcaseGroup);

const sampleColumns = [
  { phase: 1, x: -4.95 },
  { phase: 2, x: -1.65 },
  { phase: 3, x: 1.65 },
  { phase: 4, x: 4.95 },
];

const samples = [];
for (const column of sampleColumns) {
  const group = new THREE.Group();
  const up = new Triangle(0, 0, '#ffffff', { phase: column.phase });
  const down = new Triangle(1, 0, '#ffffff', { phase: column.phase });

  group.add(up.group);
  group.add(down.group);
  group.position.set(column.x - 0.72, 0.45, 0);
  group.scale.setScalar(1.65);

  showcaseGroup.add(group);
  samples.push({ group, up, down, phase: column.phase, baseY: group.position.y });
}

const SHOWCASE_WIDTH = 14.2;
const BASE_CAMERA_Z = camera.position.z;

function fitCamera(width, height) {
  const aspect = width / height;
  camera.aspect = aspect;
  const fovRad = (camera.fov * Math.PI) / 180;
  const minZ = SHOWCASE_WIDTH / (2 * aspect * Math.tan(fovRad / 2));
  camera.position.z = Math.max(BASE_CAMERA_Z, minZ);
  camera.updateProjectionMatrix();
}

fitCamera(window.innerWidth, window.innerHeight);
refreshOutlineResolution(window.innerWidth, window.innerHeight);

function applyShowcaseThemes() {
  const pageThemeId = getThemeIdForPhase(1);
  const visuals = getThemeVisuals(pageThemeId);
  scene.background = new THREE.Color(visuals.sceneBg);
  for (const [name, value] of Object.entries(getThemeCssVars(pageThemeId))) {
    document.documentElement.style.setProperty(name, value);
  }
  background.setTheme(pageThemeId);
  for (const sample of samples) {
    const themeId = getThemeIdForPhase(sample.phase);
    const phasePalette = getThemePhasePalettes(themeId)[sample.phase];
    sample.up.setColor(phasePalette[0]);
    sample.down.setColor(phasePalette[phasePalette.length - 1]);
  }
  for (const card of phaseCards) {
    const phase = Number(card.dataset.phaseCard);
    const themeId = getThemeIdForPhase(phase);
    const phasePalette = getThemePhasePalettes(themeId)[phase];
    card.style.setProperty('--phase-accent', phasePalette[1] ?? phasePalette[0]);
    card.style.setProperty('--phase-highlight', phasePalette[phasePalette.length - 1]);
  }
}

applyShowcaseThemes();

window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  setSize(width, height);
  fitCamera(width, height);
  refreshOutlineResolution(width, height);
});

function frame(timeMs) {
  const t = timeMs * 0.001;
  background.update(timeMs);

  for (const sample of samples) {
    sample.group.position.y = sample.baseY + Math.sin(t * 1.3 + sample.phase * 0.55) * 0.08;
    sample.group.rotation.z = Math.sin(t * 0.35 + sample.phase * 0.4) * 0.03;
  }

  renderFrame();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
