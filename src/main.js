import * as THREE from 'three';
import { createScene, mountBoard, unmountBoard } from './render/scene.js';
import { createBoard, createPhantomSlots, reseedPhantomSlots } from './game/board.js';
import {
  NEW_COLOR_BONUS_MULT,
  getThemeCssVars,
  getThemeIdForPhase,
  getThemeNewColor,
  getThemeVisuals,
} from './utils/colors.js';
import { setupPointer } from './input/pointer.js';
import { spin } from './game/spin.js';
import { findCompletedHexes, resolveCompletions } from './game/rules.js';
import { refreshOutlineResolution } from './render/triangles.js';
import { createComposer } from './render/postprocess.js';
import { createVertexDots } from './render/vertexDots.js';
import { createParticleSystem } from './render/particles.js';
import { createBackground } from './render/background.js';
import { createSeamCurrent } from './render/seam-current.js';
import { createHUD } from './ui/hud.js';
import { createOverlay } from './ui/overlay.js';
import { createHowToPlay } from './ui/howToPlay.js';
import { createAbout } from './ui/about.js';
import {
  gameState,
  resetGameState,
  setInitialPhase,
  drainHeat,
  heatGainFromWave,
  addHeat,
  isHeatEmpty,
  HEAT_PHASE_BONUS,
  withBusy,
} from './game/state.js';
import { vPos } from './utils/math.js';
import {
  initAudio,
  playSpin,
  playHexClear,
  playImplodeWhoosh,
  playPhaseTransitionSfx,
  playExtraBonus,
  playGameOver,
  setMusicTheme,
  setMuted,
  isMuted,
} from './audio/sfx.js';
import logoUrl from './images/logo.jpg';

const canvas = document.getElementById('scene');
const hudContainer = document.getElementById('hud');

function readPhaseFromURL() {
  const raw = new URLSearchParams(window.location.search).get('phase');
  if (raw == null) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(4, n));
}

const initialPhase = readPhaseFromURL();
if (initialPhase != null) setInitialPhase(initialPhase);

const { scene, camera, boardGroup } = createScene();
let board = createBoard(gameState.activeColors);
let phantomSlots = createPhantomSlots(board, gameState.activeColors);
let triangleViews = mountBoard(boardGroup, board, { phase: gameState.phase });

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
camera.layers.enable(1);

const BOARD_WIDTH = 6; // flat-top hex, 2 * HEX_SIDE
const BOARD_FIT_MARGIN = 1.08; // 8% breathing room
const BASE_CAMERA_Z = camera.position.z;
const BASE_CAMERA_Y = camera.position.y;
// HUD footprint (heat rail + panels) in CSS pixels. Used to recenter the
// playfield in the available space below the HUD by panning the camera.
const HUD_BOTTOM_PX = 140;
const HUD_BOTTOM_PX_MOBILE = 118;
function fitCamera(w, h) {
  const aspect = w / h;
  camera.aspect = aspect;
  const fovRad = (camera.fov * Math.PI) / 180;
  const tanHalf = Math.tan(fovRad / 2);
  const minZ = (BOARD_WIDTH * BOARD_FIT_MARGIN) / (2 * aspect * tanHalf);
  camera.position.z = Math.max(BASE_CAMERA_Z, minZ);

  const hudPx = w < 720 ? HUD_BOTTOM_PX_MOBILE : HUD_BOTTOM_PX;
  const pan = (hudPx / h) * camera.position.z * tanHalf;
  camera.position.y = BASE_CAMERA_Y + pan;
  camera.lookAt(0, pan, 0);
  camera.updateProjectionMatrix();
}
fitCamera(window.innerWidth, window.innerHeight);

const {
  render: renderFrame,
  setSize,
  kickBloom,
} = createComposer({ renderer, scene, camera });

const vertexDots = createVertexDots({ board, boardGroup });
const particles = createParticleSystem({ boardGroup });
const background = createBackground({ scene });
const seamCurrent = createSeamCurrent({ board, boardGroup, phase: gameState.phase });
const hud = createHUD({ container: hudContainer, camera });
const overlay = createOverlay({ container: hudContainer, onPlayAgain: resetRun });

