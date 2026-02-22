// detector.js (full file — copy & replace)
// Multi-strategy detector with robust filtering, overlay debug, and status output.
// - Native FaceDetector preferred
// - Fallback to MediaPipe (adapts to different export shapes)
// - Filters: MIN_SCORE, MIN_AREA_RATIO, IOU dedupe
// - Shows overlay of detected boxes and status text
// - Sends PG_ALERT when 2+ distinct faces hold for cfg.holdSeconds

const DEFAULTS = {
  enabled: true,
  holdSeconds: 10,
  actionMode: 'both'
};

let cfg = { ...DEFAULTS };
const statusEl = document.getElementById('status');
const videoEl = document.getElementById('pg-video');

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
  console.log('[PG detector]', text);
}

function loadCfg() {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'GET_CFG' }, (response) => {
        cfg = { ...DEFAULTS, ...(response || {}) };
        resolve(cfg);
      });
    } catch (e) {
      cfg = { ...DEFAULTS };
      resolve(cfg);
    }
  });
}

chrome.runtime.onMessage.addListener((m) => {
  if (m?.type === 'PG_CFG_PUSH') loadCfg().catch(()=>{});
});

// send alert to background
function sendAlert() {
  chrome.runtime.sendMessage({
    type: 'PG_ALERT',
    payload: { actionMode: cfg.actionMode || DEFAULTS.actionMode }
  });
}

// frame bookkeeping for holdSeconds rule
let lastSeenTime = 0;
let stableMs = 0;
function frameHandler(facesCount) {
  const now = performance.now();
  const present = (facesCount >= 2);

  if (present) {
    if (lastSeenTime === 0) lastSeenTime = now;
    stableMs = now - lastSeenTime;
    setStatus(`Faces: ${facesCount} — stable ${Math.round(stableMs/1000)}s / ${cfg.holdSeconds}s`);
  } else {
    lastSeenTime = 0;
    stableMs = 0;
    setStatus(`Faces: ${facesCount} — waiting for 2+ faces`);
  }

  if (stableMs >= (cfg.holdSeconds || DEFAULTS.holdSeconds) * 1000) {
    setStatus(`ALERT: ${facesCount} faces present for ${cfg.holdSeconds}s — sending PG_ALERT`);
    sendAlert();
    lastSeenTime = 0;
    stableMs = 0;
  }
}

/* -------------------------
   Native FaceDetector attempt
   ------------------------- */
async function tryNative() {
  if (!('FaceDetector' in window)) {
    setStatus('Native FaceDetector: NOT available.');
    return false;
  }

  setStatus('Native FaceDetector: available — requesting camera...');
  let detector;
  try {
    detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 6 });
  } catch (e) {
    setStatus('Native FaceDetector: construction failed.');
    console.error(e);
    return false;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    videoEl.srcObject = stream;
    await videoEl.play();
  } catch (e) {
    setStatus('Native FaceDetector: camera access denied/failed.');
    console.error(e);
    return false;
  }

  setStatus('Native FaceDetector running — counting faces...');
  async function loop() {
    if (!videoEl || videoEl.readyState <= 3) { requestAnimationFrame(loop); return; }
    try {
      const faces = await detector.detect(videoEl);
      // detector.detect returns array of FaceDetectionResult-like objects; count unique boxes via simple dedupe
      const count = (faces && faces.length) || 0;
      frameHandler(count);
    } catch (err) {
      console.error('native detect error', err);
      setStatus('Native FaceDetector: runtime error.');
    }
    requestAnimationFrame(loop);
  }
  loop();
  return true;
}

/* -------------------------
   MediaPipe adaptive + robust handler
   ------------------------- */

