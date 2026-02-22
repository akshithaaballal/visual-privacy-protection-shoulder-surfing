let overlayEl;
let toastEl;

function ensureOverlay() {
  if (!overlayEl) {
    overlayEl = document.createElement('div');
    overlayEl.id = 'pg-blur-overlay';
    Object.assign(overlayEl.style, {
      position: 'fixed',
      inset: '0',
      backdropFilter: 'blur(18px)',
      WebkitBackdropFilter: 'blur(18px)',
      background: 'rgba(0,0,0,0.05)',
      zIndex: 2147483647,
      pointerEvents: 'none',
      display: 'none'
    });
    document.documentElement.appendChild(overlayEl);
  }
}

function ensureToast() {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'pg-toast';
    Object.assign(toastEl.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: 2147483647,
      padding: '12px 14px',
      background: '#111',
      color: '#fff',
      borderRadius: '8px',
      fontFamily: 'system-ui, Arial, sans-serif',
      display: 'none',
      boxShadow: '0 4px 16px rgba(0,0,0,.3)'
    });
    toastEl.textContent = 'Privacy Guard: Someone is watching.';
    document.documentElement.appendChild(toastEl);
  }
}

function showBlur(show) {
  ensureOverlay();
  overlayEl.style.display = show ? 'block' : 'none';
}

function showToast() {
  ensureToast();
  toastEl.style.display = 'block';
  setTimeout(() => (toastEl.style.display = 'none'), 2500);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'PG_TRIGGER') {
    // Decide what to show based on payload.mode (both/blur/popup)
    const mode = msg?.payload?.actionMode || 'both';
    if (mode === 'both' || mode === 'blur') showBlur(true);
    if (mode === 'both' || mode === 'popup') showToast();
    // Auto-unblur after a short grace if no repeated triggers
    clearTimeout(window.__pg_unblurTO);
    window.__pg_unblurTO = setTimeout(() => showBlur(false), 6000);
  }
});
