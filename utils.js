// Indices for eyes in MediaPipe FaceMesh
// (left eye sample points; small sets for EAR-like heuristic)
const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [263, 387, 385, 362, 380, 373];
// Nose tip and ears for yaw estimate
const NOSE_TIP = 1, LEFT_EAR = 234, RIGHT_EAR = 454;

function euclid(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

// Basic Eye Aspect Ratio (EAR-like) using 6 points (approx)
function eyeOpenness(landmarks, idxs) {
  const p = idxs.map(i => landmarks[i]);
  const vert = (euclid(p[1], p[5]) + euclid(p[2], p[4])) / 2;
  const horiz = euclid(p[0], p[3]) + 1e-6;
  return vert / horiz; // larger => more open
}

function bothEyesOpen(landmarks, threshold) {
  const left = eyeOpenness(landmarks, LEFT_EYE);
  const right = eyeOpenness(landmarks, RIGHT_EYE);
  const ear = (left + right) / 2;
  // Map EAR-ish value ~0.15 closed, ~0.35+ open (heuristic)
  return { open: ear >= threshold, ear };
}

// Rough yaw: compare nose x to ear midline
function estimateYawDegrees(landmarks) {
  const L = landmarks[LEFT_EAR], R = landmarks[RIGHT_EAR], N = landmarks[NOSE_TIP];
  const midX = (L.x + R.x) / 2;
  const halfWidth = Math.abs(R.x - L.x) / 2 + 1e-6;
  const norm = (N.x - midX) / halfWidth; // -1 (left) to +1 (right)
  const degrees = Math.min(60, Math.abs(norm) * 45); // heuristic scale
  return degrees;
}

if (typeof window !== 'undefined') {
  window.__PG_UTILS__ = { bothEyesOpen, estimateYawDegrees };
}
