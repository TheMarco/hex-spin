// Lightweight WebAudio SFX — no Tone.js to keep the bundle tight.
// Spec §8. Init on first user gesture per spec §15 autoplay note.

let ctx = null;
let master = null;
let muted = false;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.28;
    master.connect(ctx.destination);
    muted = localStorage.getItem('hexspin.muted') === '1';
    if (muted) master.gain.value = 0;
  } catch (e) {
    console.warn('AudioContext unavailable', e);
  }
}

export function setMuted(next) {
  muted = next;
  if (master) master.gain.value = next ? 0 : 0.28;
  try {
    localStorage.setItem('hexspin.muted', next ? '1' : '0');
  } catch {
    // localStorage may be unavailable (private mode, embeds)
  }
}
export function isMuted() {
  return muted;
}

const now = () => ctx.currentTime;

// Rising arpeggio — one note per cascade depth. Spec §8.
// C5, D5, F5, A5, C6, D6, F6, A6 (pentatonic A-minor-ish)
const CASCADE_NOTES = [523.25, 587.33, 698.46, 880.0, 1046.5, 1174.66, 1396.91, 1760.0];

export function playSpin() {
  if (!ctx) return;
  const t0 = now();

  // Upward noise-sweep via bandpass
  const bufSize = Math.floor(ctx.sampleRate * 0.1);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.Q.value = 8;
  filt.frequency.setValueAtTime(900, t0);
  filt.frequency.exponentialRampToValueAtTime(2400, t0 + 0.09);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.35, t0);
  ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1);
  src.connect(filt).connect(ng).connect(master);
  src.start(t0);
  src.stop(t0 + 0.12);

  // Tonal click at landing
  const click = ctx.createOscillator();
  click.type = 'triangle';
  click.frequency.setValueAtTime(1800, t0 + 0.07);
  click.frequency.exponentialRampToValueAtTime(1200, t0 + 0.12);
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.18, t0 + 0.07);
  cg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
  click.connect(cg).connect(master);
  click.start(t0 + 0.07);
  click.stop(t0 + 0.16);
}

export function playImplodeWhoosh() {
  if (!ctx) return;
  const t0 = now();
  const bufSize = Math.floor(ctx.sampleRate * 0.36);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.Q.value = 4;
  filt.frequency.setValueAtTime(2200, t0);
  filt.frequency.exponentialRampToValueAtTime(400, t0 + 0.34);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.3, t0 + 0.12);
  g.gain.linearRampToValueAtTime(0, t0 + 0.34);
  src.connect(filt).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + 0.38);
}

export function playHexClear(cascadeDepth = 1) {
  if (!ctx) return;
  const t0 = now();
  const idx = Math.min(cascadeDepth - 1, CASCADE_NOTES.length - 1);
  const pitch = CASCADE_NOTES[idx];

  // Bell tone
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = pitch;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.26, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + 0.75);

  // Second harmonic, quieter — adds shimmer
  const h = ctx.createOscillator();
  h.type = 'sine';
  h.frequency.value = pitch * 2;
  const hg = ctx.createGain();
  hg.gain.setValueAtTime(0.09, t0);
  hg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
  h.connect(hg).connect(master);
  h.start(t0);
  h.stop(t0 + 0.5);

  // Sub thump at impact
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(120, t0);
  sub.frequency.exponentialRampToValueAtTime(40, t0 + 0.22);
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.45, t0);
  sg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
  sub.connect(sg).connect(master);
  sub.start(t0);
  sub.stop(t0 + 0.34);
}

export function playPhaseTransitionSfx(newPhase = 2) {
  if (!ctx) return;
  const t0 = now();

  // Filter-sweep whoosh
  const bufSize = Math.floor(ctx.sampleRate * 0.9);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.Q.value = 5;
  filt.frequency.setValueAtTime(300, t0);
  filt.frequency.exponentialRampToValueAtTime(5000, t0 + 0.7);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0, t0);
  ng.gain.linearRampToValueAtTime(0.3, t0 + 0.2);
  ng.gain.linearRampToValueAtTime(0, t0 + 0.9);
  src.connect(filt).connect(ng).connect(master);
  src.start(t0);
  src.stop(t0 + 0.95);

  // Detuned saw stab landing on a chord
  const rootPitch = 220 * Math.pow(2, (newPhase - 1) * 0.17);
  const voices = [
    { f: rootPitch, d: -10 },
    { f: rootPitch, d: +10 },
    { f: rootPitch * 1.5, d: 0 },
    { f: rootPitch * 2, d: -4 },
  ];
  for (const v of voices) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = v.f;
    o.detune.value = v.d;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0, t0 + 0.4);
    og.gain.linearRampToValueAtTime(0.14, t0 + 0.45);
    og.gain.exponentialRampToValueAtTime(0.001, t0 + 1.1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(800, t0 + 0.4);
    lp.frequency.linearRampToValueAtTime(2200, t0 + 0.7);
    o.connect(lp).connect(og).connect(master);
    o.start(t0 + 0.4);
    o.stop(t0 + 1.2);
  }
}

export function playGameOver() {
  if (!ctx) return;
  const t0 = now();

  // Reverse-ish whoosh in
  const bufSize = Math.floor(ctx.sampleRate * 0.9);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    const t = i / bufSize;
    data[i] = (Math.random() * 2 - 1) * t * t;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1800;
  const ng = ctx.createGain();
  ng.gain.value = 0.2;
  src.connect(hp).connect(ng).connect(master);
  src.start(t0);

  // Sustained descending bass tone
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(110, t0 + 0.7);
  sub.frequency.exponentialRampToValueAtTime(45, t0 + 3.2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0 + 0.7);
  g.gain.linearRampToValueAtTime(0.45, t0 + 1.1);
  g.gain.linearRampToValueAtTime(0.45, t0 + 2.2);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 3.4);
  sub.connect(g).connect(master);
  sub.start(t0 + 0.7);
  sub.stop(t0 + 3.5);

  // Shimmering overtone fade
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = 330;
  const og = ctx.createGain();
  og.gain.setValueAtTime(0, t0 + 0.7);
  og.gain.linearRampToValueAtTime(0.08, t0 + 1.2);
  og.gain.exponentialRampToValueAtTime(0.001, t0 + 3.0);
  o.connect(og).connect(master);
  o.start(t0 + 0.7);
  o.stop(t0 + 3.2);
}

export function playInvalid() {
  if (!ctx) return;
  const t0 = now();
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(220, t0);
  o.frequency.linearRampToValueAtTime(150, t0 + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.18, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + 0.16);
}
