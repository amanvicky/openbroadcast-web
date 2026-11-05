import { FaceLandmarker, FilesetResolver } from
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const statusEl = document.getElementById("status");
const offGrid = document.getElementById("offGrid");
const offReason = document.getElementById("offReason");
const toggleBtn = document.getElementById("toggle");
const strengthInput = document.getElementById("strength");
const showPointsInput = document.getElementById("showPoints");
const retryBtn = document.getElementById("retry");

const ctx2d = canvas.getContext("2d");

let landmarker = null;
let correcting = false;
let running = true;
let smooth = { dx: 0, dy: 0 };
const patchCanvas = document.createElement("canvas");

// iris centers and eye boxes come from the 478-point face mesh
const L_IRIS = 468, R_IRIS = 473;
const L_EYE = { outer: 33, inner: 133, top: 159, bottom: 145 };
const R_EYE = { outer: 263, inner: 362, top: 386, bottom: 374 };

function say(text) { statusEl.textContent = text; }

function fail(title, reason) {
  offReason.textContent = reason;
  offGrid.classList.remove("hidden");
  say(title);
  running = false;
}

async function loadModel() {
  say("loading face model (~3 MB, once per visit)…");
  const fileset = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numFaces: 1
  });
  say("model ready, asking for camera…");
}

async function openCamera() {
  offGrid.classList.add("hidden");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    say("running — look at the camera, then try looking away");
    toggleBtn.disabled = false;
    toggleBtn.classList.add("enabled");
    requestAnimationFrame(loop);
  } catch (err) {
    fail("camera is off", err && err.name === "NotAllowedError"
      ? "camera access was blocked. allow it in the browser's address bar, then try again."
      : "couldn't open a camera (" + (err && err.name || "unknown error") + "). is one connected?");
  }
}

function eyeBox(lm, eye) {
  const outer = lm[eye.outer], inner = lm[eye.inner];
  const top = lm[eye.top], bottom = lm[eye.bottom];
  const cx = (outer.x + inner.x) / 2;
  const cy = (top.y + bottom.y) / 2;
  const w = Math.abs(inner.x - outer.x);
  const h = Math.abs(bottom.y - top.y);
  return { cx, cy, w: Math.max(w, 0.01), h: Math.max(h, 0.01) };
}

function gazeOffset(lm, eye, irisIdx) {
  const box = eyeBox(lm, eye);
  const iris = lm[irisIdx];
  // normalized: how far the iris sits from the eye center, in eye-widths
  return {
    dx: (iris.x - box.cx) / box.w,
    dy: (iris.y - box.cy) / box.w,
    box
  };
}

function drawEyePatch(src, dst, box, shiftX, shiftY, patch) {
  // region around the eye, in pixels, with generous margin
  const cx = box.cx * src.width, cy = box.cy * src.height;
  const rw = Math.max(2, Math.round(box.w * src.width * 2.4));
  const rh = Math.max(2, Math.round(Math.max(box.h * src.height * 5.5, rw * 0.45)));
  const sx = cx - rw / 2, sy = cy - rh / 2;

  if (patch.width !== rw) patch.width = rw;
  if (patch.height !== rh) patch.height = rh;
  const pctx = patch.getContext("2d");
  pctx.clearRect(0, 0, rw, rh);
  pctx.drawImage(src, sx, sy, rw, rh, 0, 0, rw, rh);
  pctx.globalCompositeOperation = "destination-in";
  const grad = pctx.createRadialGradient(
    rw / 2, rh / 2, Math.min(rw, rh) * 0.18,
    rw / 2, rh / 2, Math.min(rw, rh) * 0.5);
  grad.addColorStop(0, "rgba(0,0,0,1)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  pctx.fillStyle = grad;
  pctx.fillRect(0, 0, rw, rh);
  pctx.globalCompositeOperation = "source-over";

  dst.drawImage(patch, sx + shiftX, sy + shiftY);
}

function loop() {
  if (!running) return;
  if (video.readyState >= 2 && landmarker) {
    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ts = performance.now();
    const res = landmarker.detectForVideo(video, ts);
    ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (res.faceLandmarks && res.faceLandmarks.length) {
      const lm = res.faceLandmarks[0];
      const left = gazeOffset(lm, L_EYE, L_IRIS);
      const right = gazeOffset(lm, R_EYE, R_IRIS);

      // smooth over frames so the correction doesn't twitch
      const a = 0.35;
      smooth.dx = a * ((left.dx + right.dx) / 2) + (1 - a) * smooth.dx;
      smooth.dy = a * ((left.dy + right.dy) / 2) + (1 - a) * smooth.dy;

      if (correcting) {
        const k = (strengthInput.value / 100) * 0.9;
        const shiftX = -smooth.dx * canvas.width * 0.045 * k;
        const shiftY = -smooth.dy * canvas.width * 0.045 * k;
        drawEyePatch(video, ctx2d, left.box, shiftX, shiftY, patchCanvas);
        drawEyePatch(video, ctx2d, right.box, shiftX, shiftY, patchCanvas);
      }

      if (showPointsInput.checked) {
        for (const g of [left, right]) {
          const iris = { x: g.box.cx + g.dx * g.box.w, y: g.box.cy + g.dy * g.box.w };
          const c = { x: g.box.cx * canvas.width, y: g.box.cy * canvas.height };
          const p = { x: iris.x * canvas.width, y: iris.y * canvas.height };
          ctx2d.strokeStyle = "rgba(0,229,160,0.9)";
          ctx2d.lineWidth = Math.max(1.5, canvas.width / 640);
          ctx2d.beginPath();
          ctx2d.arc(c.x, c.y, canvas.width * 0.012, 0, Math.PI * 2);
          ctx2d.stroke();
          ctx2d.fillStyle = correcting ? "#fbbf24" : "#f87171";
          ctx2d.beginPath();
          ctx2d.arc(p.x, p.y, canvas.width * 0.008, 0, Math.PI * 2);
          ctx2d.fill();
          ctx2d.strokeStyle = "rgba(251,191,36,0.7)";
          ctx2d.beginPath();
          ctx2d.moveTo(c.x, c.y);
          ctx2d.lineTo(p.x, p.y);
          ctx2d.stroke();
        }
      }
    } else {
      say("no face in frame — move back a bit");
    }
  }
  requestAnimationFrame(loop);
}

function reduceMotionOff() { return false; } // iris dot: amber when correcting

toggleBtn.addEventListener("click", () => {
  correcting = !correcting;
  toggleBtn.textContent = "correction: " + (correcting ? "on" : "off");
  toggleBtn.classList.toggle("on", correcting);
});
retryBtn.addEventListener("click", () => { running = true; openCamera(); });

(async function start() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      fail("camera is off", "this browser doesn't support camera capture (or the page isn't on https).");
      return;
    }
    await loadModel();
    await openCamera();
  } catch (err) {
    fail("couldn't start", (err && err.message) || "unknown error — reload and try again.");
  }
})();
