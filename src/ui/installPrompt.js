const DISMISS_KEY = 'rotatron.installDismissedAt';
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  const ua = window.navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isMobile() {
  if (window.navigator.userAgentData?.mobile) return true;
  if (isIOS()) return true;
  const ua = window.navigator.userAgent || '';
  return /Android.*Mobile|Mobile.*Android|Android.*Tablet/i.test(ua);
}

function wasRecentlyDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function rememberDismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
}

export function createInstallPrompt({ container }) {
  if (isStandalone() || wasRecentlyDismissed() || !isMobile()) return null;

  let deferredPrompt = null;
  let banner = null;

  function buildBanner({ mode }) {
    const el = document.createElement('div');
    el.className = 'install-banner';
    const inner =
      mode === 'ios'
        ? `
            <div class="install-banner-text">
              <strong>INSTALL ROTATRON</strong>
              <span>Tap <span class="install-share">&#x2B06;</span> then <em>Add to Home Screen</em> for fullscreen play.</span>
            </div>
            <button class="install-banner-dismiss" data-action="dismiss" aria-label="Dismiss">&times;</button>
          `
        : `
            <div class="install-banner-text">
              <strong>INSTALL ROTATRON</strong>
              <span>Play fullscreen, works offline.</span>
            </div>
            <button class="install-banner-btn" data-action="install">INSTALL</button>
            <button class="install-banner-dismiss" data-action="dismiss" aria-label="Dismiss">&times;</button>
          `;
    el.innerHTML = inner;
    return el;
  }

  function mount(mode) {
    if (banner) return;
    banner = buildBanner({ mode });
    container.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('visible'));

    banner.querySelector('[data-action="dismiss"]').addEventListener('click', () => {
      rememberDismiss();
      dismiss();
    });

    if (mode === 'android') {
      banner.querySelector('[data-action="install"]').addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        try {
          await deferredPrompt.userChoice;
        } catch {
          /* ignore */
        }
        deferredPrompt = null;
        dismiss();
      });
    }
  }

  function dismiss() {
    if (!banner) return;
    banner.classList.remove('visible');
    const el = banner;
    banner = null;
    setTimeout(() => el.remove(), 320);
  }

  if (isIOS()) {
    mount('ios');
  } else {
    window.addEventListener(
      'beforeinstallprompt',
      (e) => {
        e.preventDefault();
        deferredPrompt = e;
        mount('android');
      },
      { once: true },
    );
  }

  window.addEventListener('appinstalled', () => {
    rememberDismiss();
    dismiss();
  });

  return { dismiss };
}
