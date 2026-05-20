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

// ── 스크롤 ───────────────────────────────────────────────
let scrollY       = 0;
let targetScrollY = 0;

// ── 마우스 모드 상태 ──────────────────────────────────────
const mouse   = { x: 0, y: 0 };
let activeKey = null;
let lastKey   = 'a';
let leftPos   = null;
let rightPos  = null;

// ── 현재 루트 ID ─────────────────────────────────────────
let currentRouteId = null;

function syncMouseBtn() {
  const btnMouse  = document.getElementById('btn-mouse');
  const btnMotion = document.getElementById('btn-motion');
  if (btnMouse)  btnMouse.classList.toggle('active',  mouseMode);
  if (btnMotion) btnMotion.classList.toggle('active', !mouseMode);
}

window.toggleMouseMode = () => {
  mouseMode = true;
  leftPos = null; rightPos = null;
  syncMouseBtn();
};

window.toggleMotionMode = () => {
  mouseMode = false;
  syncMouseBtn();
};

// ── 루트 마이그레이션 (단일 → 다중) ──────────────────────
function migrateRoutes() {
  const routes = JSON.parse(localStorage.getItem("climbingRoutes") || "[]");
  if (routes.length > 0) return;
  try {
    const data = JSON.parse(localStorage.getItem("climbingRoute") || "[]");
    if (Array.isArray(data) && data.length > 0) {
      const id    = `route_${Date.now()}`;
      const route = { id, name: "Project 1", createdAt: Date.now(), holds: data,
                      scrollMode: localStorage.getItem("routeScrollMode") || "follow" };
      localStorage.setItem("climbingRoutes", JSON.stringify([route]));
      localStorage.setItem("lastRouteId", id);
    }
  } catch {}
}

function loadRouteById(id) {
  if (!id) return false;
  try {
    const routes = JSON.parse(localStorage.getItem("climbingRoutes") || "[]");
    const route  = routes.find(r => r.id === id);
    if (!route) return false;
    localStorage.setItem("climbingRoute", JSON.stringify(route.holds));
    localStorage.setItem("lastRouteId", id);
    if (route.scrollMode) {
      localStorage.setItem("routeScrollMode", route.scrollMode);
      scrollMode = route.scrollMode;
    }
    currentRouteId = id;
    return true;
  } catch { return false; }
}

// ── 루트 패널 ────────────────────────────────────────────
function renderRoutePanel() {
  const list = document.getElementById("route-list");
  if (!list) return;
  const routes = JSON.parse(localStorage.getItem("climbingRoutes") || "[]");
  if (routes.length === 0) {
    list.innerHTML = '<div id="route-panel-empty">저장된 루트가 없습니다</div>';
    return;
  }
  list.innerHTML = "";
  for (const route of [...routes].reverse()) {
    const date = new Date(route.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
    const item = document.createElement("div");
    item.className = "route-item" + (route.id === currentRouteId ? " active" : "");
    item.innerHTML = `
      <div style="flex:1;min-width:0;">
        <div class="route-item-name">${route.name}</div>
        <div class="route-item-date">${date} &middot; ${route.holds?.length ?? 0} holds</div>
      </div>
      <button class="route-item-del" data-id="${route.id}" title="삭제">🗑</button>`;
    item.querySelector(".route-item-del").addEventListener("click", e => {
      e.stopPropagation();
      const delId  = e.currentTarget.dataset.id;
      const updated = JSON.parse(localStorage.getItem("climbingRoutes") || "[]").filter(r => r.id !== delId);
      localStorage.setItem("climbingRoutes", JSON.stringify(updated));
      if (currentRouteId === delId) {
        currentRouteId = null;
        localStorage.removeItem("lastRouteId");
      }
      renderRoutePanel();
    });
    item.addEventListener("click", () => {
      loadRouteById(route.id);
      buildHolds();
      leftPos = null; rightPos = null;
      if (climbingState) { climbingState.leftHold = null; climbingState.rightHold = null; }
      renderRoutePanel();
      closeRoutePanel();
    });
    list.appendChild(item);
  }
}

function openRoutePanel() {
  renderRoutePanel();
  document.getElementById("route-panel")?.classList.add("open");
  document.getElementById("btn-routes")?.classList.add("active");
}
function closeRoutePanel() {
  document.getElementById("route-panel")?.classList.remove("open");
  document.getElementById("btn-routes")?.classList.remove("active");
}
function toggleRoutePanel() {
  const panel = document.getElementById("route-panel");
  if (panel?.classList.contains("open")) closeRoutePanel();
  else openRoutePanel();
}

window.openRoutePanel   = openRoutePanel;
window.closeRoutePanel  = closeRoutePanel;
window.toggleRoutePanel = toggleRoutePanel;

document.addEventListener("click", e => {
  const panel = document.getElementById("route-panel");
  const btnR  = document.getElementById("btn-routes");
  if (panel?.classList.contains("open") && !panel.contains(e.target) && e.target !== btnR) {
    closeRoutePanel();
  }
});

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
    syncMouseBtn();
    console.warn("마우스 모드 진입:", camResult.reason);
  }
  if (trackerResult.status === "rejected") {
    console.warn("HandTracker 초기화 실패:", trackerResult.reason);
  }
  migrateRoutes();
  const lastId = localStorage.getItem("lastRouteId");
  loadRouteById(lastId);
  buildHolds();
  ready = true;
}

