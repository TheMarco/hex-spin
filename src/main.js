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
import { createHexHighlight } from './render/hexHighlight.js';
import { createHUD } from './ui/hud.js';
import { createOverlay } from './ui/overlay.js';
import { createHowToPlay } from './ui/howToPlay.js';
import { createAbout } from './ui/about.js';
import { createDemo } from './ui/demo.js';
import { createInstallPrompt } from './ui/installPrompt.js';
import {
  gameState,
  resetGameState,
  setInitialPhase,
  drainHeat,
  heatGainFromWave,
  addHeat,
  isHeatEmpty,
  HEAT_PHASE_BONUS,
  COLOR_ELIM_BONUS_BASE,
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
  playColorEliminated,
  playGameOver,
  setMusicTheme,
  setMuted,
  isMuted,
} from './audio/sfx.js';
import logoUrl from './images/logo.jpg';
import {
  isEmbedded,
  rcadiaInit,
  rcadiaConsumeLife,
  rcadiaSubmitScore,
} from './rcadia.js';

rcadiaInit({ gameTitle: 'Rotatron' });

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

// Effective viewport height. The Play.fun build sets
// window.__rotatronTopInsetPx so the canvas is shifted down by that amount
// via CSS; the renderer + camera need to use the reduced height to avoid
// stretching the scene. Zero on the standalone build.
function effectiveHeight() {
  return window.innerHeight - (Number(window.__rotatronTopInsetPx) || 0);
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, effectiveHeight(), false);
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
fitCamera(window.innerWidth, effectiveHeight());

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

let shiftHeld = false;
let reverseBtnHeld = false;
function isReverseActive() {
  return shiftHeld || reverseBtnHeld;
}

