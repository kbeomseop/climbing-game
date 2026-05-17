import { HandTracker } from "./handTracker.js";
import { createHolds, ClimbingState } from "./climbing.js";
import { Character } from "./character.js";
import { Renderer } from "./renderer.js";

const video  = document.getElementById("webcam");
const canvas = document.getElementById("canvas");

const tracker   = new HandTracker();
const renderer  = new Renderer(canvas);
const character = new Character();

let holds        = [];
let climbingState = null;
let startHolds   = [];
let ready        = false;
let noCam        = false;

// ── 월드 높이 (뷰포트 × 2.5) ─────────────────────────────
let WORLD_H = window.innerHeight * 2.5;

// ── 카메라 (cameraY = 월드 내 뷰포트 상단 y) ──────────────
let cameraY       = WORLD_H - window.innerHeight;  // 시작 시 하단
let targetCameraY = cameraY;

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
    noCam = true;
    console.warn("카메라 없음 모드:", camResult.reason);
  }
  if (trackerResult.status === "rejected") {
    console.warn("HandTracker 초기화 실패:", trackerResult.reason);
  }
  buildHolds();
  ready = true;
}

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

function loop() {
  requestAnimationFrame(loop);

  renderer.scrollY = cameraY;
  renderer.clear();

  if (!ready) {
    renderer.drawUI({ ready: false });
    return;
  }

  if (!noCam) tracker.detect(video);
  const hands = tracker.getHands(canvas.width, canvas.height);
  climbingState.update(hands, canvas.width, cameraY);

  const lh = climbingState.leftHold;
  const rh = climbingState.rightHold;

  // 손이 홀드에 없을 때 스타트 홀드 아래를 기본 위치로 사용
  const effL = lh ?? (startHolds[0]
    ? { x: startHolds[0].x, y: startHolds[0].y + 80 }
    : { x: canvas.width * 0.35, y: WORLD_H * 0.88 });
  const effR = rh ?? (startHolds[1]
    ? { x: startHolds[1].x, y: startHolds[1].y + 80 }
    : { x: canvas.width * 0.65, y: WORLD_H * 0.88 });

  // hipPos: 월드 좌표
  const hipPos = {
    x: (effL.x + effR.x) / 2,
    y: (effL.y + effR.y) / 2 + 55 + 120,
  };

  const footHolds = climbingState.getFootHolds(hipPos);
  const pose      = character.compute(effL, effR, footHolds);

  // ── 카메라 팔로우: 머리가 뷰포트 상단 35% 넘어가면 위로 ──
  if (pose) {
    const headScreenY = pose.head.y - cameraY;
    if (headScreenY < window.innerHeight * 0.35) {
      targetCameraY = Math.max(0, pose.head.y - window.innerHeight * 0.35);
    }
  }
  cameraY += (targetCameraY - cameraY) * 0.08;
  cameraY  = Math.max(0, Math.min(cameraY, WORLD_H - window.innerHeight));
  renderer.scrollY = cameraY;

  renderer.drawHolds(holds, lh, rh);
  renderer.drawCharacter(pose);
  renderer.drawHandLandmarks(hands);
  renderer.drawUI({ ready, lHold: lh, rHold: rh, startHolds, noCam });
}

requestAnimationFrame(loop);

init();
