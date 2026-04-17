import * as THREE from 'three';
import { NEON } from '../utils/colors.js';
import { gameState } from '../game/state.js';

const PALETTE_ORDER = [
  NEON.magenta,
  NEON.cyan,
  NEON.yellow,
  NEON.orange,
  NEON.green,
  NEON.blue,
];

export function createHUD({ container, camera }) {
  container.innerHTML = `
    <div class="heat-rail" data-heat-rail>
      <div class="heat-label">HEAT</div>
      <div class="heat-track">
        <div class="heat-fill" data-heat-fill></div>
      </div>
      <div class="heat-percent" data-heat-percent>100%</div>
    </div>
    <div class="danger-vignette" data-vignette></div>
    <div class="hud-top-left">
      <div class="phase-label">PHASE <span data-phase>1</span></div>
      <div class="palette-strip">
        ${PALETTE_ORDER.map(
          (c, i) => `<span class="dot" data-slot="${i}" style="--c:${c}"></span>`
        ).join('')}
      </div>
    </div>
    <div class="hud-top-center">
      <div class="score" data-score>0</div>
    </div>
    <div class="hud-top-right">
      <div class="hex-count"><span data-hex>0</span> hexes</div>
      <div class="cascade-mult" data-cascade></div>
      <div class="longest-cascade">Longest: <span data-longest>0</span></div>
    </div>
    <div class="float-layer" data-floats></div>
  `;

  const $ = (sel) => container.querySelector(sel);
  const phaseEl = $('[data-phase]');
  const scoreEl = $('[data-score]');
  const hexEl = $('[data-hex]');
  const cascadeEl = $('[data-cascade]');
  const longestEl = $('[data-longest]');
  const dotEls = container.querySelectorAll('.dot');
  const floatLayer = $('[data-floats]');
  const heatFill = $('[data-heat-fill]');
  const heatRail = $('[data-heat-rail]');
  const heatPercent = $('[data-heat-percent]');
  const vignette = $('[data-vignette]');

  function refresh() {
    phaseEl.textContent = String(gameState.phase);
    scoreEl.textContent = gameState.score.toLocaleString();
    hexEl.textContent = String(gameState.hexCount);
    longestEl.textContent = String(gameState.longestCascade);
    cascadeEl.textContent = gameState.currentCascade > 1 ? `×${gameState.currentCascade}` : '';
    dotEls.forEach((el, i) => {
      el.classList.toggle('active', i < gameState.activeColors.length);
    });
  }

  const tmpVec = new THREE.Vector3();
  function spawnFloatingScore(localX, localY, points, color, bonus = false) {
    tmpVec.set(localX, localY, 0);
    // Local board coords → world coords (board is at scene root with offset; but
    // we'll project assuming the board is mostly near origin — close enough for HUD).
    tmpVec.project(camera);
    const x = ((tmpVec.x + 1) / 2) * window.innerWidth;
    const y = ((1 - tmpVec.y) / 2) * window.innerHeight;
    const el = document.createElement('div');
    el.className = bonus ? 'float-score bonus' : 'float-score';
    el.style.color = color;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.textContent = bonus ? `+${points.toLocaleString()} ×2` : `+${points.toLocaleString()}`;
    floatLayer.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  function updateHeat(heat) {
    const clamped = Math.max(0, Math.min(1, heat));
    heatFill.style.width = `${clamped * 100}%`;
    heatPercent.textContent = `${Math.round(clamped * 100)}%`;
    let color;
    if (heat > 0.5) color = NEON.cyan;
    else if (heat > 0.3) color = NEON.yellow;
    else color = NEON.magenta;
    heatFill.style.background = color;
    heatFill.style.boxShadow = `0 0 8px ${color}, 0 0 20px ${color}`;
    heatPercent.style.color = color;
    heatPercent.style.textShadow = `0 0 6px ${color}`;
    heatRail.classList.toggle('danger', heat < 0.3);
    vignette.classList.toggle('active', heat < 0.3);
  }

  refresh();
  updateHeat(0.7);

  return { refresh, spawnFloatingScore, updateHeat };
}