// Helper: extract box from various MediaPipe detection shapes
function extractBox(det, videoW, videoH) {
  if (!det) return null;
  if (det.boundingBox) {
    const b = det.boundingBox;
    if ('xCenter' in b && 'yCenter' in b && 'width' in b && 'height' in b) {
      const x = (b.xCenter - b.width/2) * videoW;
      const y = (b.yCenter - b.height/2) * videoH;
      return { x, y, w: b.width * videoW, h: b.height * videoH };
    }
    if ('xMin' in b && 'yMin' in b && 'width' in b && 'height' in b) {
      return { x: b.xMin * videoW, y: b.yMin * videoH, w: b.width * videoW, h: b.height * videoH };
    }
    if ('originX' in b && 'originY' in b && 'width' in b && 'height' in b) {
      return { x: b.originX * videoW, y: b.originY * videoH, w: b.width * videoW, h: b.height * videoH };
    }
  }
  if (det.locationData && det.locationData.relativeBoundingBox) {
    const rb = det.locationData.relativeBoundingBox;
    return { x: rb.xmin * videoW, y: rb.ymin * videoH, w: rb.width * videoW, h: rb.height * videoH };
  }
  if (det.box) {
    const b = det.box;
    if ('x' in b && 'y' in b && 'width' in b && 'height' in b) {
      return { x: b.x * videoW, y: b.y * videoH, w: b.width * videoW, h: b.height * videoH };
    }
  }
  // fallback null
  return null;
}

function iou(a, b) {
  const ax1 = a.x, ay1 = a.y, ax2 = a.x + a.w, ay2 = a.y + a.h;
  const bx1 = b.x, by1 = b.y, bx2 = b.x + b.w, by2 = b.y + b.h;
  const ix1 = Math.max(ax1, bx1), iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1), ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const union = (a.w * a.h) + (b.w * b.h) - inter;
  return union > 0 ? inter / union : 0;
}

// ensure overlay canvas exists (for debug)
function ensureOverlay() {
  let overlayCanvas = document.getElementById('pg-overlay-canvas');
  if (!overlayCanvas) {
    overlayCanvas = document.createElement('canvas');
    overlayCanvas.id = 'pg-overlay-canvas';
    overlayCanvas.style.position = 'absolute';
    overlayCanvas.style.right = '8px';
    overlayCanvas.style.top = '32px';
    overlayCanvas.style.width = '220px';
    overlayCanvas.style.height = '165px';
    overlayCanvas.style.zIndex = '9999';
    overlayCanvas.style.background = 'rgba(0,0,0,0.0)';
    overlayCanvas.width = 320;
    overlayCanvas.height = 240;
    document.body.appendChild(overlayCanvas);
  }
  return overlayCanvas;
}

