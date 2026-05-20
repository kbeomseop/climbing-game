function drawTypePill(ctx, x, y, type) {
  const isStart = type === "start";
  const bg   = isStart ? "#00d2a0" : "#ff9f43";
  const fg   = isStart ? "#003d2e" : "#3d2000";
  const text = isStart ? "START"   : "TOP";
  ctx.save();
  ctx.font = "700 10px 'Poppins', sans-serif";
  const tw = ctx.measureText(text).width;
  const bw = tw + 16; const bh = 18;
  ctx.beginPath();
  ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, 999);
  ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  ctx.restore();
}

const HOLD_TYPES = [
  { img: "hold1_banana.png", label: "Banana" },
  { img: "hold2_mid.png",    label: "Mid"    },
  { img: "hold3_tri.png",    label: "Tri"    },
];

const WORLD_SCALE  = 2.5;
const SEL_R        = 52;    // 선택 원 반지름
const CTRL_HIT     = 14;    // 컨트롤 핸들 히트 반지름
const BTN_W        = 38;
const BTN_H        = 20;
const BTN_GAP      = 4;
const TYPE_COLOR   = { start: "#00e676", top: "#ff6d00" };
const BTN_COLOR    = { start: "#00d2a0", top: "#ff9f43" };

const canvas  = document.getElementById("canvas");
const ctx     = canvas.getContext("2d");
const wrap    = document.getElementById("canvas-wrap");
const palette = document.getElementById("palette");

// ── 이미지 캐시 ─────────────────────────────────────────────
const imgCache      = {};
let imgLoadedCount  = 0;
const imgTotal      = HOLD_TYPES.length;

for (const ht of HOLD_TYPES) {
  const filename = ht.img;
  const paths    = [`/holds/${filename}`, `./holds/${filename}`];
  let   pi       = 0;
  const img      = new Image();

  img.onload = () => {
    imgCache[filename] = img;
    imgLoadedCount++;
  };
  img.onerror = () => {
    console.warn(`[imgCache] 경로 실패: ${img.src}`);
    pi++;
    if (pi < paths.length) {
      img.src = paths[pi];
    } else {
      console.error(`[imgCache] 모든 경로 실패: ${filename}`);
      imgLoadedCount++;
    }
  };
  img.src = paths[pi];
}

// ── 상태 ────────────────────────────────────────────────────
let selectedPaletteIdx = null;
let selectedHold       = null;
let placedHolds        = [];
let nextId             = 0;
let currentRouteId     = null;

let dragMode      = null;   // null | { type:"move"|"rotate"|"scale", hold, ...extra }
let pendingSelect = null;   // mouseup 시 선택할 홀드
let pendingPlace  = null;   // mouseup 시 배치할 좌표
let hasDragged    = false;
let mousedownPos  = null;

// ── 캔버스 크기 (높이 = 뷰포트 × 2.5) ──────────────────────
function resize() {
  canvas.width  = wrap.clientWidth;
  canvas.height = window.innerHeight * WORLD_SCALE;
}
window.addEventListener("resize", resize);
resize();
setTimeout(() => { wrap.scrollTop = wrap.scrollHeight; }, 0);

// ── localStorage 로드 ───────────────────────────────────────
{
  let loaded = false;
  const lastId = localStorage.getItem("lastRouteId");
  if (lastId) {
    try {
      const routes = JSON.parse(localStorage.getItem("climbingRoutes") || "[]");
      const route  = routes.find(r => r.id === lastId);
      if (route?.holds?.length > 0) {
        placedHolds    = route.holds.map(h => ({ scale: 1, rotation: 0, ...h }));
        nextId         = Math.max(...placedHolds.map(h => h.id)) + 1;
        currentRouteId = route.id;
        loaded = true;
      }
    } catch {}
  }
  if (!loaded) {
    try {
      const data = JSON.parse(localStorage.getItem("climbingRoute") || "[]");
      if (Array.isArray(data) && data.length > 0) {
        placedHolds = data.map(h => ({ scale: 1, rotation: 0, ...h }));
        nextId      = Math.max(...placedHolds.map(h => h.id)) + 1;
      }
    } catch {}
  }
}

