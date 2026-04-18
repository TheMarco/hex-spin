import { getThemeIdForPhase, getThemeNewColor, getThemePaletteOrder } from '../utils/colors.js';
import { gameState } from '../game/state.js';

const PHASE_LOCK_MS = 1600;

export function createOverlay({ container, onPlayAgain }) {
  function playPhaseTransition(newPhase) {
    gameState.status = 'phase_transition';

    const sweep = document.createElement('div');
    sweep.className = 'phase-sweep';
    container.appendChild(sweep);

    const flash = document.createElement('div');
    flash.className = 'phase-flash';
    container.appendChild(flash);

    const announce = document.createElement('div');
    announce.className = 'phase-announce';
    const themeId = getThemeIdForPhase(newPhase);
    announce.style.color =
      getThemeNewColor(themeId)[newPhase] ?? getThemePaletteOrder(themeId)[1];
    announce.textContent = `PHASE ${newPhase}`;
    container.appendChild(announce);

    setTimeout(() => sweep.remove(), 700);
    setTimeout(() => flash.remove(), 200);
    setTimeout(() => announce.remove(), 1500);
    setTimeout(() => {
      if (gameState.status === 'phase_transition') gameState.status = 'idle';
    }, PHASE_LOCK_MS);
  }

  let gameOverEl = null;
  function showGameOver() {
    if (gameOverEl) return;
    const el = document.createElement('div');
    el.className = 'gameover';
    el.innerHTML = `
      <div class="gameover-card">
        <div class="gameover-kicker">[ RUN COMPLETE ]</div>
        <div class="gameover-score-label">FINAL SCORE</div>
        <div class="gameover-score">${gameState.score.toLocaleString()}</div>
        <div class="gameover-stats-grid">
          <div class="gameover-stat">
            <div class="gameover-stat-label">Phase</div>
            <div class="gameover-stat-value">${gameState.phase}</div>
          </div>
          <div class="gameover-stat">
            <div class="gameover-stat-label">Hexes</div>
            <div class="gameover-stat-value">${gameState.hexCount}</div>
          </div>
          <div class="gameover-stat">
            <div class="gameover-stat-label">Longest</div>
            <div class="gameover-stat-value">×${gameState.longestCascade}</div>
          </div>
        </div>
        <button class="play-again">PLAY AGAIN</button>
      </div>
    `;
    container.appendChild(el);
    gameOverEl = el;
    el.querySelector('.play-again').addEventListener('click', () => {
      el.remove();
      gameOverEl = null;
      onPlayAgain?.();
    });
  }

  return { playPhaseTransition, showGameOver };
}
