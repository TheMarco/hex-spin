// Sample-based audio engine: WebAudio AudioBuffers for overlapping sfx,
// a single HTMLAudioElement for looped background music. First user gesture
// (tap, mute toggle) calls initAudio() which creates the context and kicks
// off loading + music playback.

import { DEFAULT_THEME_ID, getTheme } from '../utils/colors.js';
import music1Url from './s-music1.mp3?url';
import music2Url from './s-music2.mp3?url';
import music3Url from './s-music3.mp3?url';
import music4Url from './s-music4.mp3?url';
import turnwheelUrl from './s-turnwheel.mp3?url';
import hexagonUrl from './s-hexagon.mp3?url';
import hexagonNewUrl from './s-hexagonnew.mp3?url';
import extrabonusUrl from './s-extrabonus.mp3?url';
import levelupUrl from './s-levelup.mp3?url';
import gameoverUrl from './s-gameover.mp3?url';

const SFX_URLS = {
  turnwheel: turnwheelUrl,
  hexagon: hexagonUrl,
  hexagonnew: hexagonNewUrl,
  extrabonus: extrabonusUrl,
  levelup: levelupUrl,
  gameover: gameoverUrl,
};

const SFX_VOLUME = 0.55;
const MUSIC_VOLUME = 0.32;
const MUSIC_URLS = {
  arcade: music1Url,
  reactor: music2Url,
  void: music3Url,
  solar: music4Url,
};

let ctx = null;
let sfxGain = null;
let muted = false;
let music = null;
let musicThemeId = DEFAULT_THEME_ID;
const buffers = {};

function normalizeThemeId(themeId) {
  return getTheme(themeId).id;
}

function musicUrlForTheme(themeId) {
  return MUSIC_URLS[normalizeThemeId(themeId)] ?? MUSIC_URLS[DEFAULT_THEME_ID];
}

function setMusicSource(themeId) {
  musicThemeId = normalizeThemeId(themeId);
  if (!music) return;
  music.pause();
  music.src = musicUrlForTheme(musicThemeId);
  music.loop = true;
  music.volume = muted ? 0 : MUSIC_VOLUME;
  music.load();
}

async function decodeUrl(url) {
  const res = await fetch(url);
  const arr = await res.arrayBuffer();
  return await ctx.decodeAudioData(arr);
}

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    if (music && music.paused && !muted) music.play().catch(() => {});
    return;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    sfxGain = ctx.createGain();
    muted = localStorage.getItem('hexspin.muted') === '1';
    sfxGain.gain.value = muted ? 0 : SFX_VOLUME;
    sfxGain.connect(ctx.destination);

    for (const [key, url] of Object.entries(SFX_URLS)) {
      decodeUrl(url)
        .then((buf) => {
          buffers[key] = buf;
        })
        .catch((e) => {
          console.warn(`Failed to load sfx ${key}`, e);
        });
    }

    music = new Audio();
    music.preload = 'auto';
    setMusicSource(musicThemeId);
    music.play().catch(() => {});
  } catch (e) {
    console.warn('AudioContext unavailable', e);
  }
}

export function setMusicTheme(themeId) {
  const nextThemeId = normalizeThemeId(themeId);
  if (musicThemeId === nextThemeId && music) return;
  const shouldResume = Boolean(music && !music.paused && !muted);
  setMusicSource(nextThemeId);
  if (music && shouldResume && !muted) music.play().catch(() => {});
}

export function setMuted(next) {
  muted = next;
  if (sfxGain) sfxGain.gain.value = next ? 0 : SFX_VOLUME;
  if (music) {
    music.volume = next ? 0 : MUSIC_VOLUME;
    if (next) music.pause();
    else music.play().catch(() => {});
  }
  try {
    localStorage.setItem('hexspin.muted', next ? '1' : '0');
  } catch {
    // localStorage may be unavailable (private mode, embeds)
  }
}

export function isMuted() {
  return muted;
}

function playBuffer(key, { rate = 1, volume = 1, delay = 0 } = {}) {
  if (!ctx || !buffers[key]) return;
  const src = ctx.createBufferSource();
  src.buffer = buffers[key];
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = volume;
  src.connect(g).connect(sfxGain);
  src.start(delay > 0 ? ctx.currentTime + delay : 0);
}

export function playSpin() {
  playBuffer('turnwheel');
}

// Cascade depth nudges pitch up so chains feel like they climb. Pass
// `bonus: true` for hexes completed in the phase's newly-introduced color —
// plays s-hexagonnew.mp3 instead of the normal hex-clear sample.
export function playHexClear(cascade = 1, { bonus = false } = {}) {
  const rate = Math.min(1 + (cascade - 1) * 0.08, 1.5);
  playBuffer(bonus ? 'hexagonnew' : 'hexagon', { rate });
}

// Extra-bonus layer. Plays on cascade waves 2+ and on the hottest fresh-hit
// clears — stacks over the normal hex clear to reward the chain. Pitch climbs
// in minor-third steps per extra wave (a 3-semitone ladder) and every third
// step gets a delayed echo a perfect fifth up so deep chains sound like a
// chord blooming open.
const SEMITONE = Math.pow(2, 1 / 12);
export function playExtraBonus({ cascade = 1, freshMult = 1 } = {}) {
  const chainStep = Math.max(0, cascade - 1); // 0 for fresh-hit trigger, 1+ for cascades
  const freshStep = freshMult >= 1.8 && cascade === 1 ? 1 : 0; // brightest fresh hit also pings
  const step = chainStep + freshStep;
  if (step <= 0) return;
  const cappedStep = Math.min(step, 5);
  const rate = Math.pow(SEMITONE, cappedStep * 3);
  const volume = Math.min(1, 0.7 + cappedStep * 0.08);
  playBuffer('extrabonus', { rate, volume });
  if (cappedStep >= 3) {
    // Blooming echo a perfect fifth above, delayed ~90ms.
    playBuffer('extrabonus', {
      rate: rate * Math.pow(SEMITONE, 7),
      volume: volume * 0.65,
      delay: 0.09,
    });
  }
}

// The hexagon sample now covers the impact — old synth whoosh is retired.
export function playImplodeWhoosh() {}

export function playPhaseTransitionSfx() {
  playBuffer('levelup');
}

export function playGameOver() {
  playBuffer('gameover');
}

export function playInvalid() {}
