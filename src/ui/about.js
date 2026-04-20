export function createAbout({ container, onBack }) {
  const overlay = document.createElement('div');
  overlay.className = 'about-screen';
  overlay.innerHTML = `
    <div class="about-scroll">
      <header class="about-header">
        <div class="about-kicker">[ TRANSMISSION // FROM THE DEV ]</div>
        <h1 class="about-title">ABOUT</h1>
        <div class="about-tag">A small story about Rotatron &amp; the person behind it.</div>
      </header>

      <section class="about-section">
        <div class="about-card-head">
          <span class="about-num">01</span>
          <h2>WHO MADE THIS</h2>
        </div>
        <p class="about-body">
          Hi &mdash; I'm <strong>Marco van Hylckama Vlieg</strong>. I build small, strange games
          under the banner of <em>AI &amp; Design Game Studios</em>. I grew up on arcades,
          demoscene intros, and that particular feeling when a puzzle finally clicks.
          I make games to chase that feeling and share it.
        </p>
        <p class="about-body">
          Making games has been a <strong>childhood dream</strong> of mine for as long as I
          can remember &mdash; the kind of dream that never really goes away, it just waits
          for you to be ready. Each one I ship is also a <strong>portfolio piece</strong>: a
          small, sharp artifact I can point at and say &ldquo;here, this is what I can do.&rdquo;
        </p>
        <p class="about-body">
          Rotatron is a <strong>fully original idea</strong> &mdash; no clone, no reskin. One tap,
          six triangles rotate, colors carry around the ring, and if you line up a hex it
          shatters. Everything else in the game grew out of that single rule.
        </p>
      </section>

      <section class="about-section">
        <div class="about-card-head">
          <span class="about-num">02</span>
          <h2>A LABOR OF LOVE</h2>
        </div>
        <p class="about-body">
          Rotatron is <strong>free</strong>. No ads, no trackers, no paywall, no &ldquo;energy&rdquo;
          meter that wants your wallet. I made it because I wanted it to exist, and because
          I hoped someone else out there would love it too.
        </p>
        <p class="about-body">
          If the game hooked you &mdash; if you found yourself chasing cascades at 1am or
          grinning when the board finally detonated &mdash; the nicest thing you can do is
          drop a tip on Ko&#8209;fi. Every coffee helps me keep making weird little things
          like this one.
        </p>
        <div class="about-donate">
          <a class="about-donate-btn" href="https://ko-fi.com/aianddesign" target="_blank" rel="noopener noreferrer">
            <span class="about-donate-icon">\u2665</span>
            <span class="about-donate-text">SUPPORT ON KO&#8209;FI</span>
            <span class="about-donate-url">ko-fi.com/aianddesign</span>
          </a>
        </div>
      </section>

      <section class="about-section">
        <div class="about-card-head">
          <span class="about-num">03</span>
          <h2>MORE OF MY WORK</h2>
        </div>
        <p class="about-body">
          Rotatron is one piece of a bigger picture. If you want to see the
          <em>other</em> games I've built &mdash; along with the rest of what I'm up to
          as a designer, developer, and AI tinkerer &mdash; everything lives on my
          personal site.
        </p>
        <div class="about-donate">
          <a class="about-donate-btn about-site-btn" href="https://ai-created.com" target="_blank" rel="noopener noreferrer">
            <span class="about-donate-icon">\u25C6</span>
            <span class="about-donate-text">VISIT MY SITE</span>
            <span class="about-donate-url">ai-created.com</span>
          </a>
        </div>
      </section>

      <section class="about-section">
        <div class="about-card-head">
          <span class="about-num">04</span>
          <h2>HOW IT WAS BUILT</h2>
        </div>
        <p class="about-body">
          Rotatron runs on <strong>three.js</strong> &mdash; custom shaders for the nebula and
          starfield, selective bloom on the outlines and particles, and a tiny amount of
          board math that turned out to be much trickier than I expected.
        </p>
        <p class="about-body">
          It was also co&#8209;written with AI copilots: <strong>Claude Code</strong> and
          <strong>OpenAI Codex</strong> were in the loop for a lot of the plumbing,
          refactors, and late&#8209;night rubber&#8209;ducking. The design, the feel, and the
          final calls are mine &mdash; the robots just helped me type faster.
        </p>
        <div class="about-stack">
          <span class="about-chip">three.js</span>
          <span class="about-chip">Vite</span>
          <span class="about-chip">GLSL</span>
          <span class="about-chip">WebAudio</span>
          <span class="about-chip">Claude Code</span>
          <span class="about-chip">OpenAI Codex</span>
        </div>
      </section>

      <section class="about-section">
        <div class="about-card-head">
          <span class="about-num">05</span>
          <h2>THANK YOU</h2>
        </div>
        <p class="about-body">
          Seriously &mdash; thank you for playing. You could be anywhere on the internet right
          now, and you're here, spinning hexes. That still feels a little bit magical to me.
        </p>
        <p class="about-body about-signoff">
          &mdash; Marco &nbsp;<span class="about-sign-mark">\u25C6</span>
        </p>
      </section>

      <div class="about-footer-actions">
        <button class="about-btn" data-action="back">\u25C0 BACK</button>
      </div>
    </div>
  `;

  container.appendChild(overlay);
  requestAnimationFrame(() => {
    const scroller = overlay.querySelector('.about-scroll');
    if (scroller) scroller.scrollTop = 0;
  });

  function close(handler) {
    overlay.classList.add('dismissed');
    setTimeout(() => overlay.remove(), 320);
    handler?.();
  }

  overlay.querySelector('[data-action="back"]').addEventListener('click', () => close(onBack));

  return { close: () => close() };
}
