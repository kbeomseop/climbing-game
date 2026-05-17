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

const canvas  = document.getElementById("canvas");
const ctx     = canvas.getContext("2d");
const wrap    = document.getElementById("canvas-wrap");
const palette = document.getElementById("palette");

// ── 이미지 캐시 ─────────────────────────────────────────────
const imgCache = {};
for (const ht of HOLD_TYPES) {
  const img = new Image();
  img.src = `/holds/${ht.img}`;
  imgCache[ht.img] = img;
}

// ── 상태 ────────────────────────────────────────────────────
let selectedPaletteIdx = null;
let selectedHold       = null;
let placedHolds        = [];
let nextId             = 0;

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
  const saved = localStorage.getItem("climbingRoute");
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (Array.isArray(data) && data.length > 0) {
        placedHolds = data.map(h => ({ scale: 1, rotation: 0, ...h }));
        nextId = Math.max(...placedHolds.map(h => h.id)) + 1;
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
const ctrlScale  = h => ({ x: h.x + 62, y: h.y + 12 });   // 우측 – 크기
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

// ── 버튼 ────────────────────────────────────────────────────
document.getElementById("btn-save").addEventListener("click", () => {
  localStorage.setItem("climbingRoute", JSON.stringify(placedHolds));
  const btn = document.getElementById("btn-save");
  btn.textContent = "저장됨!";
  setTimeout(() => { btn.textContent = "저장"; }, 1200);
});
document.getElementById("btn-play").addEventListener("click", () => {
  window.location.href = "/";
});
document.getElementById("btn-new").addEventListener("click", () => {
  placedHolds = []; nextId = 0; selectedHold = null;
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
    ctx.beginPath(); ctx.arc(0, 0, 18 * scale, 0, Math.PI * 2);
    ctx.fillStyle = "#42a5f5"; ctx.fill();
  }
  ctx.restore();

  // 타입 링 + 라벨
  const tc = TYPE_COLOR[h.type];
  if (tc) {
    ctx.save();
    ctx.beginPath(); ctx.arc(h.x, h.y, SEL_R - 6, 0, Math.PI * 2);
    ctx.strokeStyle = tc; ctx.lineWidth = 2;
    ctx.shadowBlur  = 10; ctx.shadowColor = tc;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font        = "10px monospace";
    ctx.fillStyle   = "rgba(255,255,255,0.85)";
    ctx.textAlign   = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(h.type.toUpperCase(), h.x, h.y - SEL_R - 6);
    ctx.restore();
  }

  // 선택 상태: 점선 원 + 인라인 컨트롤
  if (isSelected) {
    ctx.save();
    ctx.setLineDash([7, 4]);
    ctx.beginPath(); ctx.arc(h.x, h.y, SEL_R, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1.5;
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
  ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  drawHandle(rp, 12, "↻", "rgba(25,25,45,0.85)", "rgba(255,255,255,0.5)");

  // 크기 핸들 (우측)
  const sp = ctrlScale(h);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(h.x + SEL_R, h.y); ctx.lineTo(sp.x - 12, sp.y);
  ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  drawHandle(sp, 11, "⇔", "rgba(25,25,45,0.85)", "rgba(255,255,255,0.5)");

  // 삭제 버튼 (우상단)
  drawHandle(ctrlDelete(h), 11, "×", "rgba(190,45,45,0.85)", "rgba(255,100,100,0.6)");

  // 타입 버튼 (하단)
  for (const btn of getTypeBtnRects(h)) {
    const active = h.type === btn.type;
    const bc     = TYPE_COLOR[btn.type] ?? null;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(btn.x, btn.y, btn.w, btn.bh, 4);
    ctx.fillStyle   = active ? (bc ? bc + "30" : "rgba(255,255,255,0.14)") : "rgba(15,15,30,0.78)";
    ctx.strokeStyle = active ? (bc ?? "rgba(255,255,255,0.6)") : "rgba(255,255,255,0.17)";
    ctx.lineWidth   = active ? 1.5 : 1;
    ctx.fill(); ctx.stroke();
    ctx.fillStyle    = active ? (bc ?? "#fff") : "rgba(255,255,255,0.5)";
    ctx.font         = "10px monospace";
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
