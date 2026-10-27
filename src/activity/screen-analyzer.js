'use strict';

// Lightweight screen analyzer for Full interactive mode.
// Takes a tiny thumbnail buffer (e.g. 320x180 BGRA/RGBA from Electron's
// desktopCapturer), extracts a 16x9 luminance fingerprint in memory, and
// immediately discards the image bytes. Nothing is ever written to disk or
// sent over the network.

const GRID_W = 16;
const GRID_H = 9;
const GRID_SIZE = GRID_W * GRID_H;
const DARK_THRESHOLD = 75;
const BRIGHT_THRESHOLD = 195;
const STATIC_MOTION_MAX = 2.5;
const DYNAMIC_MOTION_MIN = 18;

// frame: { data: Buffer|Uint8Array, width: number, height: number }
// prevSignature: Uint8Array|null
// Returns { tone: 'dark'|'balanced'|'bright', brightness: number,
//           motion: 'static'|'active'|'dynamic', motionScore: number,
//           signature: Uint8Array } or null when the frame is empty/invalid.
function analyzeFrame(frame, prevSignature) {
  if (!frame || !frame.data || typeof frame.width !== 'number' || typeof frame.height !== 'number') {
    return null;
  }
  const width = Math.floor(frame.width);
  const height = Math.floor(frame.height);
  const data = frame.data;
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    return null;
  }

  const signature = new Uint8Array(GRID_SIZE);
  let totalLuma = 0;
  let idx = 0;

  for (let gy = 0; gy < GRID_H; gy++) {
    const py = Math.min(height - 1, Math.floor(((gy + 0.5) * height) / GRID_H));
    for (let gx = 0; gx < GRID_W; gx++) {
      const px = Math.min(width - 1, Math.floor(((gx + 0.5) * width) / GRID_W));
      const offset = (py * width + px) * 4;
      // Works for both BGRA and RGBA since R and B are weighted symmetrically enough
      // for coarse luminance, with G carrying the majority of the weight.
      const c0 = data[offset];
      const g = data[offset + 1];
      const c2 = data[offset + 2];
      const luma = Math.round(0.21 * c0 + 0.58 * g + 0.21 * c2);
      signature[idx++] = luma;
      totalLuma += luma;
    }
  }

  const brightness = Math.round(totalLuma / GRID_SIZE);
  const tone =
    brightness < DARK_THRESHOLD ? 'dark' : brightness > BRIGHT_THRESHOLD ? 'bright' : 'balanced';

  let motionScore = 0;
  let motion = 'active';
  if (prevSignature && prevSignature.length === GRID_SIZE) {
    let diffSum = 0;
    for (let i = 0; i < GRID_SIZE; i++) {
      diffSum += Math.abs(signature[i] - prevSignature[i]);
    }
    motionScore = Math.round((diffSum / GRID_SIZE) * 10) / 10;
    if (motionScore <= STATIC_MOTION_MAX) motion = 'static';
    else if (motionScore >= DYNAMIC_MOTION_MIN) motion = 'dynamic';
  }

  return {
    tone: tone,
    brightness: brightness,
    motion: motion,
    motionScore: motionScore,
    signature: signature,
  };
}

function describeScreen(screenInfo) {
  if (!screenInfo) return null;
  const toneLabel =
    screenInfo.tone === 'dark'
      ? 'tampilan gelap'
      : screenInfo.tone === 'bright'
        ? 'tampilan terang'
        : 'tampilan normal';
  const motionLabel =
    screenInfo.motion === 'static'
      ? 'layar diam'
      : screenInfo.motion === 'dynamic'
        ? 'banyak gerakan'
        : 'aktif';
  return toneLabel + ', ' + motionLabel;
}

// options: { captureFrame: () => Promise<{ data, width, height }|null> }
function createScreenSampler(options) {
  const captureFrame = options && options.captureFrame;
  let prevSignature = null;
  let latest = null;

  async function sample(allowCapture) {
    if (!allowCapture || typeof captureFrame !== 'function') {
      prevSignature = null;
      latest = null;
      return null;
    }
    try {
      const frame = await captureFrame();
      const analyzed = analyzeFrame(frame, prevSignature);
      if (!analyzed) return null;
      prevSignature = analyzed.signature;
      latest = {
        tone: analyzed.tone,
        brightness: analyzed.brightness,
        motion: analyzed.motion,
        motionScore: analyzed.motionScore,
      };
      return latest;
    } catch {
      return null;
    }
  }

  function reset() {
    prevSignature = null;
    latest = null;
  }

  return {
    sample: sample,
    reset: reset,
    get latest() {
      return latest;
    },
    describe: () => describeScreen(latest),
  };
}

module.exports = {
  analyzeFrame,
  describeScreen,
  createScreenSampler,
  GRID_W,
  GRID_H,
  GRID_SIZE,
};
