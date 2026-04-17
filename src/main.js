import * as THREE from 'three';
import { createScene, mountBoard, unmountBoard } from './render/scene.js';
import { createBoard, createPhantomSlots } from './game/board.js';
import { PHASE_PALETTES } from './utils/colors.js';
import { setupPointer } from './input/pointer.js';
import { spin } from './game/spin.js';
import { refreshOutlineResolution } from './render/triangles.js';
import { createComposer } from './render/postprocess.js';
import { createVertexDots } from './render/vertexDots.js';
import { createParticleSystem } from './render/particles.js';
import { createBackground } from './render/background.js';
import { createHUD } from './ui/hud.js';
import { createOverlay } from './ui/overlay.js';
import {
  gameState,
  resetGameState,
  drainHeat,
  heatGainFromWave,
  addHeat,
  isHeatEmpty,
  HEAT_PHASE_BONUS,
} from './game/state.js';
import { vPos } from './utils/math.js';
import {
  initAudio,
  playSpin,
  playHexClear,
  playImplodeWhoosh,
  playPhaseTransitionSfx,
  playGameOver,
  setMuted,
  isMuted,
} from './audio/sfx.js';

const canvas = document.getElementById('scene');
const hudContainer = document.getElementById('hud');

const { scene, camera, boardGroup } = createScene();
let board = createBoard(PHASE_PALETTES[1]);
let phantomSlots = createPhantomSlots(board, PHASE_PALETTES[1]);
let triangleViews = mountBoard(boardGroup, board);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
camera.layers.enable(1);

const { render: renderFrame, setSize } = createComposer({ renderer, scene, camera });

const vertexDots = createVertexDots({ board, boardGroup });
const particles = createParticleSystem({ boardGroup });
const background = createBackground({ scene });
const hud = createHUD({ container: hudContainer, camera });
const overlay = createOverlay({ container: hudContainer, onPlayAgain: resetRun });

const cameraOrigin = camera.position.clone();
let shakeAmp = 0;
let shakeAge = 0;
let shakeDur = 0;
function shake(amp, durMs) {
  shakeAmp = Math.max(shakeAmp, amp);
  shakeDur = Math.max(shakeDur, durMs);
  shakeAge = 0;
}

const pointer = setupPointer({
  canvas,
  camera,
  board,
  boardGroup,
  onTap: handleTap,
});

function handleTap(k, j) {
  initAudio();
  const [vx, vy] = vPos(k, j);
  particles.pulseRing(vx, vy, '#ffffff');
  playSpin();

  spin({
    k,
    j,
    board,
    phantomSlots,
    boardGroup,
    triangleViews,
    effects: particles,
    hooks: {
      onCascadeWave: ({ cascade, hexes, pointsPerHex }) => {
        for (const h of hexes) {
          gameState.score += pointsPerHex;
          const [hx, hy] = vPos(h.k, h.j);
          hud.spawnFloatingScore(
            hx + boardGroup.position.x,
            hy + boardGroup.position.y,
            pointsPerHex,
            h.color
          );
        }
        addHeat(heatGainFromWave(hexes.length));
        playImplodeWhoosh();
        playHexClear(cascade);
        if (cascade >= 2) shake(0.03 * cascade, 300);
        hud.refresh();
      },
      onPhaseChange: (newPhase) => {
        addHeat(HEAT_PHASE_BONUS);
        hud.refresh();
        overlay.playPhaseTransition(newPhase);
        playPhaseTransitionSfx(newPhase);
      },
    },
  });
}

function resetRun() {
  unmountBoard(boardGroup, triangleViews);
  resetGameState();
  board = createBoard(PHASE_PALETTES[1]);
  phantomSlots = createPhantomSlots(board, PHASE_PALETTES[1]);
  Object.assign(triangleViews, mountBoard(boardGroup, board));
  vertexDots.rebuild(board);
  pointer.rebuildHitCircles(board);
  hud.refresh();
}

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  setSize(w, h);
  refreshOutlineResolution(w, h);
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

let lastFrameMs = performance.now();
let paused = document.hidden;
document.addEventListener('visibilitychange', () => {
  paused = document.hidden;
  if (!paused) lastFrameMs = performance.now();
});

function frame(timeMs) {
  if (paused) {
    requestAnimationFrame(frame);
    return;
  }
  const dt = timeMs - lastFrameMs;
  lastFrameMs = timeMs;
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

  renderFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame((t) => {
  lastFrameMs = t;
  frame(t);
});
