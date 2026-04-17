// Spec §6.1 — neon palette + dark fill variants.
// Six hand-picked hues spaced broadly across the wheel so all colors remain
// distinct even at the low brightness of the triangle fills. Phase 1 uses
// magenta / cyan / yellow (close to a triad) for maximal hue separation at
// the start; later phases fill the gaps with orange, green, blue.
export const NEON = {
  magenta: '#FF00A8', // Hot Magenta
  cyan: '#00F5FF', // Electric Cyan
  yellow: '#E8FF1A', // Acid Yellow
  orange: '#FF6A00', // Neon Orange
  green: '#39FF14', // Neon Green
  blue: '#2D7FFF', // Laser Blue
};

// ~15% of each neon channel — same hue, quiet enough to sit behind the
// outline without competing with it.
export const DARK = {
  '#FF00A8': '#260019',
  '#00F5FF': '#002526',
  '#E8FF1A': '#232604',
  '#FF6A00': '#261000',
  '#39FF14': '#092603',
  '#2D7FFF': '#071326',
};

export const STONE_FILL = '#2A2A2A';
export const STONE_OUTLINE = '#555555';

export const BG = '#000000';

// Phase → ordered active colors. Spec §4.2.
const ORDERED = [NEON.magenta, NEON.cyan, NEON.yellow, NEON.orange, NEON.green, NEON.blue];

export const PHASE_PALETTES = {
  1: ORDERED.slice(0, 3),
  2: ORDERED.slice(0, 4),
  3: ORDERED.slice(0, 5),
  4: ORDERED.slice(0, 6),
};

// The color added at each phase transition. Completing a hex in this color
// during that phase earns a score bonus (see NEW_COLOR_BONUS_MULT).
export const PHASE_NEW_COLOR = {
  2: ORDERED[3], // orange
  3: ORDERED[4], // green
  4: ORDERED[5], // blue
};

export const NEW_COLOR_BONUS_MULT = 2;

export const darkVariant = (neonHex) => DARK[neonHex] ?? STONE_FILL;
