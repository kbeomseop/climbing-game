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
  { img: "hold1_banana.png", label: "Banana", color: "Yellow" },
  { img: "hold2_mid.png",    label: "Mid",    color: "Yellow" },
  { img: "hold3_tri.png",    label: "Tri",    color: "Yellow" },
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
  const paths    = [`./holds/${filename}`];
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

// ── 원숭이 상태 ─────────────────────────────────────────────
let monkeyX            = null;   // null → 캔버스 중앙
let isDraggingMonkey   = false;
let monkeyDragOffsetX  = 0;

// ── 캔버스 크기 (높이 = 뷰포트 × 2.5) ──────────────────────
function resize() {
  canvas.width  = wrap.clientWidth;
  canvas.height = window.innerHeight * WORLD_SCALE;
}
window.addEventListener("resize", resize);
resize();

const getEditorMatY = () => wrap.scrollTop + wrap.clientHeight - 80;

setTimeout(() => {
  wrap.scrollTop = wrap.scrollHeight - wrap.clientHeight;
}, 50);

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
        monkeyX        = route.monkeyX ?? null;
        if (route.scrollMode) {
          const sm = document.getElementById("scroll-mode");
          if (sm) sm.value = route.scrollMode;
          localStorage.setItem("routeScrollMode", route.scrollMode);
        }
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

// ── 팔레트 빌드 (색상 탭 + 썸네일) ─────────────────────────
const COLOR_TABS = [
  { id: "all",    label: "전체",   style: "background:linear-gradient(135deg,#ff9f43,#54a0ff)" },
  { id: "Yellow", label: "Yellow", style: "background:#f9ca24" },
  { id: "Red",    label: "Red",    style: "background:#ee5a24" },
  { id: "Black",  label: "Black",  style: "background:#2d3436" },
];
let activeColorTab = localStorage.getItem("holdColorTab") || "all";
let paletteEls = [];

function rebuildPalette() {
  palette.innerHTML = "";
  paletteEls = [];
  const filtered = (activeColorTab === "all")
    ? HOLD_TYPES.map((ht, i) => ({ ht, i }))
    : HOLD_TYPES.map((ht, i) => ({ ht, i })).filter(({ ht }) => ht.color === activeColorTab);
  if (selectedPaletteIdx !== null && !filtered.some(({ i }) => i === selectedPaletteIdx)) {
    selectedPaletteIdx = null;
  }
  for (const { ht, i } of filtered) {
    const el = document.createElement("div");
    el.className = "palette-item" + (selectedPaletteIdx === i ? " selected" : "");
    el.innerHTML = `<img src="./holds/${ht.img}" alt="${ht.label}"><span>${ht.label}</span>`;
    el.addEventListener("click", () => {
      selectedPaletteIdx = (selectedPaletteIdx === i) ? null : i;
      if (selectedPaletteIdx !== null) selectedHold = null;
      rebuildPalette();
    });
    palette.appendChild(el);
    paletteEls.push(el);
  }
}

const colorTabsEl  = document.getElementById("color-tabs");
const colorTabBtns = [];
for (const tab of COLOR_TABS) {
  const btn = document.createElement("button");
  btn.className = "color-tab" + (activeColorTab === tab.id ? " active" : "");
  btn.setAttribute("style", tab.style);
  btn.title = tab.label;
  btn.addEventListener("click", () => {
    activeColorTab = tab.id;
    localStorage.setItem("holdColorTab", activeColorTab);
    colorTabBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    rebuildPalette();
  });
  colorTabsEl.appendChild(btn);
  colorTabBtns.push(btn);
}
rebuildPalette();

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
  const rect = wrap.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top + wrap.scrollTop };
}

function getHoldAt(x, y) {
  for (let i = placedHolds.length - 1; i >= 0; i--) {
    if (Math.hypot(x - placedHolds[i].x, y - placedHolds[i].y) < 44) return placedHolds[i];
  }
  return null;
}

const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ── 원숭이 헬퍼 ─────────────────────────────────────────────
function getEditorFloorY() {
  return getEditorMatY();
}

