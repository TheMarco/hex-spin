import { NEON, darkVariant } from '../utils/colors.js';

const M = NEON.magenta;
const O = NEON.orange;
const Y = NEON.yellow;
const G = NEON.green;
const C = NEON.cyan;
const P = NEON.purple;

function hexSvg(colors, opts = {}) {
  const cx = 50;
  const cy = 50;
  const r = 38;
  const corners = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90);
    corners.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  let triangles = '';
  for (let i = 0; i < 6; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 6];
    const color = colors[i];
    const fill = color ? darkVariant(color) : '#0a0a0f';
    const stroke = color || '#3a3a4a';
    triangles += `<polygon points="${cx.toFixed(1)},${cy.toFixed(1)} ${a[0].toFixed(1)},${a[1].toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round" />`;
  }
  const markerColor = opts.markerColor || '#ffffff';
  const markerOuter = opts.markerOuter || 'rgba(255,255,255,0.55)';
  const markerR = opts.markerR ?? 4.2;
  const marker = `<circle cx="${cx}" cy="${cy}" r="${markerR + 2.5}" fill="none" stroke="${markerOuter}" stroke-width="1.2" /><circle cx="${cx}" cy="${cy}" r="${markerR}" fill="${markerColor}" />`;
  return `<svg viewBox="0 0 100 100" class="howto-hex">${triangles}${marker}</svg>`;
}

function tinyTri(color) {
  return `<svg viewBox="0 0 24 22" class="howto-tri"><polygon points="12,2 22,20 2,20" fill="${darkVariant(color)}" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" /></svg>`;
}