function applyThemePresentation(phase) {
  const themeId = getThemeIdForPhase(phase);
  const visuals = getThemeVisuals(themeId);
  scene.background = new THREE.Color(visuals.sceneBg);
  for (const [name, value] of Object.entries(getThemeCssVars(themeId))) {
    document.documentElement.style.setProperty(name, value);
  }
  setMusicTheme(themeId);
  background.setTheme(themeId);
  particles.setTheme(themeId);
  vertexDots.setTheme(themeId);
  seamCurrent.setPhase(phase);
  hud.refresh();
}

function applyTrianglePhaseStyle(phase) {
  for (const view of Object.values(triangleViews)) {
    view.setPhaseStyle?.(phase);
  }
}

const cameraOrigin = camera.position.clone();
const BASE_FOV = camera.fov;
let shakeAmp = 0;
let shakeAge = 0;
let shakeDur = 0;
function shake(amp, durMs) {
  shakeAmp = Math.max(shakeAmp, amp);
  shakeDur = Math.max(shakeDur, durMs);
  shakeAge = 0;
}

let fovKickAmp = 0;
let fovKickAge = 0;
let fovKickDur = 0;
function fovPunch(amount, durMs) {
  fovKickAmp = Math.max(fovKickAmp, amount);
  fovKickDur = Math.max(fovKickDur, durMs);
  fovKickAge = 0;
}

const pointer = setupPointer({
  canvas,
  camera,
  board,
  boardGroup,
  onTap: handleTap,
});

async function refreshBoardForPhase(newPhase) {
  applyTrianglePhaseStyle(newPhase);
  phantomSlots = reseedPhantomSlots(phantomSlots, gameState.activeColors);
  await Promise.all(Object.values(triangleViews).map((v) => v.flash?.(240)));
}

// Short grace window after a spin completes ≥1 hex: another tap within this
// window folds its rotation into the same pending cascade so two hits can
// chain into a multi-hex clear. Kept short enough that single clears feel
// snappy — the wait is barely perceptible.
const GRACE_WINDOW_MS = 250;
let graceTimerId = null;

function cancelGrace() {
  if (graceTimerId != null) {
    clearTimeout(graceTimerId);
    graceTimerId = null;
  }
}

const gameHooks = {
  onSpinStart: () => {
    playSpin();
  },
  onCascadeWave: ({ cascade, hexes, pointsPerHex, freshMult }) => {
    const newColor = getThemeNewColor(getThemeIdForPhase(gameState.phase))[gameState.phase];
    let waveHasBonus = false;
    for (const h of hexes) {
      const bonus = Boolean(newColor && h.color === newColor);
      if (bonus) waveHasBonus = true;
      const points = bonus ? pointsPerHex * NEW_COLOR_BONUS_MULT : pointsPerHex;
      gameState.score += points;
      const [hx, hy] = vPos(h.k, h.j);
      hud.spawnFloatingScore(
        hx + boardGroup.position.x,
        hy + boardGroup.position.y,
        points,
        h.color,
        bonus
      );
    }
    addHeat(heatGainFromWave(hexes.length));
    playImplodeWhoosh();
    // Per-hex clear sounds fire from onHexBeat, staggered by HEX_BEAT_MS.
    playExtraBonus({ cascade, freshMult });

    const cascadeBoost = Math.min(cascade - 1, 4);
    kickBloom(0.4 + 0.2 * cascadeBoost + (waveHasBonus ? 0.15 : 0), 280);
    shake(0.008 + 0.012 * cascade, 200 + 30 * cascade);
    if (cascade >= 2) fovPunch(0.9 + 0.4 * cascadeBoost, 220);
    hud.refresh();
  },
  // Per-hex pop sound, fired by rules.js once per hex with HEX_BEAT_MS gaps.
  // Pitch climbs via cascade + index so combos sound like they're laddering up.
  onHexBeat: ({ hex, index, cascade }) => {
    const newColor = getThemeNewColor(getThemeIdForPhase(gameState.phase))[gameState.phase];
    const bonus = Boolean(newColor && hex.color === newColor);
    playHexClear(cascade + index, { bonus });
  },
  onPhaseChange: async (newPhase) => {
    applyThemePresentation(newPhase);
    addHeat(HEAT_PHASE_BONUS);
    hud.refresh();
    overlay.playPhaseTransition(newPhase);
    playPhaseTransitionSfx(newPhase);
    await refreshBoardForPhase(newPhase);
  },
};