async function tryMediaPipe() {
  // check that FaceDetection global exists
  if (typeof FaceDetection === 'undefined') {
    setStatus('MediaPipe: face_detection.js not loaded (FaceDetection undefined).');
    return false;
  }

  // determine constructor form
  let FDClass = null;
  if (FaceDetection && FaceDetection.FaceDetection) {
    FDClass = FaceDetection.FaceDetection;
    setStatus('MediaPipe: using FaceDetection.FaceDetection constructor.');
  } else if (typeof FaceDetection === 'function') {
    FDClass = FaceDetection;
    setStatus('MediaPipe: using FaceDetection (function exported directly).');
  } else {
    setStatus('MediaPipe: unknown FaceDetection export shape.');
    console.warn('FaceDetection global shape:', typeof FaceDetection, !!(FaceDetection && FaceDetection.FaceDetection));
    return false;
  }

  // instantiate
  let fd;
  try {
    fd = new FDClass({
      locateFile: (file) => chrome.runtime.getURL('libs/' + file)
    });
  } catch (e) {
    console.error('MediaPipe: constructor failed', e);
    setStatus('MediaPipe: failed to construct instance.');
    return false;
  }

  // configure
  try {
    if (fd.setOptions) {
      // stronger threshold to avoid weak detections
      fd.setOptions({ model: 'short_range', minDetectionConfidence: 0.75 });
    }
  } catch (e) {
    console.warn('MediaPipe: setOptions warning', e);
  }

  // prepare overlay
  const overlayCanvas = ensureOverlay();
  const octx = overlayCanvas.getContext('2d');

  // param tuning (tweak if needed)
  const MIN_SCORE = 0.78;
  const IOU_THRESHOLD = 0.45;
  const MIN_AREA_RATIO = 0.02; // box must be >= 2% of video area

  // onResults handler (robust filtering + dedupe + overlay)
  fd.onResults((results) => {
    try {
      const detections = results?.detections || [];
      const videoW = videoEl.videoWidth || videoEl.clientWidth || 640;
      const videoH = videoEl.videoHeight || videoEl.clientHeight || 480;
      const videoArea = Math.max(1, videoW * videoH);

      const mapped = detections.map(d => {
        const score = (d.score && d.score.length) ? d.score[0] : (d.score || 1.0);
        const box = extractBox(d, videoW, videoH);
        return { raw: d, score: (typeof score === 'number' ? score : 1.0), box };
      }).filter(x => x.box !== null && x.score >= MIN_SCORE);

      // filter tiny boxes
      const filtered = mapped.filter(m => {
        const area = m.box.w * m.box.h;
        return (area / videoArea) >= MIN_AREA_RATIO;
      });

      // sort desc by score
      filtered.sort((a,b) => b.score - a.score);

      // greedy dedupe by IoU
      const accepted = [];
      for (const m of filtered) {
        let dup = false;
        for (const a of accepted) {
          if (iou(a.box, m.box) > IOU_THRESHOLD) { dup = true; break; }
        }
        if (!dup) accepted.push(m);
      }

      const uniqueCount = accepted.length;

      // draw overlay (scaled preview)
      const ow = overlayCanvas.width, oh = overlayCanvas.height;
      octx.clearRect(0,0,ow,oh);
      const scale = Math.min(ow / videoW, oh / videoH);
      octx.strokeStyle = 'lime';
      octx.lineWidth = 2;
      octx.font = '12px sans-serif';
      for (let i=0;i<accepted.length;i++){
        const b = accepted[i].box;
        octx.strokeRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
        octx.fillStyle = 'lime';
        octx.fillText((accepted[i].score||0).toFixed(2), Math.max(0, b.x * scale), Math.max(12, b.y * scale + 12));
      }

      // status and decision
      setStatus(`Faces (unique): ${uniqueCount}  — raw detections: ${detections.length}`);
      frameHandler(uniqueCount);
    } catch (e) {
      console.error('onResults robust error', e);
      frameHandler((results && results.detections && results.detections.length) || 0);
    }
  });

  // start camera and feed frames
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    videoEl.srcObject = stream;
    await videoEl.play();

    if (typeof Camera !== 'undefined') {
      const camera = new Camera(videoEl, {
        onFrame: async () => {
          try { await fd.send({ image: videoEl }); } catch (e) { console.error('fd.send error', e); }
        },
        width: 640,
        height: 480
      });
      await camera.start();
    } else {
      // fallback loop
      (async function loop() {
        if (videoEl.readyState < 2) { requestAnimationFrame(loop); return; }
        try { await fd.send({ image: videoEl }); } catch (e) { console.error('fd.send err', e); setStatus('MediaPipe runtime error'); }
        requestAnimationFrame(loop);
      })();
    }
  } catch (e) {
    console.error('MediaPipe camera start failed', e);
    setStatus('MediaPipe: camera access failed.');
    return false;
  }

  setStatus('MediaPipe running — counting faces...');
  return true;
}

/* -------------------------
   Orchestration: start detector
   ------------------------- */
async function start() {
  await loadCfg();
  if (!cfg.enabled) {
    setStatus('Detection disabled in settings.');
    return;
  }

  setStatus('Starting detector — testing native then MediaPipe...');

  try {
    const nativeOk = await tryNative();
    if (nativeOk) return;
  } catch (e) {
    console.error('Native attempt threw', e);
  }

  try {
    const mpOk = await tryMediaPipe();
    if (mpOk) return;
  } catch (e) {
    console.error('MediaPipe attempt threw', e);
  }

  setStatus('No detector available. Please ensure MediaPipe files are in libs/ or use a browser with FaceDetector.');
}

start().catch((e) => {
  console.error('Detector start failed', e);
  setStatus('Detector failed to start.');
});