export function createHowToPlay({ container, onBack, onStart }) {
  const overlay = document.createElement('div');
  overlay.className = 'howto-screen';
  overlay.innerHTML = `
    <div class="howto-scroll">
      <div class="howto-top-actions">
        <button class="howto-back-top" data-action="back">◀ BACK</button>
      </div>
      <header class="howto-header">
        <div class="howto-kicker">[ FIELD MANUAL // v1.0 ]</div>
        <h1 class="howto-title">HOW TO PLAY</h1>
        <div class="howto-tag">Spin the ring. Match the hex. Don't let the heat die.</div>
      </header>

      <section class="howto-section">
        <div class="howto-card-head">
          <span class="howto-num">01</span>
          <h2>THE GOAL</h2>
        </div>
        <p class="howto-body">
          The board is a giant hex made of triangles. Wherever six triangles of the
          <em>same color</em> meet around a vertex, that hex <strong>shatters</strong>
          for points, refills with new colors, and pumps fresh heat into your reactor.
        </p>
        <div class="howto-demo">
          <div class="howto-step">
            ${hexSvg([M, M, C, M, M, M], { markerColor: '#fff' })}
            <div class="howto-step-label">5 of 6 match</div>
          </div>
          <div class="howto-arrow">▶</div>
          <div class="howto-step">
            ${hexSvg([M, M, M, M, M, M], { markerColor: M, markerOuter: M })}
            <div class="howto-step-label">SPIN → all 6 match</div>
          </div>
          <div class="howto-arrow howto-arrow-pop">✦</div>
          <div class="howto-step">
            ${hexSvg([Y, C, M, P, C, Y], { markerColor: '#fff' })}
            <div class="howto-step-label">SHATTER + refill</div>
          </div>
        </div>
      </section>

      <section class="howto-section">
        <div class="howto-card-head">
          <span class="howto-num">02</span>
          <h2>THE SPIN</h2>
        </div>
        <p class="howto-body">
          Tap any glowing <strong>vertex dot</strong> on the board. The six triangles
          around it rotate <strong>60° clockwise</strong>, carrying their colors
          with them. That's your only move &mdash; everything else is consequence.
        </p>
        <div class="howto-demo">
          <div class="howto-step">
            ${hexSvg([M, Y, C, P, G, O], { markerColor: '#fff' })}
            <div class="howto-step-label">BEFORE</div>
          </div>
          <div class="howto-arrow howto-arrow-spin">⟳</div>
          <div class="howto-step">
            ${hexSvg([O, M, Y, C, P, G], { markerColor: '#fff' })}
            <div class="howto-step-label">AFTER (60° CW)</div>
          </div>
        </div>
        <p class="howto-note">
          <strong>Edge vertices use phantom colors.</strong> Spinning along the boundary can
          pull <em>new</em> colors in from outside the playable hex &mdash; great for breaking
          out of stuck patterns.
        </p>
      </section>

      <section class="howto-section">
        <div class="howto-card-head">
          <span class="howto-num">03</span>
          <h2>CASCADES</h2>
        </div>
        <p class="howto-body">
          When a hex shatters, its triangles refill with random new colors.
          If those new colors complete <em>another</em> hex &mdash; or several &mdash;
          a <strong>cascade</strong> fires. Each chain depth doubles the score. Big chains
          are where runs are won.
        </p>
        <div class="howto-cascade-bars">
          <div class="howto-bar"><span class="howto-bar-label">×1</span><span class="howto-bar-fill" style="width:8%; background:${C}"></span><span class="howto-bar-val">100 base</span></div>
          <div class="howto-bar"><span class="howto-bar-label">×2</span><span class="howto-bar-fill" style="width:16%; background:${Y}"></span><span class="howto-bar-val">200 / hex</span></div>
          <div class="howto-bar"><span class="howto-bar-label">×3</span><span class="howto-bar-fill" style="width:32%; background:${O}"></span><span class="howto-bar-val">400 / hex</span></div>
          <div class="howto-bar"><span class="howto-bar-label">×4</span><span class="howto-bar-fill" style="width:64%; background:${M}"></span><span class="howto-bar-val">800 / hex</span></div>
        </div>
      </section>

      <section class="howto-section">
        <div class="howto-card-head">
          <span class="howto-num">04</span>
          <h2>HEAT MANAGEMENT</h2>
        </div>
        <p class="howto-body">
          The bar at the top is your <strong>heat</strong> &mdash; the run timer.
          It drains constantly. Empty = game over. Heat refills when hexes shatter,
          and the gain is <strong>quadratic</strong>: clearing two hexes at once is
          four times the heat of clearing one.
        </p>
        <div class="howto-heatbar">
          <div class="howto-heatbar-track">
            <div class="howto-heatbar-fill"></div>
          </div>
          <div class="howto-heatbar-legend">
            <span><span class="howto-dot" style="background:${C}"></span> Drain &minus;0.7%/sec (faster each phase)</span>
            <span><span class="howto-dot" style="background:${Y}"></span> Each clear refills (1 hex = +18%, 2 hexes = +72%, 3 = +162%)</span>
            <span><span class="howto-dot" style="background:${O}"></span> Phase advance bonus +40%</span>
          </div>
        </div>
      </section>

      <section class="howto-section">
        <div class="howto-card-head">
          <span class="howto-num">05</span>
          <h2>SCORING</h2>
        </div>
        <p class="howto-body">
          Every cleared hex pays this formula. The multipliers <strong>stack</strong>.
        </p>
        <div class="howto-formula">
          <span class="howto-formula-base">100</span>
          <span class="howto-formula-x">×</span>
          <span class="howto-mult-tag" style="--mc:${P}">PHASE</span>
          <span class="howto-formula-x">×</span>
          <span class="howto-mult-tag" style="--mc:${C}">CASCADE</span>
          <span class="howto-formula-x">×</span>
          <span class="howto-mult-tag" style="--mc:${Y}">MULTI</span>
          <span class="howto-formula-x">×</span>
          <span class="howto-mult-tag" style="--mc:${O}">FRESH</span>
          <span class="howto-formula-x">×</span>
          <span class="howto-mult-tag" style="--mc:${M}">BONUS</span>
        </div>
        <div class="howto-mult-grid">
          <div class="howto-mult" style="--mc:${P}">
            <div class="howto-mult-name">PHASE</div>
            <div class="howto-mult-desc">Doubles each phase: ×1 / ×2 / ×4 / ×8</div>
          </div>
          <div class="howto-mult" style="--mc:${C}">
            <div class="howto-mult-name">CASCADE</div>
            <div class="howto-mult-desc">Doubles each chain depth: ×1 / ×2 / ×4 / ×8&hellip;</div>
          </div>
          <div class="howto-mult" style="--mc:${Y}">
            <div class="howto-mult-name">MULTI</div>
            <div class="howto-mult-desc">N hexes in one wave → each pays N×. Two at once = 4× per hex.</div>
          </div>
          <div class="howto-mult" style="--mc:${O}">
            <div class="howto-mult-name">FRESH</div>
            <div class="howto-mult-desc">×2.0 right after a clear, decays to ×1.1 by the 10th spin. Locked at the start of each cascade.</div>
          </div>
          <div class="howto-mult" style="--mc:${M}">
            <div class="howto-mult-name">BONUS COLOR</div>
            <div class="howto-mult-desc">×2 extra when the cleared hex matches the <em>newest</em> phase color.</div>
          </div>
        </div>
      </section>

      <section class="howto-section">
        <div class="howto-card-head">
          <span class="howto-num">06</span>
          <h2>PHASES</h2>
        </div>
        <p class="howto-body">
          The palette <strong>grows</strong> as you clear hexes. Each new phase swaps the
          theme and music, but the board you built stays intact. The fresh bonus
          color starts seeping in through future refills and edge inflow.
        </p>
        <div class="howto-phases">
          <div class="howto-phase">
            <div class="howto-phase-num" style="color:${P}">P1</div>
            <div class="howto-phase-name">ARCADE NEON</div>
            <div class="howto-phase-tris">${tinyTri(M)}${tinyTri(P)}${tinyTri(C)}</div>
            <div class="howto-phase-thresh">Start</div>
          </div>
          <div class="howto-phase">
            <div class="howto-phase-num" style="color:${Y}">P2</div>
            <div class="howto-phase-name">TOXIC REACTOR</div>
            <div class="howto-phase-tris">${tinyTri(M)}${tinyTri(P)}${tinyTri(C)}<span class="howto-phase-new">${tinyTri(Y)}</span></div>
            <div class="howto-phase-thresh">11 hexes</div>
          </div>
          <div class="howto-phase">
            <div class="howto-phase-num" style="color:${G}">P3</div>
            <div class="howto-phase-name">DEEP VOID</div>
            <div class="howto-phase-tris">${tinyTri(M)}${tinyTri(P)}${tinyTri(C)}${tinyTri(Y)}<span class="howto-phase-new">${tinyTri(G)}</span></div>
            <div class="howto-phase-thresh">26 hexes</div>
          </div>
          <div class="howto-phase">
            <div class="howto-phase-num" style="color:${O}">P4</div>
            <div class="howto-phase-name">SOLAR BURN</div>
            <div class="howto-phase-tris">${tinyTri(M)}${tinyTri(P)}${tinyTri(C)}${tinyTri(Y)}${tinyTri(G)}<span class="howto-phase-new">${tinyTri(O)}</span></div>
            <div class="howto-phase-thresh">51 hexes</div>
          </div>
        </div>
      </section>

      <section class="howto-section">
        <div class="howto-card-head">
          <span class="howto-num">07</span>
          <h2>PRO TIPS</h2>
        </div>
        <ul class="howto-tips">
          <li>
            <span class="howto-tip-mark" style="--mc:${Y}">▲</span>
            <span><strong>Stage multi-clears.</strong> Two hexes in one wave pays 4× the base of clearing them separately. Three pays 9×. Always look for the double.</span>
          </li>
          <li>
            <span class="howto-tip-mark" style="--mc:${O}">★</span>
            <span><strong>Hunt the bonus color.</strong> The newest phase color is worth 2× extra. When you see it bunching up, prioritize it.</span>
          </li>
          <li>
            <span class="howto-tip-mark" style="--mc:${C}">⚡</span>
            <span><strong>Spin fast.</strong> The freshness multiplier rewards momentum &mdash; don't stall after a clear or you bleed bonus.</span>
          </li>
          <li>
            <span class="howto-tip-mark" style="--mc:${M}">◆</span>
            <span><strong>Use the edges.</strong> Boundary vertices have hidden phantom colors. A border spin can drag in a fresh color you couldn't reach otherwise.</span>
          </li>
          <li>
            <span class="howto-tip-mark" style="--mc:${P}">⏸</span>
            <span><strong>Press P to pause.</strong> Heat freezes while paused &mdash; perfect for planning a setup without losing the run.</span>
          </li>
          <li>
            <span class="howto-tip-mark" style="--mc:${G}">↻</span>
            <span><strong>Cascades are king.</strong> A 4-deep chain pays 8× per hex. Setups that load the board for chain refills outscore single clears every time.</span>
          </li>
        </ul>
      </section>

      <section class="howto-section">
        <div class="howto-card-head">
          <span class="howto-num">08</span>
          <h2>INSTALL AS APP</h2>
        </div>
        <p class="howto-body">
          Rotatron can be <strong>installed</strong> on your phone, tablet, or desktop.
          It runs <strong>fullscreen</strong> with no browser chrome, launches from your home screen
          or dock, and keeps working offline after the first load.
        </p>
        <div class="howto-install-grid">
          <div class="howto-install">
            <div class="howto-install-head" style="--mc:${C}">
              <span class="howto-install-tag">iOS</span>
              <span class="howto-install-sub">Safari</span>
            </div>
            <ol class="howto-install-steps">
              <li>Tap the <strong>Share</strong> icon <span class="howto-kbd">&#x2B06;</span> at the bottom.</li>
              <li>Scroll down, tap <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong>. Launch from your home screen for fullscreen play.</li>
            </ol>
          </div>
          <div class="howto-install">
            <div class="howto-install-head" style="--mc:${G}">
              <span class="howto-install-tag">Android</span>
              <span class="howto-install-sub">Chrome</span>
            </div>
            <ol class="howto-install-steps">
              <li>Tap the <strong>&#8942; menu</strong> in the top-right.</li>
              <li>Choose <strong>Install app</strong> (or <strong>Add to Home screen</strong>).</li>
              <li>Confirm <strong>Install</strong>. Launch from your home screen for fullscreen play.</li>
            </ol>
          </div>
          <div class="howto-install">
            <div class="howto-install-head" style="--mc:${Y}">
              <span class="howto-install-tag">Desktop</span>
              <span class="howto-install-sub">Chrome / Edge</span>
            </div>
            <ol class="howto-install-steps">
              <li>Click the <strong>install</strong> icon in the address bar.</li>
              <li>Or open the <strong>&#8942; menu</strong> → <strong>Install Rotatron&hellip;</strong></li>
              <li>Launches in its own window, like a native app.</li>
            </ol>
          </div>
        </div>
      </section>

      <div class="howto-footer-actions">
        <button class="howto-btn" data-action="back">◀ BACK</button>
        <button class="howto-btn howto-btn-primary" data-action="start">START GAME ▶</button>
      </div>
    </div>
  `;

  container.appendChild(overlay);
  // Reset scroll on open
  requestAnimationFrame(() => {
    const scroller = overlay.querySelector('.howto-scroll');
    if (scroller) scroller.scrollTop = 0;
  });

  function close(handler) {
    overlay.classList.add('dismissed');
    setTimeout(() => overlay.remove(), 320);
    handler?.();
  }

  overlay.querySelectorAll('[data-action="back"]').forEach((el) =>
    el.addEventListener('click', () => close(onBack)),
  );
  overlay.querySelector('[data-action="start"]').addEventListener('click', () => close(onStart));

  return { close: () => close() };
}
