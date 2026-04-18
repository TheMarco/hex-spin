// Single canonical 6-color palette used across every phase. Each phase just
// uses a subset; that way a leftover triangle from an earlier phase always
// has a color string that also exists in the current phase's palette — no
// visually-identical-but-different-string collisions that would make
// "completed" hexes fail to clear.
export const NEON = {
  magenta: '#FF2BD6',
  orange: '#FF7A00',
  yellow: '#F5FF00',
  green: '#00FF66',
  cyan: '#00E5FF',
  purple: '#8B2CFF',
};

export const DARK = {
  '#FF2BD6': '#260620',
  '#FF7A00': '#261200',
  '#F5FF00': '#242600',
  '#00FF66': '#00260F',
  '#00E5FF': '#002226',
  '#8B2CFF': '#140626',
};

export const STONE_FILL = '#2A2A2A';
export const STONE_OUTLINE = '#555555';
export const BG = '#000000';

// Additive palettes: each phase introduces exactly one new color on top of
// the previous phase. The "new color" is what the per-phase bonus hunts.
const THEME_DEFS = {
  arcade: {
    id: 'arcade',
    label: 'Arcade Neon',
    shortLabel: 'ARC',
    phase: 1,
    ordered: [NEON.magenta, NEON.purple, NEON.cyan],
    newColor: null,
  },
  reactor: {
    id: 'reactor',
    label: 'Toxic Reactor',
    shortLabel: 'TOX',
    phase: 2,
    ordered: [NEON.magenta, NEON.purple, NEON.cyan, NEON.yellow],
    newColor: NEON.yellow,
  },
  void: {
    id: 'void',
    label: 'Deep Void',
    shortLabel: 'VOID',
    phase: 3,
    ordered: [NEON.magenta, NEON.purple, NEON.cyan, NEON.yellow, NEON.green],
    newColor: NEON.green,
  },
  solar: {
    id: 'solar',
    label: 'Solar Burn',
    shortLabel: 'SOL',
    phase: 4,
    ordered: [NEON.magenta, NEON.purple, NEON.cyan, NEON.yellow, NEON.green, NEON.orange],
    newColor: NEON.orange,
  },
};

export const DEFAULT_THEME_ID = 'arcade';
export const PHASE_THEME_IDS = {
  1: 'arcade',
  2: 'reactor',
  3: 'void',
  4: 'solar',
};

function buildPhasePalettes(theme) {
  return { [theme.phase]: [...theme.ordered] };
}

function buildPhaseNewColor(theme) {
  return theme.newColor ? { [theme.phase]: theme.newColor } : {};
}

function deriveHeatColors(ordered) {
  return {
    high: ordered[1],
    mid: ordered[2],
    low: ordered[0],
  };
}

function toHexChannel(value) {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');
}

function deriveDarkVariant(hex, factor = 0.15) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return STONE_FILL;
  const channels = clean.match(/.{2}/g)?.map((part) => parseInt(part, 16));
  if (!channels || channels.some((channel) => Number.isNaN(channel))) return STONE_FILL;
  return `#${channels.map((channel) => toHexChannel(Math.round(channel * factor))).join('')}`;
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const channels = clean.match(/.{2}/g)?.map((part) => parseInt(part, 16));
  if (!channels || channels.some((channel) => Number.isNaN(channel))) return [255, 255, 255];
  return channels;
}

function rgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mixHex(a, b, t) {
  const rgbA = hexToRgb(a);
  const rgbB = hexToRgb(b);
  return `#${rgbA
    .map((channel, idx) => toHexChannel(Math.round(channel + (rgbB[idx] - channel) * t)))
    .join('')}`;
}

function shade(hex, amount) {
  return mixHex(hex, '#000000', amount);
}

function tint(hex, amount) {
  return mixHex(hex, '#ffffff', amount);
}

function unitRgb(hex) {
  return hexToRgb(hex).map((channel) => channel / 255);
}