// ── 스크롤 모드 ───────────────────────────────────────────
let scrollMode     = localStorage.getItem("routeScrollMode") || "follow";
let scrollOverride = null;
let wheelTimer     = null;

window.addEventListener("wheel", e => {
  e.preventDefault();
  targetScrollY += e.deltaY * 0.8;
  targetScrollY = Math.max(0, targetScrollY);
  if (scrollMode === "follow") {
    scrollOverride = "free";
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { scrollOverride = null; }, 3000);
  }
}, { passive: false });

window.addEventListener("resize", () => {
  WORLD_H = window.innerHeight * 2.5;
  targetScrollY = Math.max(0, targetScrollY);
  scrollY = targetScrollY;
  if (ready) buildHolds();
});

// ── 마우스 이벤트 ─────────────────────────────────────────
canvas.addEventListener("mousemove", e => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
  if (activeKey === 'a') leftPos  = { x: mouse.x, y: mouse.y + scrollY };
  if (activeKey === 'd') rightPos = { x: mouse.x, y: mouse.y + scrollY };
});

window.addEventListener("keydown", e => {
  if (!mouseMode) return;
  const k = e.key.toLowerCase();
  if (k !== 'a' && k !== 'd') return;
  activeKey = k;
  lastKey   = k;
  if (k === 'a') leftPos  = { x: mouse.x, y: mouse.y + scrollY };
  else           rightPos = { x: mouse.x, y: mouse.y + scrollY };
});

window.addEventListener("keyup", e => {
  if (e.key.toLowerCase() === activeKey) activeKey = null;
});

canvas.addEventListener("click", e => {
  if (!mouseMode || !ready) return;
  const rect = canvas.getBoundingClientRect();
  const sx   = e.clientX - rect.left;
  const wy   = (e.clientY - rect.top) + scrollY;
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

  if (!ready) {
    renderer.scrollY = scrollY;
    renderer.clear();
    renderer.drawUI({ ready: false });
    return;
  }

  // ── hands 수집 ──
  let hands = [];
  if (!mouseMode) {
    tracker.detect(video);
    hands = tracker.getHands(canvas.width, canvas.height);
    climbingState.update(hands, canvas.width, scrollY);
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
  const effectiveMode = scrollOverride ?? scrollMode;
  if (effectiveMode === "fixed") {
    scrollY = 0;
    targetScrollY = 0;
  } else {
    if (effectiveMode === "follow" && pose) {
      const charY = pose.neck.y;
      targetScrollY = Math.max(0, charY - window.innerHeight * 0.75);
    }
    scrollY += (targetScrollY - scrollY) * 0.15;
    scrollY = Math.max(0, scrollY);
  }

  // ── 렌더링 ──
  renderer.scrollY = scrollY;
  renderer.clear();

  // ── 마우스 근처 홀드 하이라이트 ──
  let hoverHold = null;
  if (mouseMode) {
    const wy = mouse.y + scrollY;
    let nd = Infinity;
    for (const h of holds) {
      const d = Math.hypot(mouse.x - h.x, wy - h.y);
      if (d < 70 && d < nd) { hoverHold = h; nd = d; }
    }
  }

  renderer.drawHolds(holds, lh, rh, hoverHold, scrollY);
  renderer.drawCharacter(pose, { lHold: lh, rHold: rh }, scrollY);
  if (hands.length > 0) renderer.drawHandLandmarks(hands, scrollY);
  renderer.drawMouseCursors({ mouseMode, mouse, activeKey, lastKey });
  renderer.drawUI({ ready, lHold: lh, rHold: rh, startHolds, noCam, mouseMode });
}

requestAnimationFrame(loop);

init();