// ── 팔레트 빌드 (상단 가로) ─────────────────────────────────
const paletteEls = HOLD_TYPES.map((ht, i) => {
  const el = document.createElement("div");
  el.className = "palette-item";
  el.innerHTML = `<img src="/holds/${ht.img}" alt="${ht.label}"><span>${ht.label}</span>`;
  el.addEventListener("click", () => {
    selectedPaletteIdx = (selectedPaletteIdx === i) ? null : i;
    paletteEls.forEach((e, j) => e.classList.toggle("selected", j === selectedPaletteIdx));
    if (selectedPaletteIdx !== null) selectedHold = null;
  });
  palette.appendChild(el);
  return el;
});

// ── 컨트롤 핸들 위치 (캔버스 절대좌표) ─────────────────────
const ctrlRot    = h => ({ x: h.x,      y: h.y - 68 });   // 상단 – 회전
const ctrlScale  = h => ({ x: h.x + 48, y: h.y + 48 });   // 우하단 대각선 – 크기
const ctrlDelete = h => ({ x: h.x + 50, y: h.y - 50 });   // 우상단 – 삭제

// ── 타입 버튼 레이아웃 ───────────────────────────────────────
function getTypeBtnRects(h) {
  const total = 3 * BTN_W + 2 * BTN_GAP;
  const x0 = h.x - total / 2;
  const y0 = h.y + SEL_R + 18;
  const defs = [
    { type: "hold",  label: "일반" },
    { type: "start", label: "시작" },
    { type: "top",   label: "탑"   },
  ];
  return defs.map((d, i) => ({
    ...d,
    x: x0 + i * (BTN_W + BTN_GAP),
    y: y0,
    w: BTN_W,
    bh: BTN_H,
  }));
}

function pointInBtn(pos, btn) {
  return pos.x >= btn.x && pos.x <= btn.x + btn.w
      && pos.y >= btn.y && pos.y <= btn.y + btn.bh;
}

// ── 타입 변경 (개수 제한 포함) ──────────────────────────────
function setType(h, newType) {
  if (h.type === newType) return;
  const starts = placedHolds.filter(p => p !== h && p.type === "start").length;
  const tops   = placedHolds.filter(p => p !== h && p.type === "top").length;
  if (newType === "start" && starts >= 2) return;
  if (newType === "top"   && tops   >= 1) return;
  h.type = newType;
}

function deleteHold(h) {
  if (selectedHold === h) selectedHold = null;
  placedHolds = placedHolds.filter(p => p !== h);
}

// ── 유틸 ────────────────────────────────────────────────────
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function getHoldAt(x, y) {
  for (let i = placedHolds.length - 1; i >= 0; i--) {
    if (Math.hypot(x - placedHolds[i].x, y - placedHolds[i].y) < 44) return placedHolds[i];
  }
  return null;
}

