import * as THREE from 'three';
import { DEFAULT_THEME_ID, getThemeVisuals } from '../utils/colors.js';

// Deep-space backdrop: 5 volumetric nebula planes with FBM-noise color fields
// sitting in the distance, and ~3500 stars flying toward the camera from a
// vanishing point. Stars cycle through a z-range so density stays constant;
// a shader-driven fade smooths the wrap. Hero-sized stars get diffraction
// spikes so they read as bright points of light, not disks.
export function createBackground({ scene }) {
  const root = new THREE.Group();
  scene.add(root);

  // =========================================================================
  // Nebula backdrop
  // =========================================================================
  const nebulaConfigs = [
    { x: -28, y: 14, z: -55, size: 60, seed: 1.7 },
    { x: 30, y: -18, z: -70, size: 62, seed: 4.3 },
    { x: -18, y: -22, z: -50, size: 48, seed: 2.9 },
    { x: 32, y: 24, z: -82, size: 70, seed: 5.6 },
    { x: 0, y: 4, z: -100, size: 95, seed: 3.1 },
  ];

  const nebulaVertex = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const nebulaFragment = /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform float uTime;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform float uSeed;
    uniform float uOpacity;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float fbm5(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p *= 2.0;
        a *= 0.5;
      }
      return v;
    }

    // Cheaper fbm for the warp field — we don't need the fine detail there.
    float fbm3(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 3; i++) {
        v += a * noise(p);
        p *= 2.0;
        a *= 0.5;
      }
      return v;
    }

    // Ridged noise: 1 - |2n - 1| carves sharp crest lines, good for
    // filament-like structure found around star-forming regions.
    float ridged(vec2 p) {
      return 1.0 - abs(fbm5(p) * 2.0 - 1.0);
    }

    void main() {
      vec2 uv = vUv - 0.5;
      float d = length(uv);
      // Steep outer tail keeps the circular plane silhouette from reading
      // as a visible edge against empty space; core is boosted to compensate.
      float rad = smoothstep(0.5, 0.0, d);
      rad = pow(rad, 3.0);

      vec2 p = vUv * 3.2 + vec2(uSeed);

      // Domain warping — feed fbm output back in as UV offset to turn blob
      // clouds into flowing tendril structures (the Inigo Quilez trick).
      vec2 warp = vec2(
        fbm3(p + vec2(uTime * 0.03, 1.7)),
        fbm3(p + vec2(-uTime * 0.025, 4.3))
      ) * 1.4;

      // Main cloud body — slow, warped, the diffuse backdrop gas.
      float cloud = fbm5(p + warp + vec2(uTime * 0.02, uTime * 0.012));
      cloud = pow(max(cloud, 0.0), 1.5);

      // Ridged filaments — thin bright veins through the cloud, offset from
      // the warp so they don't just trace it.
      float filaments = ridged(p * 1.8 + warp * 0.8 + vec2(uSeed * 2.0));
      filaments = pow(filaments, 3.0);

      // Dust lanes — dark sinuous veins that carve out bright regions.
      // Wider threshold band + stronger subtract gives the nebula more
      // visible structure instead of a uniform glow.
      float dust = smoothstep(0.35, 0.7, fbm3(p * 0.8 - warp * 0.4));

      // Combine: bright filaments amplify, dust subtracts hard.
      float body = cloud + filaments * 0.35;
      body *= 1.0 - dust * 0.8;

      float density = rad * max(body, 0.0) * uOpacity;

      // Brighter cores lean toward colorB (hotter), diffuse gas toward colorA.
      float colorMix = clamp(cloud * 0.6 + filaments * 0.8, 0.0, 1.0);
      vec3 col = mix(uColorA, uColorB, colorMix);

      gl_FragColor = vec4(col * density * 1.5, density * 0.85);
    }
  `;

  // Forward-drift cycle for nebulas: they slowly approach the camera, wrap
  // back out to Z_FAR with a fade-in so the cycle seam is invisible.
  const NEB_Z_FAR = -130;
  const NEB_Z_NEAR = -28;
  const NEB_RANGE = NEB_Z_NEAR - NEB_Z_FAR;
  const NEB_FADE_BAND = 14;
  const NEB_SPEED = 6.0; // units/sec — 4x original drift, still under star speed

  const nebulaMeshes = [];

  for (const cfg of nebulaConfigs) {
    const geom = new THREE.PlaneGeometry(cfg.size, cfg.size);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Vector3(1, 1, 1) },
        uColorB: { value: new THREE.Vector3(0, 0, 0) },
        uSeed: { value: cfg.seed },
        uOpacity: { value: 1 },
      },
      vertexShader: nebulaVertex,
      fragmentShader: nebulaFragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(cfg.x, cfg.y, cfg.z);
    mesh.renderOrder = -20;
    root.add(mesh);
    // Each nebula's initial cycle phase matches its configured z, so the
    // scene opens with the configured layout and drifts from there.
    nebulaMeshes.push({ mesh, material: mat, initialPhase: cfg.z - NEB_Z_FAR });
  }

  // =========================================================================
  // Forward-motion starfield (hyperspace feel, soothing pace)
  // =========================================================================
  const STAR_COUNT = 5500;
  const DEPTH_NEAR = 6; // closest world-z depth before a star wraps
  const DEPTH_FAR = 160;
  const DEPTH_RANGE = DEPTH_FAR - DEPTH_NEAR;
  // Bounding box must exceed the visible frustum at DEPTH_FAR on every supported
  // aspect ratio, otherwise the box edge appears as a hard seam in the sky.
  // Worst cases: tall portrait pulls the camera back (fitCamera) → big visible Y;
  // ultrawide widens visible X.
  const SPREAD_X = 140;
  const SPREAD_Y = 100;

  const positions = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);
  const colors = new Float32Array(STAR_COUNT * 3);
  const phases = new Float32Array(STAR_COUNT);
  const starBrightness = new Float32Array(STAR_COUNT);
  const starPaletteIndex = new Uint8Array(STAR_COUNT);

  for (let i = 0; i < STAR_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 2 * SPREAD_X;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 2 * SPREAD_Y;
    // Initial phase within the depth cycle — staggers stars evenly along z.
    positions[i * 3 + 2] = Math.random() * DEPTH_RANGE;

    const bias = Math.random();
    let size;
    if (bias < 0.025) size = 5 + Math.random() * 3.5;
    else if (bias < 0.18) size = 2 + Math.random() * 2;
    else size = 0.6 + Math.random() * 1.2;
    sizes[i] = size;

    starPaletteIndex[i] = Math.floor(Math.random() * 7);
    starBrightness[i] = 0.6 + Math.random() * 0.4;

    phases[i] = Math.random() * Math.PI * 2;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geom.setAttribute('starColor', new THREE.BufferAttribute(colors, 3));
  geom.setAttribute('twinklePhase', new THREE.BufferAttribute(phases, 1));

  const starMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uSpeed: { value: 9.0 },
      uDepthRange: { value: DEPTH_RANGE },
      uDepthNear: { value: DEPTH_NEAR },
      uSpread: { value: new THREE.Vector2(SPREAD_X, SPREAD_Y) },
    },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute float twinklePhase;
      attribute vec3 starColor;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uSpeed;
      uniform float uDepthRange;
      uniform float uDepthNear;
      uniform vec2 uSpread;
      varying vec3 vColor;
      varying float vTwinkle;
      varying float vSpike;
      varying float vFade;

      void main() {
        // position.z holds each star's initial phase in [0, uDepthRange].
        // The phase advances with time and wraps. World z maps it into the
        // range [-(near+range), -near], so stars slide toward the camera.
        float phase = mod(position.z + uTime * uSpeed, uDepthRange);
        float worldZ = -(uDepthNear + uDepthRange) + phase;
        vec3 pos = vec3(position.x, position.y, worldZ);
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

        float twinkle = 0.65 + 0.35 * sin(uTime * 0.9 + twinklePhase);
        vTwinkle = twinkle;
        vColor = starColor;
        vSpike = smoothstep(2.8, 5.8, size);

        // Fade in just after the far-side wrap, fade out just before passing
        // the camera — hides the cycle seam.
        float depth = -mvPosition.z;
        float fadeIn = smoothstep(uDepthNear + uDepthRange, uDepthNear + uDepthRange - 22.0, depth);
        float fadeOut = smoothstep(uDepthNear, uDepthNear + 4.0, depth);
        // Soft edge fade in world XY so the box boundary is invisible if the
        // visible frustum still grazes it on extreme aspect ratios.
        float edgeX = smoothstep(uSpread.x, uSpread.x * 0.82, abs(position.x));
        float edgeY = smoothstep(uSpread.y, uSpread.y * 0.82, abs(position.y));
        vFade = fadeIn * fadeOut * edgeX * edgeY;

        gl_PointSize = size * uPixelRatio * (180.0 / max(depth, 0.1));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vTwinkle;
      varying float vSpike;
      varying float vFade;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);

        float halo = smoothstep(0.5, 0.0, d);
        float core = pow(halo, 2.6);

        // Axis-aligned diffraction spikes, scaled by vSpike so only large
        // stars show them.
        float spikeH = exp(-abs(uv.y) * 60.0) * (1.0 - smoothstep(0.0, 0.5, abs(uv.x)));
        float spikeV = exp(-abs(uv.x) * 60.0) * (1.0 - smoothstep(0.0, 0.5, abs(uv.y)));
        float spike = (spikeH + spikeV) * vSpike;

        float alpha = (halo * 0.28 + core + spike * 0.8) * vTwinkle * vFade;
        vec3 rgb = vColor * (core * 1.6 + halo * 0.22 + spike * 1.25);
        gl_FragColor = vec4(rgb, alpha);
      }
    `,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    transparent: true,
  });

  const points = new THREE.Points(geom, starMaterial);
  points.frustumCulled = false;
  points.renderOrder = -10;
  root.add(points);

  // =========================================================================
  // Parallax dust: a closer, faster, smaller starfield in front of the main
  // one. Adds real depth perception — the eye perceives 3D space only when
  // layers move at different rates.
  // =========================================================================
  const DUST_COUNT = 1200;
  const DUST_DEPTH_NEAR = 3;
  const DUST_DEPTH_FAR = 30;
  const DUST_DEPTH_RANGE = DUST_DEPTH_FAR - DUST_DEPTH_NEAR;
  const DUST_SPREAD_X = 28;
  const DUST_SPREAD_Y = 22;

  const dustPositions = new Float32Array(DUST_COUNT * 3);
  const dustSizes = new Float32Array(DUST_COUNT);
  const dustColors = new Float32Array(DUST_COUNT * 3);
  const dustPhases = new Float32Array(DUST_COUNT);
  const dustBrightness = new Float32Array(DUST_COUNT);
  const dustPaletteIndex = new Uint8Array(DUST_COUNT);

  for (let i = 0; i < DUST_COUNT; i++) {
    dustPositions[i * 3] = (Math.random() - 0.5) * 2 * DUST_SPREAD_X;
    dustPositions[i * 3 + 1] = (Math.random() - 0.5) * 2 * DUST_SPREAD_Y;
    dustPositions[i * 3 + 2] = Math.random() * DUST_DEPTH_RANGE;
    dustSizes[i] = 0.35 + Math.random() * 0.9;
    dustPaletteIndex[i] = Math.floor(Math.random() * 7);
    dustBrightness[i] = 0.35 + Math.random() * 0.35;
    dustPhases[i] = Math.random() * Math.PI * 2;
  }

  const dustGeom = new THREE.BufferGeometry();
  dustGeom.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  dustGeom.setAttribute('size', new THREE.BufferAttribute(dustSizes, 1));
  dustGeom.setAttribute('starColor', new THREE.BufferAttribute(dustColors, 3));
  dustGeom.setAttribute('twinklePhase', new THREE.BufferAttribute(dustPhases, 1));

  // Reuse the same shader source — just different uniform values produce the
  // "closer, faster" parallax feel.
  const dustMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uSpeed: { value: 22.0 },
      uDepthRange: { value: DUST_DEPTH_RANGE },
      uDepthNear: { value: DUST_DEPTH_NEAR },
      uSpread: { value: new THREE.Vector2(DUST_SPREAD_X, DUST_SPREAD_Y) },
    },
    vertexShader: starMaterial.vertexShader,
    fragmentShader: starMaterial.fragmentShader,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    transparent: true,
  });

  const dustPoints = new THREE.Points(dustGeom, dustMaterial);
  dustPoints.frustumCulled = false;
  dustPoints.renderOrder = -8;
  root.add(dustPoints);

  // =========================================================================
  // Shooting stars: pool of bright streaks that occasionally cross the view.
  // Rendered on the bloom layer so they get a nice halo. Always at most one
  // or two visible at a time — this is about "events" in the sky, not a
  // constant rain of meteors.
  // =========================================================================
  const STREAK_MAX = 4;
  const STREAK_LENGTH = 9;
  const streakPositions = new Float32Array(STREAK_MAX * 6);
  const streakColors = new Float32Array(STREAK_MAX * 6);
  const streakGeom = new THREE.BufferGeometry();
  streakGeom.setAttribute('position', new THREE.BufferAttribute(streakPositions, 3));
  streakGeom.setAttribute('color', new THREE.BufferAttribute(streakColors, 3));
  const streakMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const streakLines = new THREE.LineSegments(streakGeom, streakMat);
  streakLines.frustumCulled = false;
  streakLines.renderOrder = -5;
  streakLines.layers.enable(1); // bloom layer — gives them a halo
  root.add(streakLines);

  const streakState = [];
  for (let i = 0; i < STREAK_MAX; i++) {
    streakState.push({ active: false });
  }
  let streakSpawnTimer = 2 + Math.random() * 3;

  function spawnStreak(slot) {
    // Appear somewhere in the mid-distance star volume.
    const startZ = -18 - Math.random() * 70;

    // Polar spawn in the outer ring — avoids the board's screen-space
    // footprint (which covers the central portion of the frame). Minimum
    // radius of 22 keeps streaks clear of the hex even at the deepest z.
    const startAngle = Math.random() * Math.PI * 2;
    const startRadius = 22 + Math.random() * 28;
    slot.x = Math.cos(startAngle) * startRadius;
    slot.y = Math.sin(startAngle) * startRadius * 0.8;
    slot.z = startZ;

    // Move tangentially (perpendicular to the radial direction). A straight
    // line tangent to a circle only ever moves *away* from the center, so
    // streaks orbit the board instead of crossing it. Bloom halo still
    // leaks across the scene, but not over the board.
    const swing = Math.random() > 0.5 ? 1 : -1;
    const moveAngle = startAngle + (swing * Math.PI) / 2;
    const speed = 55 + Math.random() * 45;
    slot.dx = Math.cos(moveAngle) * speed;
    slot.dy = Math.sin(moveAngle) * speed;
    slot.dz = 0;
    const len = Math.hypot(slot.dx, slot.dy, slot.dz) || 1;
    slot.ux = slot.dx / len;
    slot.uy = slot.dy / len;
    slot.uz = slot.dz / len;
    slot.maxLife = 0.55 + Math.random() * 0.55;
    slot.life = slot.maxLife;
    slot.brightness = 1.1 + Math.random() * 0.6;
    slot.active = true;
  }

  function updateStreaks(dt) {
    streakSpawnTimer -= dt;
    if (streakSpawnTimer <= 0) {
      const free = streakState.find((s) => !s.active);
      if (free) spawnStreak(free);
      streakSpawnTimer = 8 + Math.random() * 22;
    }
    for (let i = 0; i < STREAK_MAX; i++) {
      const s = streakState[i];
      const o = i * 6;
      if (!s.active) {
        for (let j = 0; j < 6; j++) {
          streakPositions[o + j] = 0;
          streakColors[o + j] = 0;
        }
        continue;
      }
      s.x += s.dx * dt;
      s.y += s.dy * dt;
      s.z += s.dz * dt;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        continue;
      }
      const fadeIn = Math.min((s.maxLife - s.life) / 0.08, 1);
      const fadeOut = Math.min(s.life / 0.25, 1);
      const fade = Math.max(0, Math.min(fadeIn, fadeOut));
      const b = s.brightness * fade;
      streakPositions[o + 0] = s.x;
      streakPositions[o + 1] = s.y;
      streakPositions[o + 2] = s.z;
      streakColors[o + 0] = b;
      streakColors[o + 1] = b;
      streakColors[o + 2] = b;
      streakPositions[o + 3] = s.x - s.ux * STREAK_LENGTH;
      streakPositions[o + 4] = s.y - s.uy * STREAK_LENGTH;
      streakPositions[o + 5] = s.z - s.uz * STREAK_LENGTH;
      streakColors[o + 3] = 0;
      streakColors[o + 4] = 0;
      streakColors[o + 5] = 0;
    }
    streakGeom.attributes.position.needsUpdate = true;
    streakGeom.attributes.color.needsUpdate = true;
  }

  function applyTheme(themeId = DEFAULT_THEME_ID) {
    const visuals = getThemeVisuals(themeId);
    for (let i = 0; i < nebulaMeshes.length; i++) {
      const colorsForNebula = visuals.nebulaColors[i];
      nebulaMeshes[i].material.uniforms.uColorA.value.set(...colorsForNebula.colorA);
      nebulaMeshes[i].material.uniforms.uColorB.value.set(...colorsForNebula.colorB);
    }

    const starPalette = visuals.starPalette.map((hex) => new THREE.Color(hex));
    for (let i = 0; i < STAR_COUNT; i++) {
      const color = starPalette[starPaletteIndex[i] % starPalette.length];
      const brightness = starBrightness[i];
      colors[i * 3] = color.r * brightness;
      colors[i * 3 + 1] = color.g * brightness;
      colors[i * 3 + 2] = color.b * brightness;
    }
    geom.attributes.starColor.needsUpdate = true;

    for (let i = 0; i < DUST_COUNT; i++) {
      const color = starPalette[dustPaletteIndex[i] % starPalette.length];
      const brightness = dustBrightness[i];
      dustColors[i * 3] = color.r * brightness;
      dustColors[i * 3 + 1] = color.g * brightness;
      dustColors[i * 3 + 2] = color.b * brightness;
    }
    dustGeom.attributes.starColor.needsUpdate = true;
  }

  applyTheme();

  let lastT = null;
  function update(timeMs) {
    const t = timeMs * 0.001;
    const dt = lastT === null ? 0 : Math.min(t - lastT, 0.1);
    lastT = t;
    starMaterial.uniforms.uTime.value = t;
    dustMaterial.uniforms.uTime.value = t;
    for (const n of nebulaMeshes) {
      const phase = ((n.initialPhase + t * NEB_SPEED) % NEB_RANGE + NEB_RANGE) % NEB_RANGE;
      n.mesh.position.z = NEB_Z_FAR + phase;
      const fadeIn = Math.min(phase / NEB_FADE_BAND, 1);
      const fadeOut = Math.min((NEB_RANGE - phase) / NEB_FADE_BAND, 1);
      n.material.uniforms.uOpacity.value = fadeIn * fadeOut;
      n.material.uniforms.uTime.value = t;
    }
    updateStreaks(dt);
  }

  return { update, setTheme: applyTheme };
}
