// offscreen.js - asks the background for config and runs FaceDetector loop

const DEFAULTS = {
  enabled: true,
  holdSeconds: 10,
  eyeOpenThreshold: 0.35,
  maxYawDegrees: 20,
  actionMode: 'both'
};

let cfg = { ...DEFAULTS };
const videoEl = document.getElementById('pg-video');
let detector = null;
let running = false;
let stableMs = 0;
let lastSeenTime = 0;

// Request config from background (background uses chrome.storage)
function loadCfg() {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'GET_CFG' }, (response) => {
        // If response undefined, fallback to DEFAULTS
        cfg = { ...DEFAULTS, ...(response || {}) };
        resolve(cfg);
      });
    } catch (e) {
      // If messaging fails, fallback
      cfg = { ...DEFAULTS };
      resolve(cfg);
    }
  });
}

// Listen for config push from background (when user changes settings)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'PG_CFG_PUSH') {
    loadCfg().catch(() => {});
  }
});

async function initCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480 }
  });
  videoEl.srcObject = stream;
  await videoEl.play();
}

async function initDetector() {
  if (!('FaceDetector' in window)) {
    console.error('FaceDetector API not supported in this browser.');
    return null;
  }
  return new FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
}

function hasValidFace(faces) {
  // Basic rule: any detected face qualifies. We will extend later for eye/open/gaze logic.
  if (!faces || faces.length === 0) return false;
  return true;
}

async function start() {
  await loadCfg();
  if (!cfg.enabled) {
    console.log('Offscreen detection disabled via config.');
    return;
  }

  try {
    await initCamera();
  } catch (e) {
    console.error('Camera init failed:', e);
    return;
  }

  detector = await initDetector();
  if (!detector) {
    console.error('No detector available; stopping offscreen.');
    return;
  }

  running = true;
  requestAnimationFrame(loop);
}

async function loop() {
  if (!running || videoEl.readyState < 2) {
    requestAnimationFrame(loop);
    return;
  }

  let faces = [];
  try {
    faces = await detector.detect(videoEl);
  } catch (e) {
    // detection can fail if camera not permitted
    console.error('Face detection error:', e);
  }

  const now = performance.now();
  const present = hasValidFace(faces);

  if (present) {
    if (lastSeenTime === 0) lastSeenTime = now;
    stableMs = now - lastSeenTime;
  } else {
    lastSeenTime = 0;
    stableMs = 0;
  }

  if (stableMs >= (cfg.holdSeconds || DEFAULTS.holdSeconds) * 1000) {
    // Send alert to background which will relay to active tab
    chrome.runtime.sendMessage({
      type: 'PG_ALERT',
      payload: { actionMode: cfg.actionMode || DEFAULTS.actionMode }
    });
    // Reset timers so we don't spam alerts
    lastSeenTime = 0;
    stableMs = 0;
  }

  requestAnimationFrame(loop);
}

// Start when the offscreen document loads
start();