const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ── 마우스 이벤트 ───────────────────────────────────────────
canvas.addEventListener("mousedown", e => {
  if (e.button !== 0) return;
  const pos = getPos(e);
  mousedownPos  = pos;
  hasDragged    = false;
  pendingSelect = null;
  pendingPlace  = null;
  dragMode      = null;

  // 선택된 홀드의 컨트롤 우선 처리
  if (selectedHold) {
    // 삭제 버튼
    if (d2(pos, ctrlDelete(selectedHold)) < CTRL_HIT) {
      deleteHold(selectedHold);
      return;
    }
    // 타입 버튼
    for (const btn of getTypeBtnRects(selectedHold)) {
      if (pointInBtn(pos, btn)) { setType(selectedHold, btn.type); return; }
    }
    // 회전 핸들
    if (d2(pos, ctrlRot(selectedHold)) < CTRL_HIT + 4) {
      dragMode = {
        type: "rotate",
        hold: selectedHold,
        initAngle: Math.atan2(pos.y - selectedHold.y, pos.x - selectedHold.x),
        initRot:   selectedHold.rotation ?? 0,
      };
      return;
    }
    // 크기 핸들
    if (d2(pos, ctrlScale(selectedHold)) < CTRL_HIT + 2) {
      dragMode = {
        type:      "scale",
        hold:      selectedHold,
        initDist:  Math.hypot(pos.x - selectedHold.x, pos.y - selectedHold.y) || 1,
        initScale: selectedHold.scale ?? 1,
      };
      return;
    }
  }

  // 홀드 바디 히트
  const hit = getHoldAt(pos.x, pos.y);
  if (hit) {
    pendingSelect = hit;
    dragMode = { type: "move", hold: hit };
    return;
  }

  // 빈 곳 – 선택 해제 + 팔레트 배치 대기
  selectedHold = null;
  if (selectedPaletteIdx !== null) pendingPlace = pos;
});

canvas.addEventListener("mousemove", e => {
  const pos = getPos(e);
  if (mousedownPos && Math.hypot(pos.x - mousedownPos.x, pos.y - mousedownPos.y) > 5) {
    hasDragged = true;
  }

  if (dragMode && hasDragged) {
    const h = dragMode.hold;
    if (dragMode.type === "move") {
      h.x = pos.x;
      h.y = pos.y;
    } else if (dragMode.type === "rotate") {
      const angle = Math.atan2(pos.y - h.y, pos.x - h.x);
      const delta = angle - dragMode.initAngle;
      h.rotation  = ((dragMode.initRot + delta * (180 / Math.PI)) % 360 + 360) % 360;
    } else if (dragMode.type === "scale") {
      const d = Math.hypot(pos.x - h.x, pos.y - h.y);
      h.scale = Math.max(0.3, Math.min(3.0, dragMode.initScale * (d / dragMode.initDist)));
    }
  }

  // 커서 업데이트
  if (dragMode) {
    canvas.style.cursor = dragMode.type === "rotate" ? "alias" : "grabbing";
  } else if (selectedHold) {
    if      (d2(pos, ctrlRot(selectedHold)) < CTRL_HIT + 4)   canvas.style.cursor = "alias";
    else if (d2(pos, ctrlScale(selectedHold)) < CTRL_HIT + 2) canvas.style.cursor = "nwse-resize";
    else if (d2(pos, ctrlDelete(selectedHold)) < CTRL_HIT)    canvas.style.cursor = "pointer";
    else if (getTypeBtnRects(selectedHold).some(b => pointInBtn(pos, b))) canvas.style.cursor = "pointer";
    else canvas.style.cursor = getHoldAt(pos.x, pos.y) ? "grab" : (selectedPaletteIdx !== null ? "crosshair" : "default");
  } else {
    canvas.style.cursor = getHoldAt(pos.x, pos.y) ? "grab" : (selectedPaletteIdx !== null ? "crosshair" : "default");
  }
});

canvas.addEventListener("mouseup", e => {
  if (e.button !== 0) return;
  if (!hasDragged) {
    if (pendingSelect) {
      selectedHold = pendingSelect;
    } else if (pendingPlace && selectedPaletteIdx !== null) {
      const ht = HOLD_TYPES[selectedPaletteIdx];
      placedHolds.push({
        id: nextId++, img: ht.img,
        x: pendingPlace.x, y: pendingPlace.y,
        type: "hold", scale: 1, rotation: 0,
      });
    }
  }
  dragMode = null; pendingSelect = null; pendingPlace = null;
  hasDragged = false; mousedownPos = null;
});

canvas.addEventListener("contextmenu", e => {
  e.preventDefault();
  const pos = getPos(e);
  const hit = getHoldAt(pos.x, pos.y);
  if (hit) deleteHold(hit);
});