// ── 마우스 이벤트 ───────────────────────────────────────────
canvas.addEventListener("mousedown", e => {
  if (e.button !== 0) return;

  // 원숭이 드래그 체크 (홀드 이벤트보다 우선)
  {
    const floorY  = getEditorFloorY();
    const mx      = e.clientX - wrap.getBoundingClientRect().left;
    const my      = e.clientY - wrap.getBoundingClientRect().top + wrap.scrollTop;
    const monX    = monkeyX ?? canvas.width / 2;
    if (Math.abs(mx - monX) < 40 && my > floorY - 250 && my < floorY + 10) {
      isDraggingMonkey  = true;
      monkeyDragOffsetX = mx - monX;
      return;
    }
  }

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
  if (isDraggingMonkey) {
    const mx = e.clientX - wrap.getBoundingClientRect().left;
    monkeyX  = Math.max(50, Math.min(canvas.width - 50, mx - monkeyDragOffsetX));
    return;
  }

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
  if (isDraggingMonkey) { isDraggingMonkey = false; return; }
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
// ── 사이드바 렌더 ────────────────────────────────────────────
function renderSidebar() {
  const list = document.getElementById("sidebar-list");
  if (!list) return;
  const routes = JSON.parse(localStorage.getItem("climbingRoutes") || "[]");
  if (routes.length === 0) {
    list.innerHTML = '<div id="sidebar-empty">저장된 루트가 없습니다</div>';
    return;
  }
  list.innerHTML = "";
  for (const route of [...routes].reverse()) {
    const date = new Date(route.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
    const item = document.createElement("div");
    item.className = "sidebar-route" + (route.id === currentRouteId ? " active" : "");

    const nameEl  = document.createElement("div");
    nameEl.className = "sidebar-route-name";
    nameEl.textContent = route.name;

    const dateEl  = document.createElement("div");
    dateEl.className = "sidebar-route-date";
    dateEl.textContent = date;

    const actions = document.createElement("div");
    actions.className = "sidebar-route-actions";

    const btnRename = document.createElement("button");
    btnRename.className = "btn-rename"; btnRename.title = "이름 수정"; btnRename.textContent = "✏️";

    const btnDelete = document.createElement("button");
    btnDelete.className = "btn-delete"; btnDelete.title = "삭제"; btnDelete.textContent = "🗑";

    actions.append(btnRename, btnDelete);
    item.append(nameEl, dateEl, actions);

    // 이름 인라인 수정
    btnRename.addEventListener("click", e => {
      e.stopPropagation();
      const input = document.createElement("input");
      input.type = "text"; input.value = route.name;
      input.style.cssText = "background:#0a0a14;color:#fff;border:1px solid #ff9f43;border-radius:6px;padding:2px 6px;font-family:'Poppins',sans-serif;font-size:12px;width:100%;outline:none;";
      nameEl.replaceWith(input);
      input.focus(); input.select();
      const save = () => {
        const newName = input.value.trim() || route.name;
        const rs = JSON.parse(localStorage.getItem("climbingRoutes") || "[]");
        const idx = rs.findIndex(r => r.id === route.id);
        if (idx >= 0) { rs[idx].name = newName; localStorage.setItem("climbingRoutes", JSON.stringify(rs)); }
        renderSidebar();
      };
      input.addEventListener("blur", save);
      input.addEventListener("keydown", ev => {
        if (ev.key === "Enter")  { ev.preventDefault(); input.blur(); }
        if (ev.key === "Escape") { input.value = route.name; input.blur(); }
      });
    });

    // 슬라이드아웃 삭제
    btnDelete.addEventListener("click", e => {
      e.stopPropagation();
      item.classList.add("removing");
      setTimeout(() => {
        const rs = JSON.parse(localStorage.getItem("climbingRoutes") || "[]");
        localStorage.setItem("climbingRoutes", JSON.stringify(rs.filter(r => r.id !== route.id)));
        if (currentRouteId === route.id) {
          currentRouteId = null; placedHolds = []; nextId = 0; selectedHold = null;
          localStorage.removeItem("lastRouteId");
        }
        renderSidebar();
      }, 200);
    });

    // 루트 로드
    item.addEventListener("click", () => {
      const holds2 = route.holds ?? [];
      placedHolds    = holds2.map(h => ({ scale: 1, rotation: 0, ...h }));
      nextId         = placedHolds.length > 0 ? Math.max(...placedHolds.map(h => h.id)) + 1 : 0;
      selectedHold   = null;
      currentRouteId = route.id;
      monkeyX        = route.monkeyX ?? null;
      localStorage.setItem("climbingRoute", JSON.stringify(holds2));
      localStorage.setItem("lastRouteId",   route.id);
      if (route.scrollMode) {
        localStorage.setItem("routeScrollMode", route.scrollMode);
        const sm = document.getElementById("scroll-mode");
        if (sm) sm.value = route.scrollMode;
      }
      renderSidebar();
    });

    list.appendChild(item);
  }
}

// scroll-mode 드롭다운 변경 시 현재 루트에 반영
document.getElementById("scroll-mode").addEventListener("change", e => {
  const mode = e.target.value;
  localStorage.setItem("routeScrollMode", mode);
  if (currentRouteId) {
    const rs  = JSON.parse(localStorage.getItem("climbingRoutes") || "[]");
    const idx = rs.findIndex(r => r.id === currentRouteId);
    if (idx >= 0) { rs[idx].scrollMode = mode; localStorage.setItem("climbingRoutes", JSON.stringify(rs)); }
  }
});

// 사이드바 새 루트 버튼
document.getElementById("btn-sidebar-new").addEventListener("click", () => {
  placedHolds = []; nextId = 0; selectedHold = null; currentRouteId = null; monkeyX = null;
  localStorage.removeItem("lastRouteId");
  renderSidebar();
  wrap.scrollTop = wrap.scrollHeight - wrap.clientHeight;
});

// ── 버튼 ────────────────────────────────────────────────────
document.getElementById("btn-save").addEventListener("click", () => {
  const routes = JSON.parse(localStorage.getItem("climbingRoutes") || "[]");
  const n      = routes.filter(r => r.id !== currentRouteId).length + 1;
  showSaveModal(`Project ${n}`, name => {
    const id    = currentRouteId || `route_${Date.now()}`;
    const route = {
      id, name,
      createdAt:  Date.now(),
      holds:      placedHolds,
      scrollMode: localStorage.getItem("routeScrollMode") || "follow",
      monkeyX:    monkeyX,
    };
    const idx = routes.findIndex(r => r.id === id);
    if (idx >= 0) routes[idx] = route; else routes.push(route);
    localStorage.setItem("climbingRoutes", JSON.stringify(routes));
    localStorage.setItem("climbingRoute",  JSON.stringify(placedHolds));
    localStorage.setItem("lastRouteId",    id);
    currentRouteId = id;
    renderSidebar();
  });
});
document.getElementById("btn-play").addEventListener("click", () => {
  window.location.href = "/";
});
document.getElementById("btn-reset").addEventListener("click", () => {
  placedHolds = []; nextId = 0; selectedHold = null; currentRouteId = null; monkeyX = null;
  localStorage.removeItem("lastRouteId");
  renderSidebar();
  wrap.scrollTop = wrap.scrollHeight - wrap.clientHeight;
});

// 초기 사이드바 렌더
renderSidebar();

// ── 렌더링 ──────────────────────────────────────────────────
function drawGrid() {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 80) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  const offsetY = wrap.scrollTop % 80;
  for (let y = -offsetY; y < wrap.clientHeight; y += 80) {
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

  // 타입 링 + 텍스트 (동적 반지름)
  if (h.type === "start" || h.type === "top") {
    const ringColor = h.type === "start" ? "#00d2a0" : "#ff9f43";
    const imgLoaded = img && img.complete && img.naturalWidth > 0;
    const iW = imgLoaded ? img.naturalWidth  * 0.2 * scale : 36 * scale;
    const iH = imgLoaded ? img.naturalHeight * 0.2 * scale : 36 * scale;
    const typeR = Math.max(iW, iH) / 2 + 12;
    ctx.save();
    ctx.beginPath(); ctx.arc(h.x, h.y, typeR, 0, Math.PI * 2);
    ctx.strokeStyle = ringColor; ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    ctx.save();
    ctx.font = "700 10px 'Poppins', sans-serif";
    ctx.fillStyle = ringColor; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(h.type === "start" ? "START" : "TOP", h.x, h.y + typeR + 12);
    ctx.restore();
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
  } else if (h.type !== "start" && h.type !== "top") {
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

function drawEditorFloor() {
  const W      = canvas.width;
  const floorY = wrap.clientHeight - 80;
  const matH   = 28;

  ctx.save();

  ctx.beginPath();
  ctx.moveTo(0, floorY - 4);
  ctx.lineTo(W, floorY - 4);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.roundRect(W * 0.05, floorY, W * 0.9, matH, 12);
  ctx.fillStyle = '#3d2a1a';
  ctx.fill();

  ctx.beginPath();
  ctx.roundRect(W * 0.05 + 3, floorY + 3, W * 0.9 - 6, matH - 6, 9);
  ctx.fillStyle = '#c8855a';
  ctx.globalAlpha = 0.75;
  ctx.fill();
  ctx.globalAlpha = 1;

  const sections = 5;
  for (let i = 1; i < sections; i++) {
    const sx = W * 0.05 + 3 + (W * 0.9 - 6) * (i / sections);
    ctx.beginPath();
    ctx.moveTo(sx, floorY + 4);
    ctx.lineTo(sx, floorY + matH - 4);
    ctx.strokeStyle = 'rgba(160,96,53,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.roundRect(W * 0.05 + 3, floorY + 3, W * 0.9 - 6, 6, [9, 9, 0, 0]);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();

  ctx.beginPath();
  ctx.rect(0, floorY + matH, W, 20);
  ctx.fillStyle = '#111118';
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < W; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, floorY + matH);
    ctx.lineTo(x, floorY + matH + 20);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, floorY + matH + 10);
  ctx.lineTo(W, floorY + matH + 10);
  ctx.stroke();

  ctx.beginPath();
  ctx.rect(0, floorY + matH + 20, W, 9999);
  ctx.fillStyle = '#0a0a14';
  ctx.fill();

  ctx.restore();
}

function drawEditorMonkey() {
  const x     = monkeyX ?? canvas.width / 2;
  const footY = wrap.clientHeight - 80;
  const kneeY    = footY - 32;
  const hipY     = footY - 65;
  const shoulderY = footY - 185;
  const neckY    = footY - 195;
  const headY    = footY - 220;

  const bone = (ax, ay, bx, by, w, color) => {
    ctx.save();
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke();
    ctx.restore();
  };
  const circ = (cx, cy, r, color) => {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.restore();
  };

  // 꼬리
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + 18, hipY);
  ctx.bezierCurveTo(x + 55, hipY + 20, x + 58, hipY + 50, x + 40, hipY + 55);
  ctx.strokeStyle = '#b07040'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.stroke();
  ctx.restore();

  // 다리
  bone(x - 8,  hipY, x - 14, kneeY, 10, '#b07040');
  bone(x - 14, kneeY, x - 10, footY,  9, '#b07040');
  bone(x + 8,  hipY, x + 14, kneeY, 10, '#b07040');
  bone(x + 14, kneeY, x + 10, footY,  9, '#b07040');

  // 발
  ctx.save();
  ctx.beginPath(); ctx.ellipse(x - 10, footY, 12, 7, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#b07040'; ctx.fill(); ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.ellipse(x + 10, footY, 12, 7, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#b07040'; ctx.fill(); ctx.restore();

  // 몸통
  ctx.save();
  ctx.beginPath(); ctx.ellipse(x, shoulderY + 60, 22, 30, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#c8855a'; ctx.fill();
  ctx.beginPath(); ctx.ellipse(x, shoulderY + 65, 13, 20, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#e8b48a'; ctx.fill();
  ctx.restore();

  // 팔
  bone(x - 18, shoulderY, x - 42, shoulderY + 45, 9, '#c8855a');
  bone(x - 42, shoulderY + 45, x - 44, shoulderY + 85, 8, '#c8855a');
  bone(x + 18, shoulderY, x + 42, shoulderY + 45, 9, '#c8855a');
  bone(x + 42, shoulderY + 45, x + 44, shoulderY + 85, 8, '#c8855a');

  // 손
  circ(x - 44, shoulderY + 87, 9, '#c8855a');
  circ(x + 44, shoulderY + 87, 9, '#c8855a');

  // 관절
  circ(x - 42, shoulderY + 45, 5, '#d4956a');
  circ(x + 42, shoulderY + 45, 5, '#d4956a');
  circ(x - 14, kneeY, 5, '#9a6035');
  circ(x + 14, kneeY, 5, '#9a6035');

  // 목
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x - 8, neckY, 16, 14, 6);
  ctx.fillStyle = '#c8855a'; ctx.fill(); ctx.restore();

  // 귀
  circ(x - 26, headY + 10, 10, '#c8855a');
  circ(x - 26, headY + 10,  6, '#e8b48a');
  circ(x + 26, headY + 10, 10, '#c8855a');
  circ(x + 26, headY + 10,  6, '#e8b48a');
  // 머리
  circ(x, headY + 10, 30, '#c8855a');
  // 주둥이
  ctx.save();
  ctx.beginPath(); ctx.ellipse(x, headY + 22, 16, 12, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#e8b48a'; ctx.fill(); ctx.restore();
  // 눈
  circ(x - 10, headY + 4, 6, '#fff');
  circ(x + 10, headY + 4, 6, '#fff');
  circ(x - 9,  headY + 5, 3.5, '#2a1a0a');
  circ(x + 11, headY + 5, 3.5, '#2a1a0a');
  circ(x - 7,  headY + 2, 1.5, '#fff');
  circ(x + 13, headY + 2, 1.5, '#fff');
  // 코
  ctx.save();
  ctx.beginPath(); ctx.ellipse(x, headY + 16, 4, 3, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#a06040'; ctx.fill(); ctx.restore();
  // 웃는 입
  ctx.save();
  ctx.beginPath(); ctx.arc(x, headY + 20, 8, 0.2, Math.PI - 0.2);
  ctx.strokeStyle = '#7a4030'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
  ctx.restore();

  // 드래그 핸들
  ctx.save();
  ctx.fillStyle = 'rgba(255,159,67,0.6)';
  ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('⟺', x, footY + 18);
  ctx.restore();
}

function render() {
  requestAnimationFrame(render);
  ctx.fillStyle = "#0a0a14";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawEditorFloor();
  drawEditorMonkey();
  for (const h of placedHolds) drawHold(h);
}

render();