const pointer = setupPointer({
  canvas,
  camera,
  board,
  boardGroup,
  onTap: handleTap,
  getDirection: () => (isReverseActive() ? 'ccw' : 'cw'),
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
  onCascadeWave: ({ cascade, hexes, pointsPerHex, multiKillBonus, freshMult }) => {
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
    if (multiKillBonus > 0) {
      const rounded = Math.round(multiKillBonus);
      gameState.score += rounded;
      hud.spawnMultiKillBanner(hexes.length, rounded, hexes[0]?.color);
    }
    addHeat(heatGainFromWave(hexes.length));
    playImplodeWhoosh();
    // Per-hex clear sounds fire from onHexBeat, staggered by HEX_BEAT_MS.
    // Suppress the fresh-hit/cascade sting during the demo so each step reads
    // as one clean effect (hex, dual hex, elimination) with nothing else.
    if (!gameState.demoActive) {
      playExtraBonus({ cascade, freshMult });
    }

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
  onColorEliminated: ({ colors, phase, freshMult = 1 }) => {
    const bonus = Math.round(COLOR_ELIM_BONUS_BASE * freshMult * Math.pow(2, phase - 1));
    colors.forEach((color, i) => {
      gameState.score += bonus;
      gameState.colorEliminations++;
      hud.spawnElimBanner(color, bonus);
      playColorEliminated({ extra: i });
    });
    kickBloom(0.6, 360);
    shake(0.018, 260);
    fovPunch(1.4, 280);
    hud.refresh();
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

async function handleTap(k, j, direction = 'cw') {
  if (isPaused()) return;
  if (gameState.demoActive) return;
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
    direction,
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

const demoRuntime = {
  hud,
  applyThemePresentation,
  rebuildWithPreset(presetBoard) {
    cancelGrace();
    unmountBoard(boardGroup, triangleViews);
    board = presetBoard;
    phantomSlots = createPhantomSlots(board, gameState.activeColors);
    Object.assign(triangleViews, mountBoard(boardGroup, board, { phase: gameState.phase }));
    vertexDots.rebuild(board);
    pointer.rebuildHitCircles(board);
  },
  async spinAt(k, j, pickColor, direction = 'cw') {
    return spin({
      k,
      j,
      board,
      phantomSlots,
      boardGroup,
      triangleViews,
      effects: particles,
      hooks: gameHooks,
      pickColor,
      direction,
    });
  },
  flashReverseBtn(on) {
    flashReverseBtn(on);
  },
  pressReverseBtn(on) {
    pressReverseBtn(on);
  },
  flashCells(cellKeys, durationMs) {
    for (const ck of cellKeys) triangleViews[ck]?.flash?.(durationMs);
  },
  highlightHex(k, j, color) {
    return createHexHighlight({ boardGroup, k, j, color });
  },
  flashHeatWarning() {
    // Actually drop gameState.heat so the RAF-driven hud.updateHeat call
    // doesn't immediately overwrite the display. demoActive blocks drain.
    gameState.heat = 0.15;
    hud.updateHeat(gameState.heat);
  },
};

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = effectiveHeight();
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

const MUTE_ICON_ON = `
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 18V6l10-3v12"/>
    <circle cx="6" cy="18" r="3"/>
    <circle cx="16" cy="15" r="3"/>
  </svg>
`;
const MUTE_ICON_OFF = `
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 18V6l10-3v12"/>
    <circle cx="6" cy="18" r="3"/>
    <circle cx="16" cy="15" r="3"/>
    <line x1="3" y1="21" x2="21" y2="3"/>
  </svg>
`;
function renderMute() {
  muteBtn.innerHTML = isMuted() ? MUTE_ICON_OFF : MUTE_ICON_ON;
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

const PAUSE_ICON = `
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="6" y="4" width="4" height="16"/>
    <rect x="14" y="4" width="4" height="16"/>
  </svg>
`;
const PLAY_ICON = `
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polygon points="6 4 20 12 6 20 6 4"/>
  </svg>
`;
function renderPauseBtn() {
  pauseBtn.innerHTML = userPaused ? PLAY_ICON : PAUSE_ICON;
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

// Reverse-direction modifier. Touch-only: hold the on-screen DIRECTION button
// to spin counter-clockwise on the next tap. Desktop users get the same effect
// via Shift-click (see key listeners below) and don't need a button. Icon
// floats above the frame and swaps CW→CCW while held.
const isTouchDevice =
  matchMedia('(hover: none) and (pointer: coarse)').matches || 'ontouchstart' in window;

let reverseBtn = null;
let setReverseBtnHeld = () => {};
let flashReverseBtn = () => {};
let pressReverseBtn = () => {};
if (isTouchDevice) {
  reverseBtn = document.createElement('button');
  reverseBtn.className = 'reverse-btn';
  reverseBtn.setAttribute('aria-label', 'Hold to reverse spin direction');
  reverseBtn.innerHTML = `
    <svg class="reverse-icon reverse-icon-cw" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="21 5 21 11 15 11"/>
      <path d="M19 15a8 8 0 1 1 -2 -8.4L21 11"/>
    </svg>
    <svg class="reverse-icon reverse-icon-ccw" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="3 5 3 11 9 11"/>
      <path d="M5 15a8 8 0 1 0 2 -8.4L3 11"/>
    </svg>
    <span class="reverse-btn-label">DIRECTION</span>
  `;

  const renderReverseBtn = () => {
    reverseBtn.classList.toggle('held', reverseBtnHeld);
  };
  setReverseBtnHeld = (next) => {
    if (reverseBtnHeld === next) return;
    reverseBtnHeld = next;
    renderReverseBtn();
    pointer.refreshCursor();
  };
  flashReverseBtn = (on) => {
    reverseBtn.classList.toggle('demo-pulse', Boolean(on));
  };
  // Demo-only: simulate the pressed appearance (solid fill + CCW icon swap)
  // without actually applying the reverse modifier. `reverseBtnHeld` stays
  // false since real input is gated behind gameState.demoActive anyway.
  pressReverseBtn = (on) => {
    reverseBtn.classList.toggle('held', Boolean(on));
  };

  reverseBtn.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    reverseBtn.setPointerCapture?.(ev.pointerId);
    setReverseBtnHeld(true);
  });
  const releaseReverse = (ev) => {
    reverseBtn.releasePointerCapture?.(ev.pointerId);
    setReverseBtnHeld(false);
  };
  reverseBtn.addEventListener('pointerup', releaseReverse);
  reverseBtn.addEventListener('pointercancel', releaseReverse);
  reverseBtn.addEventListener('contextmenu', (ev) => ev.preventDefault());
  hudContainer.appendChild(reverseBtn);
  renderReverseBtn();
}

window.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Shift' || shiftHeld) return;
  shiftHeld = true;
  pointer.refreshCursor();
});
window.addEventListener('keyup', (ev) => {
  if (ev.key !== 'Shift') return;
  shiftHeld = false;
  pointer.refreshCursor();
});
window.addEventListener('blur', () => {
  if (!shiftHeld) return;
  shiftHeld = false;
  pointer.refreshCursor();
});

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
        <button class="title-btn" data-action="demo">DEMO</button>
        <button class="title-btn" data-action="howto">HOW TO PLAY</button>
        <button class="title-btn" data-action="about">ABOUT</button>
      </div>
    </div>
    <div class="title-footer">Copyright 2026 \u00A9 AI &amp; Design Game Studios</div>
  `;
  hudContainer.appendChild(el);

  const installPrompt = createInstallPrompt({ container: hudContainer });

  // Attract-mode: after 10s of idle on the title, auto-launch the demo.
  const IDLE_MS = 10000;
  let idleTimerId = null;
  let idleActive = false;
  const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];
  function armIdle() {
    disarmIdle();
    idleActive = true;
    idleTimerId = setTimeout(() => {
      idleTimerId = null;
      launchDemo();
    }, IDLE_MS);
  }
  function disarmIdle() {
    if (idleTimerId != null) clearTimeout(idleTimerId);
    idleTimerId = null;
    idleActive = false;
  }
  const onActivity = () => {
    if (idleActive) {
      if (idleTimerId != null) clearTimeout(idleTimerId);
      idleTimerId = setTimeout(() => {
        idleTimerId = null;
        launchDemo();
      }, IDLE_MS);
    }
  };
  for (const ev of activityEvents) window.addEventListener(ev, onActivity, { passive: true });

  const startGame = () => {
    disarmIdle();
    for (const ev of activityEvents) window.removeEventListener(ev, onActivity);
    el.classList.add('dismissed');
    setTimeout(() => el.remove(), 400);
    gameState.status = 'idle';
    installPrompt?.dismiss();
    initAudio();
  };

  function launchDemo() {
    disarmIdle();
    el.classList.add('behind-demo');
    initAudio();
    createDemo({
      container: hudContainer,
      runtime: demoRuntime,
      onEnd: () => {
        el.classList.remove('behind-demo');
        resetRun();
        gameState.status = 'title';
        armIdle();
      },
    });
  }

  el.querySelector('[data-action="start"]').addEventListener('click', startGame);
  el.querySelector('[data-action="demo"]').addEventListener('click', launchDemo);
  el.querySelector('[data-action="howto"]').addEventListener('click', () => {
    disarmIdle();
    el.classList.add('behind-howto');
    createHowToPlay({
      container: hudContainer,
      onBack: () => {
        el.classList.remove('behind-howto');
        armIdle();
      },
      onStart: startGame,
    });
  });
  el.querySelector('[data-action="about"]').addEventListener('click', () => {
    disarmIdle();
    el.classList.add('behind-howto');
    createAbout({
      container: hudContainer,
      onBack: () => {
        el.classList.remove('behind-howto');
        armIdle();
      },
    });
  });

  armIdle();
}
showTitleScreen();

if ('serviceWorker' in navigator && import.meta.env.PROD && !isEmbedded()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
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
    rcadiaConsumeLife();
    rcadiaSubmitScore(gameState.score);
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