// ── 저장 모달 ────────────────────────────────────────────────
function showSaveModal(placeholder, onConfirm) {
  const ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:1000;";
  ov.innerHTML = `
    <div style="background:#1a1a2e;border:1px solid #444;border-radius:16px;padding:24px;min-width:280px;font-family:'Poppins',sans-serif;">
      <p style="color:#fff;font-size:13px;font-weight:600;margin:0 0 12px;">루트 이름</p>
      <input id="_rname" type="text" placeholder="${placeholder}"
        style="width:100%;background:#0a0a14;color:#fff;border:1px solid #444;border-radius:8px;
               padding:8px 12px;font-family:'Poppins',sans-serif;font-size:13px;outline:none;
               box-sizing:border-box;margin-bottom:16px;">
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="_rcancel" style="background:#1e1e2e;color:#aaa;border:1px solid #444;
          border-radius:8px;padding:8px 16px;font-family:'Poppins',sans-serif;cursor:pointer;">취소</button>
        <button id="_rconfirm" style="background:#ff9f43;color:#fff;border:none;
          border-radius:8px;padding:8px 16px;font-family:'Poppins',sans-serif;font-weight:600;cursor:pointer;">저장</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const input = ov.querySelector("#_rname");
  input.focus();
  const close   = () => ov.remove();
  const confirm = () => { const name = input.value.trim() || placeholder; close(); onConfirm(name); };
  ov.querySelector("#_rcancel").addEventListener("click", close);
  ov.querySelector("#_rconfirm").addEventListener("click", confirm);
  input.addEventListener("keydown", e => { if (e.key === "Enter") confirm(); if (e.key === "Escape") close(); });
}

// ── 버튼 ────────────────────────────────────────────────────
document.getElementById("btn-save").addEventListener("click", () => {
  const routes = JSON.parse(localStorage.getItem("climbingRoutes") || "[]");
  const n      = routes.filter(r => r.id !== currentRouteId).length + 1;
  showSaveModal(`Project ${n}`, name => {
    const id  = currentRouteId || `route_${Date.now()}`;
    const route = {
      id, name,
      createdAt: Date.now(),
      holds: placedHolds,
      scrollMode: localStorage.getItem("routeScrollMode") || "follow",
    };
    const idx = routes.findIndex(r => r.id === id);
    if (idx >= 0) routes[idx] = route; else routes.push(route);
    localStorage.setItem("climbingRoutes", JSON.stringify(routes));
    localStorage.setItem("climbingRoute",  JSON.stringify(placedHolds));
    localStorage.setItem("lastRouteId",    id);
    currentRouteId = id;
  });
});
document.getElementById("btn-play").addEventListener("click", () => {
  window.location.href = "/";
});
document.getElementById("btn-reset").addEventListener("click", () => {
  placedHolds = []; nextId = 0; selectedHold = null; currentRouteId = null;
  wrap.scrollTop = wrap.scrollHeight;
});
document.getElementById("btn-new").addEventListener("click", () => {
  placedHolds = []; nextId = 0; selectedHold = null; currentRouteId = null;
  wrap.scrollTop = wrap.scrollHeight;
});

// ── 렌더링 ──────────────────────────────────────────────────
function drawGrid() {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth   = 1;
  for (let x = 0; x < canvas.width;  x += 80) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 80) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
  ctx.restore();
}

function drawHold(h) {
  const img      = imgCache[h.img];
  const scale    = h.scale    ?? 1;
  const rotation = (h.rotation ?? 0) * Math.PI / 180;
  const isSelected = selectedHold === h;
  const isDragging = dragMode?.hold === h && dragMode?.type === "move" && hasDragged;

  // 이미지
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(rotation);
  if (isDragging) { ctx.shadowBlur = 20; ctx.shadowColor = "rgba(144,202,249,0.6)"; ctx.globalAlpha = 0.85; }
  if (img && img.complete && img.naturalWidth > 0) {
    const dw = img.naturalWidth  * 0.2 * scale;
    const dh = img.naturalHeight * 0.2 * scale;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  } else {
    // 로딩 중: 점선 원 / 실패: 빨간 점선 원
    ctx.beginPath(); ctx.arc(0, 0, 18 * scale, 0, Math.PI * 2);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = imgLoadedCount < imgTotal ? "rgba(100,180,255,0.5)" : "#e53935";
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  // 타입 링 + 필 뱃지
  const tc = TYPE_COLOR[h.type];
  if (tc) {
    ctx.save();
    ctx.beginPath(); ctx.arc(h.x, h.y, SEL_R - 6, 0, Math.PI * 2);
    ctx.strokeStyle = tc; ctx.lineWidth = 2;
    ctx.shadowBlur  = 10; ctx.shadowColor = tc;
    ctx.stroke();
    ctx.restore();
    drawTypePill(ctx, h.x, h.y - SEL_R - 14, h.type);
  }

  // 선택 상태: 점선 원 + 인라인 컨트롤
  if (isSelected) {
    ctx.save();
    ctx.setLineDash([7, 4]);
    ctx.beginPath(); ctx.arc(h.x, h.y, SEL_R, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,159,67,0.6)"; ctx.lineWidth = 1.5;
    ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    drawControls(h);
  } else if (!tc) {
    ctx.save();
    ctx.beginPath(); ctx.arc(h.x, h.y, 40, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.07)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }
}

function drawControls(h) {
  const drawHandle = (pos, size, icon, fillColor, strokeColor) => {
    ctx.save();
    ctx.beginPath(); ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
    ctx.fillStyle   = fillColor;   ctx.fill();
    ctx.strokeStyle = strokeColor; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = `${size + 3}px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(icon, pos.x, pos.y + 1);
    ctx.restore();
  };

  // 회전 핸들 (상단)
  const rp = ctrlRot(h);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(h.x, h.y - SEL_R); ctx.lineTo(rp.x, rp.y + 12);
  ctx.strokeStyle = "rgba(255,159,67,0.25)"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  drawHandle(rp, 12, "↻", "#ff9f43", "#c97a1e");

  // 크기 핸들 (우하단 대각선)
  const sp = ctrlScale(h);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(h.x + SEL_R * 0.7, h.y + SEL_R * 0.7); ctx.lineTo(sp.x - 8, sp.y - 8);
  ctx.strokeStyle = "rgba(255,159,67,0.25)"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  drawHandle(sp, 11, "⤡", "#ee5a24", "#a83410");

  // 삭제 버튼 (우상단)
  drawHandle(ctrlDelete(h), 11, "×", "#c0392b", "#e74c3c");

  // 타입 버튼 (하단)
  for (const btn of getTypeBtnRects(h)) {
    const active   = h.type === btn.type;
    const btnColor = BTN_COLOR[btn.type] ?? null;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(btn.x, btn.y, btn.w, btn.bh, 4);
    ctx.fillStyle   = active ? (btnColor ? btnColor + "30" : "rgba(255,255,255,0.2)") : "rgba(15,15,30,0.85)";
    ctx.strokeStyle = active ? (btnColor ?? "rgba(255,255,255,0.4)")                  : "rgba(255,255,255,0.15)";
    ctx.lineWidth   = active ? 1.5 : 1;
    ctx.fill(); ctx.stroke();
    ctx.fillStyle    = active ? (btnColor ?? "#fff") : "rgba(255,255,255,0.5)";
    ctx.font         = "700 10px 'Poppins', sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.bh / 2);
    ctx.restore();
  }
}

function render() {
  requestAnimationFrame(render);
  ctx.fillStyle = "#0a0a14";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  for (const h of placedHolds) drawHold(h);
}

render();
