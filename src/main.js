import { HandTracker } from "./handTracker.js";
import { createHolds, ClimbingState } from "./climbing.js";
import { Character } from "./character.js";
import { Renderer } from "./renderer.js";

const video  = document.getElementById("webcam");
const canvas = document.getElementById("canvas");

const tracker   = new HandTracker();
const renderer  = new Renderer(canvas);
const character = new Character();

let holds         = [];
let climbingState = null;
let startHolds    = [];
let ready         = false;
let noCam         = false;
let mouseMode     = false;

// ── 월드 높이 (뷰포트 × 2.5) ─────────────────────────────
let WORLD_H = window.innerHeight * 2.5;

// ── 카메라Y ──────────────────────────────────────────────
let cameraY       = WORLD_H - window.innerHeight;
let targetCameraY = cameraY;

// ── 마우스 모드 상태 (스크린 좌표) ───────────────────────
const mouse   = { x: 0, y: 0 };
let activeKey = null;      // 'a' | 'd' | null
let lastKey   = 'a';       // 마지막으로 누른 키
let leftPos   = null;      // 왼손 월드 좌표 { x, y }
let rightPos  = null;      // 오른손 월드 좌표 { x, y }

function buildHolds() {
  holds = createHolds(canvas.width, WORLD_H);
  climbingState = new ClimbingState(holds);
  startHolds = holds.filter(h => h.type === "start").sort((a, b) => a.x - b.x);
}

async function initWebcam() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: 1280, height: 720 },
  });
  video.srcObject = stream;
  await new Promise(res => (video.onloadedmetadata = res));
  video.play();
}

async function init() {
  const [trackerResult, camResult] = await Promise.allSettled([tracker.init(), initWebcam()]);
  if (camResult.status === "rejected") {
    noCam     = true;
    mouseMode = true;
    console.warn("마우스 모드 진입:", camResult.reason);
  }
  if (trackerResult.status === "rejected") {
    console.warn("HandTracker 초기화 실패:", trackerResult.reason);
  }
  buildHolds();
  ready = true;
}

// ── 스크롤 ────────────────────────────────────────────────
window.addEventListener("wheel", e => {
  e.preventDefault();
  targetCameraY += e.deltaY * 0.8;
  targetCameraY = Math.max(0, Math.min(targetCameraY, WORLD_H - window.innerHeight));
}, { passive: false });

window.addEventListener("resize", () => {
  WORLD_H = window.innerHeight * 2.5;
  targetCameraY = Math.max(0, Math.min(targetCameraY, WORLD_H - window.innerHeight));
  cameraY = targetCameraY;
  if (ready) buildHolds();
});

// ── 마우스 이벤트 ─────────────────────────────────────────
canvas.addEventListener("mousemove", e => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
  // 월드 좌표로 저장 (카메라 스크롤 독립적)
  if (activeKey === 'a') leftPos  = { x: mouse.x, y: mouse.y + cameraY };
  if (activeKey === 'd') rightPos = { x: mouse.x, y: mouse.y + cameraY };
});

window.addEventListener("keydown", e => {
  if (!mouseMode) return;
  const k = e.key.toLowerCase();
  if (k !== 'a' && k !== 'd') return;
  activeKey = k;
  lastKey   = k;
  if (k === 'a') leftPos  = { x: mouse.x, y: mouse.y + cameraY };
  else           rightPos = { x: mouse.x, y: mouse.y + cameraY };
});

window.addEventListener("keyup", e => {
  if (e.key.toLowerCase() === activeKey) activeKey = null;
});

canvas.addEventListener("click", e => {
  if (!mouseMode || !ready) return;
  const rect = canvas.getBoundingClientRect();
  const sx   = e.clientX - rect.left;
  const wy   = (e.clientY - rect.top) + cameraY;
  const isLeft = lastKey === 'a';

  let nearest = null, nd = Infinity;
  for (const h of holds) {
    const d = Math.hypot(sx - h.x, wy - h.y);
    if (d < nd) { nearest = h; nd = d; }
  }
  if (nearest && nd < 70) {
    if (isLeft) climbingState.leftHold  = nearest;
    else        climbingState.rightHold = nearest;
  }
});

// ── 렌더 루프 ────────────────────────────────────────────
function loop() {
  requestAnimationFrame(loop);

  renderer.scrollY = cameraY;
  renderer.clear();

  if (!ready) {
    renderer.drawUI({ ready: false });
    return;
  }

  // ── hands 수집 ──
  let hands = [];
  if (!mouseMode) {
    tracker.detect(video);
    hands = tracker.getHands(canvas.width, canvas.height);
    climbingState.update(hands, canvas.width, cameraY);
  }

  const lh = climbingState.leftHold;
  const rh = climbingState.rightHold;

  // ── 유효 손 위치 (월드 좌표) ──
  const effL = lh ?? (mouseMode && leftPos
    ? leftPos
    : startHolds[0]
    ? { x: startHolds[0].x, y: startHolds[0].y + 80 }
    : { x: canvas.width * 0.35, y: WORLD_H * 0.88 });
  const effR = rh ?? (mouseMode && rightPos
    ? rightPos
    : startHolds[1]
    ? { x: startHolds[1].x, y: startHolds[1].y + 80 }
    : { x: canvas.width * 0.65, y: WORLD_H * 0.88 });

  const hipPos = {
    x: (effL.x + effR.x) / 2,
    y: (effL.y + effR.y) / 2 + 55 + 120,
  };
  const footHolds = climbingState.getFootHolds(hipPos);
  const pose      = character.compute(effL, effR, footHolds);

  // ── 카메라 팔로우 ──
  if (pose) {
    const headScreenY = pose.head.y - cameraY;
    if (headScreenY < window.innerHeight * 0.35) {
      targetCameraY = Math.max(0, pose.head.y - window.innerHeight * 0.35);
    }
  }
  cameraY += (targetCameraY - cameraY) * 0.08;
  cameraY  = Math.max(0, Math.min(cameraY, WORLD_H - window.innerHeight));
  renderer.scrollY = cameraY;

  // ── 마우스 근처 홀드 하이라이트 ──
  let hoverHold = null;
  if (mouseMode) {
    const wy = mouse.y + cameraY;
    let nd = Infinity;
    for (const h of holds) {
      const d = Math.hypot(mouse.x - h.x, wy - h.y);
      if (d < 70 && d < nd) { hoverHold = h; nd = d; }
    }
  }

  renderer.drawHolds(holds, lh, rh, hoverHold);
  renderer.drawCharacter(pose);
  if (hands.length > 0) renderer.drawHandLandmarks(hands);
  renderer.drawMouseCursors({ mouseMode, mouse, activeKey, lastKey });
  renderer.drawUI({ ready, lHold: lh, rHold: rh, startHolds, noCam, mouseMode });
}

requestAnimationFrame(loop);

init();
