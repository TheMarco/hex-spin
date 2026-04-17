// Sample-based audio engine: WebAudio AudioBuffers for overlapping sfx,
// a single HTMLAudioElement for looped background music. First user gesture
// (tap, mute toggle) calls initAudio() which creates the context and kicks
// off loading + music playback.

import musicUrl from './s-music.mp3?url';
import turnwheelUrl from './s-turnwheel.mp3?url';
import hexagonUrl from './s-hexagon.mp3?url';
import hexagonNewUrl from './s-hexagonnew.mp3?url';
import levelupUrl from './s-levelup.mp3?url';
import gameoverUrl from './s-gameover.mp3?url';

const SFX_URLS = {
  turnwheel: turnwheelUrl,
  hexagon: hexagonUrl,
  hexagonnew: hexagonNewUrl,
  levelup: levelupUrl,
  gameover: gameoverUrl,
};

const SFX_VOLUME = 0.55;
const MUSIC_VOLUME = 0.32;

let ctx = null;
let sfxGain = null;
let muted = false;
let music = null;
const buffers = {};

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

    music = new Audio(musicUrl);
    music.loop = true;
    music.volume = muted ? 0 : MUSIC_VOLUME;
    music.play().catch(() => {});
  } catch (e) {
    console.warn('AudioContext unavailable', e);
  }
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

function playBuffer(key, { rate = 1, volume = 1 } = {}) {
  if (!ctx || !buffers[key]) return;
  const src = ctx.createBufferSource();
  src.buffer = buffers[key];
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = volume;
  src.connect(g).connect(sfxGain);
  src.start();
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

// The hexagon sample now covers the impact — old synth whoosh is retired.
export function playImplodeWhoosh() {}

export function playPhaseTransitionSfx() {
  playBuffer('levelup');
}

export function playGameOver() {
  playBuffer('gameover');
}

export function playInvalid() {}
