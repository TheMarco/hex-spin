import { ROWS, COLS, ring, isRealVertex, key, isInsideHex } from '../utils/math.js';

const randColor = (palette) => palette[Math.floor(Math.random() * palette.length)];

// Avoid any starting configuration where a hex ring is already monochrome —
// otherwise the completed hex just sits on the board at startup (cascades only
// resolve inside spin()). Re-roll until no ring of real triangles is uniform.
export function createBoard(palette) {
  while (true) {
    const board = {};
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (!isInsideHex(col, row)) continue;
        board[key(col, row)] = {
          col,
          row,
          color: randColor(palette),
          isUp: (col + row) % 2 === 0,
        };
      }
    }
    if (!hasCompletedHex(board)) return board;
  }
}

function hasCompletedHex(board) {
  for (let j = 0; j <= ROWS; j++) {
    for (let k = 0; k <= COLS; k++) {
      if (!isRealVertex(k, j)) continue;
      const ts = ring(k, j);
      let first = null;
      let full = true;
      let mono = true;
      for (const [c, r] of ts) {
        const t = board[key(c, r)];
        if (!t) {
          full = false;
          break;
        }
        if (first === null) first = t.color;
        else if (t.color !== first) {
          mono = false;
          break;
        }
      }
      if (full && mono) return true;
    }
  }
  return false;
}

// For every tappable vertex with phantom (missing) ring slots, seed each
// phantom slot with a hidden color. Persistent across spins — colors rotate
// through both real and phantom slots as a 6-position circular buffer.
export function createPhantomSlots(board, palette) {
  const slots = {};
  for (let j = 0; j <= ROWS; j++) {
    for (let k = 0; k <= COLS; k++) {
      if (!isRealVertex(k, j)) continue;
      const ts = ring(k, j);
      const realCount = ts.filter(([c, r]) => board[key(c, r)]).length;
      if (realCount === 0 || realCount === 6) continue;
      const slotColors = {};
      ts.forEach(([c, r], idx) => {
        if (!board[key(c, r)]) slotColors[idx] = randColor(palette);
      });
      slots[key(k, j)] = slotColors;
    }
  }
  return slots;
}

export function isValidVertex(k, j, board) {
  if (!isRealVertex(k, j)) return false;
  const ts = ring(k, j);
  for (const [c, r] of ts) {
    if (board[key(c, r)]) return true;
  }
  return false;
}

export function listValidVertices(board) {
  const out = [];
  for (let j = 0; j <= ROWS; j++) {
    for (let k = 0; k <= COLS; k++) {
      if (isValidVertex(k, j, board)) out.push([k, j]);
    }
  }
  return out;
}

// How many ring triangles actually exist (in-bounds + inside hex).
// Interior vertices = 6, edge = 4, corner = 3, off-board = 0.
export function realRingCount(k, j, board) {
  const ts = ring(k, j);
  let n = 0;
  for (const [c, r] of ts) if (board[key(c, r)]) n++;
  return n;
}
