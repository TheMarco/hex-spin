// Spec §6.1 — neon palette + dark fill variants.
export const NEON = {
  magenta: '#FF1493',
  cyan: '#00F0FF',
  lime: '#39FF14',
  purple: '#8C1BFF',
  orange: '#FF6B00',
  yellow: '#F0FF00',
};

export const DARK = {
  '#FF1493': '#2A0A1F',
  '#00F0FF': '#0A2529',
  '#39FF14': '#0F2906',
  '#8C1BFF': '#1F0A33',
  '#FF6B00': '#2A1205',
  '#F0FF00': '#2A2900',
};

export const STONE_FILL = '#2A2A2A';
export const STONE_OUTLINE = '#555555';

export const BG = '#0A0612';

// Phase → ordered active colors. Spec §4.2.
const ORDERED = [NEON.magenta, NEON.cyan, NEON.lime, NEON.purple, NEON.orange, NEON.yellow];

export const PHASE_PALETTES = {
  1: ORDERED.slice(0, 3),
  2: ORDERED.slice(0, 4),
  3: ORDERED.slice(0, 5),
  4: ORDERED.slice(0, 6),
};

export const darkVariant = (neonHex) => DARK[neonHex] ?? STONE_FILL;
