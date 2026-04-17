import { NEON } from '../utils/colors.js';
import { gameState } from '../game/state.js';

const PHASE_COLORS = {
  2: NEON.purple,
  3: NEON.orange,
  4: NEON.yellow,
};

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
    announce.style.color = PHASE_COLORS[newPhase] ?? NEON.cyan;
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
        <div class="gameover-title">─── RUN COMPLETE ───</div>
        <table class="gameover-stats">
          <tr><td>Score</td><td>${gameState.score.toLocaleString()}</td></tr>
          <tr><td>Phase reached</td><td>${gameState.phase}</td></tr>
          <tr><td>Hexes cleared</td><td>${gameState.hexCount}</td></tr>
          <tr><td>Longest cascade</td><td>${gameState.longestCascade}</td></tr>
        </table>
        <button class="play-again">[ PLAY AGAIN ]</button>
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