async function detonateArmed() {
  cancelGrace();
  await withBusy(async () => {
    await resolveCompletions({
      board,
      triangleViews,
      activeColors: gameState.activeColors,
      effects: particles,
      hooks: gameHooks,
      onCascadeWave: (info) => {
        gameState.currentCascade = info.cascade;
        gameState.longestCascade = Math.max(gameState.longestCascade, info.cascade);
        gameState.hexCount += info.hexes.length;
        gameHooks.onCascadeWave(info);
      },
      onHexBeat: gameHooks.onHexBeat,
    });
    gameState.currentCascade = 0;
  });
}

async function handleTap(k, j) {
  if (isPaused()) return;
  initAudio();

  cancelGrace();

  const ok = await spin({
    k,
    j,
    board,
    phantomSlots,
    boardGroup,
    triangleViews,
    effects: particles,
    hooks: gameHooks,
    deferResolve: true,
  });
  if (!ok) return;
  if (gameState.status !== 'idle') return;

  const armed = findCompletedHexes(board);
  if (armed.length === 0) return;

  graceTimerId = setTimeout(() => {
    graceTimerId = null;
    detonateArmed();
  }, GRACE_WINDOW_MS);
}

function resetRun() {
  cancelGrace();
  unmountBoard(boardGroup, triangleViews);
  resetGameState();
  if (initialPhase != null) setInitialPhase(initialPhase);
  board = createBoard(gameState.activeColors);
  phantomSlots = createPhantomSlots(board, gameState.activeColors);
  Object.assign(triangleViews, mountBoard(boardGroup, board, { phase: gameState.phase }));
  vertexDots.rebuild(board);
  pointer.rebuildHitCircles(board);
  applyThemePresentation(gameState.phase);
  hud.refresh();
}

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  fitCamera(w, h);
  cameraOrigin.copy(camera.position);
  renderer.setSize(w, h, false);
  setSize(w, h);
  refreshOutlineResolution(w, h);
});

let lastFrameMs = performance.now();
let visibilityPaused = document.hidden;
let userPaused = false;
function isPaused() {
  return visibilityPaused || userPaused;
}
document.addEventListener('visibilitychange', () => {
  const wasPaused = isPaused();
  visibilityPaused = document.hidden;
  if (wasPaused && !isPaused()) lastFrameMs = performance.now();
});

// Mute button
const muteBtn = document.createElement('button');
muteBtn.className = 'mute-btn';
muteBtn.setAttribute('aria-label', 'Toggle sound');

function renderMute() {
  muteBtn.textContent = isMuted() ? '♪  OFF' : '♪  ON';
  muteBtn.classList.toggle('muted', isMuted());
}

muteBtn.addEventListener('click', () => {
  initAudio();
  setMuted(!isMuted());
  renderMute();
});
hudContainer.appendChild(muteBtn);
renderMute();

// Pause button + overlay
const pauseBtn = document.createElement('button');
pauseBtn.className = 'pause-btn';
pauseBtn.setAttribute('aria-label', 'Pause');

const pauseOverlay = document.createElement('div');
pauseOverlay.className = 'pause-overlay';
pauseOverlay.innerHTML = `
  <div class="pause-card">
    <div class="pause-title">PAUSED</div>
    <div class="pause-hint">Press P or click to resume</div>
  </div>
`;

function renderPauseBtn() {
  pauseBtn.textContent = userPaused ? '▶  RESUME' : '❚❚ PAUSE';
  pauseBtn.classList.toggle('paused', userPaused);
}

function showPauseOverlay() {
  if (!pauseOverlay.isConnected) hudContainer.appendChild(pauseOverlay);
}
function hidePauseOverlay() {
  if (pauseOverlay.isConnected) pauseOverlay.remove();
}