function buildThemeVisuals(ordered) {
  const accent = ordered[1];
  const accentAlt = ordered[0];
  const secondary = ordered[2];
  const highlight = ordered[3] ?? ordered[2];
  const support = ordered[4] ?? ordered[1];
  const deep = ordered[5] ?? ordered[0];
  const sceneBg = shade(mixHex(accent, deep, 0.45), 0.93);
  const pageSpot = mixHex(accentAlt, accent, 0.55);
  const pageBgTop = shade(mixHex(accent, deep, 0.3), 0.9);
  const pageBgBottom = shade(mixHex(deep, support, 0.35), 0.96);
  const overlayBg = rgba(shade(mixHex(accentAlt, deep, 0.5), 0.86), 0.88);
  const panelBg = rgba(shade(mixHex(accent, deep, 0.4), 0.82), 0.62);
  const panelBgStrong = rgba(shade(mixHex(accentAlt, deep, 0.5), 0.88), 0.78);
  const panelStroke = rgba(accent, 0.3);
  const danger = accentAlt;
  const flash = tint(secondary, 0.7);

  const nebulaColors = [
    { colorA: unitRgb(mixHex(accentAlt, accent, 0.3)), colorB: unitRgb(shade(accentAlt, 0.8)) },
    { colorA: unitRgb(mixHex(accent, deep, 0.4)), colorB: unitRgb(shade(deep, 0.78)) },
    { colorA: unitRgb(mixHex(highlight, secondary, 0.35)), colorB: unitRgb(shade(highlight, 0.82)) },
    { colorA: unitRgb(mixHex(deep, accentAlt, 0.4)), colorB: unitRgb(shade(deep, 0.8)) },
    { colorA: unitRgb(mixHex(support, accent, 0.4)), colorB: unitRgb(shade(mixHex(support, deep, 0.5), 0.8)) },
  ];

  const starPalette = [
    '#ffffff',
    '#ffffff',
    tint(accent, 0.72),
    tint(deep, 0.7),
    tint(support, 0.68),
    tint(highlight, 0.68),
    tint(accentAlt, 0.7),
  ];

  return {
    sceneBg,
    pageSpot,
    pageBgTop,
    pageBgBottom,
    overlayBg,
    panelBg,
    panelBgStrong,
    panelStroke,
    uiAccent: accent,
    uiAccentAlt: accentAlt,
    uiSecondary: secondary,
    uiHighlight: highlight,
    textMain: '#F5FBFF',
    textDim: '#8DA0B4',
    danger,
    pulse: mixHex(accent, accentAlt, 0.35),
    flash,
    vertex: tint(accent, 0.3),
    vertexCore: tint(secondary, 0.48),
    nebulaColors,
    starPalette,
  };
}

export const THEMES = Object.fromEntries(
  Object.entries(THEME_DEFS).map(([id, theme]) => [
    id,
    {
      ...theme,
      phasePalettes: buildPhasePalettes(theme),
      phaseNewColor: buildPhaseNewColor(theme),
      heatColors: deriveHeatColors(theme.ordered),
      visuals: buildThemeVisuals(theme.ordered),
    },
  ])
);

export const DEFAULT_THEME = THEMES[DEFAULT_THEME_ID];

// Compatibility exports: these represent the default theme only.
export const PHASE_PALETTES = DEFAULT_THEME.phasePalettes;
export const PHASE_NEW_COLOR = DEFAULT_THEME.phaseNewColor;

export const NEW_COLOR_BONUS_MULT = 2;

export function getTheme(themeId = DEFAULT_THEME_ID) {
  return THEMES[themeId] ?? DEFAULT_THEME;
}

export function getThemeIds() {
  return Object.keys(THEMES);
}

export function getThemeIdForPhase(phase = 1) {
  return PHASE_THEME_IDS[phase] ?? DEFAULT_THEME_ID;
}

export function getThemeForPhase(phase = 1) {
  return getTheme(getThemeIdForPhase(phase));
}

export function getThemePaletteOrder(themeId = DEFAULT_THEME_ID) {
  return getTheme(themeId).ordered;
}

export function getThemePhasePalettes(themeId = DEFAULT_THEME_ID) {
  return getTheme(themeId).phasePalettes;
}

export function getThemeNewColor(themeId = DEFAULT_THEME_ID) {
  return getTheme(themeId).phaseNewColor;
}

export function getThemeHeatColors(themeId = DEFAULT_THEME_ID) {
  return getTheme(themeId).heatColors;
}

export function getThemeVisuals(themeId = DEFAULT_THEME_ID) {
  return getTheme(themeId).visuals;
}

export function getThemeCssVars(themeId = DEFAULT_THEME_ID) {
  const visuals = getThemeVisuals(themeId);
  return {
    '--page-spot': visuals.pageSpot,
    '--page-bg-top': visuals.pageBgTop,
    '--page-bg-bottom': visuals.pageBgBottom,
    '--overlay-bg': visuals.overlayBg,
    '--panel-bg': visuals.panelBg,
    '--panel-bg-strong': visuals.panelBgStrong,
    '--panel-stroke': visuals.panelStroke,
    '--text-main': visuals.textMain,
    '--text-dim': visuals.textDim,
    '--ui-accent': visuals.uiAccent,
    '--ui-accent-alt': visuals.uiAccentAlt,
    '--ui-secondary': visuals.uiSecondary,
    '--ui-highlight': visuals.uiHighlight,
    '--danger-color': visuals.danger,
    '--phase-flash': visuals.flash,
  };
}

export const darkVariant = (neonHex) => DARK[neonHex] ?? deriveDarkVariant(neonHex);
