// RCadia Tournament SDK integration — https://www.rcadia.xyz/docs
//
// Three game->parent postMessage events:
//   INITIALIZE     { gameTitle }   — on load
//   CONSUME_LIFE   {}              — on player death
//   SUBMIT_SCORE   { score }       — on game end
//
// One parent->game event:
//   GET_USER_ADDRESS { username, genesisPass, wallets }
//
// All posts target window.parent with origin '*', which is a silent no-op when
// the game runs standalone (no parent frame). The host tournament shell is
// responsible for validating messages on its side.

const DEFAULT_GAME_TITLE = 'Rotatron';

let userInfo = null;
const userListeners = new Set();

function post(type, payload = {}) {
  if (typeof window === 'undefined' || !window.parent) return;
  try {
    window.parent.postMessage({ type, ...payload }, '*');
  } catch {
    /* silent */
  }
}

export function isEmbedded() {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function rcadiaInit({ gameTitle = DEFAULT_GAME_TITLE } = {}) {
  if (typeof window === 'undefined') return;
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== 'GET_USER_ADDRESS') return;
    userInfo = {
      username: data.username ?? null,
      genesisPass: data.genesisPass ?? null,
      wallets: data.wallets ?? null,
    };
    for (const fn of userListeners) {
      try {
        fn(userInfo);
      } catch {
        /* listener error swallowed to keep game loop alive */
      }
    }
  });
  post('INITIALIZE', { gameTitle });
}

export function rcadiaConsumeLife() {
  post('CONSUME_LIFE');
}

export function rcadiaSubmitScore(score) {
  const n = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
  post('SUBMIT_SCORE', { score: n });
}

export function rcadiaOnUser(fn) {
  userListeners.add(fn);
  if (userInfo) fn(userInfo);
  return () => userListeners.delete(fn);
}

export function rcadiaGetUser() {
  return userInfo;
}