function togglePause() {
  if (gameState.status !== 'idle' && gameState.status !== 'paused') return;
  const wasPaused = isPaused();
  userPaused = !userPaused;
  if (userPaused) {
    gameState.status = 'paused';
    showPauseOverlay();
  } else {
    gameState.status = 'idle';
    hidePauseOverlay();
  }
  if (wasPaused && !isPaused()) lastFrameMs = performance.now();
  renderPauseBtn();
}

pauseBtn.addEventListener('click', togglePause);
pauseOverlay.addEventListener('pointerdown', togglePause);
hudContainer.appendChild(pauseBtn);
renderPauseBtn();

window.addEventListener('keydown', (ev) => {
  if (ev.key !== 'p' && ev.key !== 'P') return;
  if (ev.repeat) return;
  const target = ev.target;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
  togglePause();
});

applyThemePresentation(gameState.phase);

function showTitleScreen() {
  gameState.status = 'title';
  const el = document.createElement('div');
  el.className = 'title-screen';
  el.innerHTML = `
    <div class="title-inner">
      <img class="title-logo" src="${logoUrl}" alt="Rotatron" />
      <div class="title-buttons">
        <button class="title-btn title-btn-primary" data-action="start">START</button>
        <button class="title-btn" data-action="howto">HOW TO PLAY</button>
        <button class="title-btn" data-action="about">ABOUT</button>
      </div>
    </div>
    <div class="title-footer">Copyright 2026 \u00A9 AI &amp; Design Game Studios</div>
  `;
  hudContainer.appendChild(el);

  const startGame = () => {
    el.classList.add('dismissed');
    setTimeout(() => el.remove(), 400);
    gameState.status = 'idle';
    initAudio();
  };

  el.querySelector('[data-action="start"]').addEventListener('click', startGame);
  el.querySelector('[data-action="howto"]').addEventListener('click', () => {
    el.classList.add('behind-howto');
    createHowToPlay({
      container: hudContainer,
      onBack: () => el.classList.remove('behind-howto'),
      onStart: startGame,
    });
  });
  el.querySelector('[data-action="about"]').addEventListener('click', () => {
    el.classList.add('behind-howto');
    createAbout({
      container: hudContainer,
      onBack: () => el.classList.remove('behind-howto'),
    });
  });
}
showTitleScreen();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

function frame(timeMs) {
  if (isPaused()) {
    requestAnimationFrame(frame);
    return;
  }
  const dt = timeMs - lastFrameMs;
  lastFrameMs = timeMs;
  seamCurrent.update(timeMs);
  vertexDots.update(timeMs);
  particles.update(dt);
  background.update(timeMs);

  drainHeat(dt * 0.001);
  hud.updateHeat(gameState.heat);

  if (isHeatEmpty() && gameState.status === 'idle') {
    gameState.status = 'game_over';
    playGameOver();
    setTimeout(() => overlay.showGameOver(), 400);
  }

  if (shakeDur > 0) {
    shakeAge += dt;
    const t = Math.min(shakeAge / shakeDur, 1);
    const decay = 1 - t * t;
    const amp = shakeAmp * decay;
    if (t >= 1) {
      camera.position.copy(cameraOrigin);
      shakeDur = 0;
      shakeAmp = 0;
    } else {
      camera.position.set(
        cameraOrigin.x + (Math.random() - 0.5) * 2 * amp,
        cameraOrigin.y + (Math.random() - 0.5) * 2 * amp,
        cameraOrigin.z
      );
    }
  }

  if (fovKickDur > 0) {
    fovKickAge += dt;
    const t = Math.min(fovKickAge / fovKickDur, 1);
    const eased = Math.pow(1 - t, 2);
    camera.fov = BASE_FOV - fovKickAmp * eased;
    camera.updateProjectionMatrix();
    if (t >= 1) {
      camera.fov = BASE_FOV;
      camera.updateProjectionMatrix();
      fovKickDur = 0;
      fovKickAmp = 0;
    }
  }

  renderFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame((t) => {
  lastFrameMs = t;
  frame(t);
});
