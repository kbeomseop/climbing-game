// MediaPipe hand landmark connections
const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

export class Renderer {
  constructor(canvas) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext("2d");
    this._imgCache = new Map();
    this.scrollY  = 0;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  _getImg(name) {
    if (!this._imgCache.has(name)) {
      const img = new Image();
      img.src = `/holds/${name}`;
      this._imgCache.set(name, img);
    }
    return this._imgCache.get(name);
  }

  resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  // ── 배경 + 스크롤 그리드 ─────────────────────────────────
  clear() {
    const ctx = this.ctx;
    ctx.fillStyle = "#0a0a14";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 그리드: 수직선(고정), 수평선(스크롤 따라 타일링)
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth   = 1;
    for (let x = 0; x < this.canvas.width; x += 80) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.canvas.height); ctx.stroke();
    }
    const offsetY = this.scrollY % 80;
    for (let y = -offsetY; y < this.canvas.height; y += 80) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.canvas.width, y); ctx.stroke();
    }
    ctx.restore();
  }

  // ── START / TOP 필 뱃지 ─────────────────────────────────
  _drawTypePill(x, y, type) {
    const ctx = this.ctx;
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
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ── 홀드 렌더링 ──────────────────────────────────────────
  drawHolds(holds, lHold, rHold, hoverHold = null) {
    const ctx = this.ctx;
    const sy  = this.scrollY;

    for (const h of holds) {
      const gripped   = lHold?.id === h.id || rHold?.id === h.id;
      const screenY   = h.y - sy;
      const typeColor = h.type === "start" ? "#00e676"
                      : h.type === "top"   ? "#ff6d00"
                      : null;

      if (h.img) {
        // 이미지 홀드
        const img      = this._getImg(h.img);
        const scale    = h.scale    ?? 1;
        const rotation = h.rotation ?? 0;

        ctx.save();
        if (gripped)                       { ctx.shadowBlur = 32; ctx.shadowColor = "rgba(144,202,249,0.7)"; }
        else if (hoverHold?.id === h.id)   { ctx.shadowBlur = 48; ctx.shadowColor = "rgba(255,255,160,0.95)"; }
        if (img.complete && img.naturalWidth > 0) {
          const dw = img.naturalWidth  * 0.2 * scale;
          const dh = img.naturalHeight * 0.2 * scale;
          ctx.translate(h.x, screenY);
          ctx.rotate((rotation * Math.PI) / 180);
          ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        } else {
          ctx.beginPath();
          ctx.arc(h.x, screenY, gripped ? 22 : 17, 0, Math.PI * 2);
          ctx.strokeStyle = gripped ? "#90caf9" : "#42a5f5";
          ctx.lineWidth   = gripped ? 3 : 2;
          ctx.stroke();
        }
        ctx.restore();

        // 타입 링 + 텍스트 (홀드 크기 기반 반지름)
        if (typeColor) {
          const baseW  = img.complete && img.naturalWidth > 0 ? img.naturalWidth  * 0.2 : 40;
          const baseH  = img.complete && img.naturalWidth > 0 ? img.naturalHeight * 0.2 : 40;
          const typeR  = Math.max(baseW, baseH) * scale * 0.6 + 6;
          const ringColor = h.type === "start" ? "#00d2a0" : "#ff9f43";
          ctx.save();
          ctx.beginPath();
          ctx.arc(h.x, screenY, typeR, 0, Math.PI * 2);
          ctx.strokeStyle = ringColor;
          ctx.lineWidth   = 2.5;
          ctx.shadowBlur  = 12;
          ctx.shadowColor = ringColor;
          ctx.stroke();
          ctx.restore();
          ctx.save();
          ctx.font         = "700 10px 'Poppins', sans-serif";
          ctx.fillStyle    = ringColor;
          ctx.textAlign    = "center";
          ctx.textBaseline = "top";
          ctx.fillText(h.type === "start" ? "START" : "TOP", h.x, screenY + typeR + 4);
          ctx.restore();
        }

        // 그립 링
        if (gripped) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(h.x, screenY, 40, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(144,202,249,0.5)";
          ctx.lineWidth   = 2;
          ctx.stroke();
          ctx.restore();
        }
        continue;
      }

      // 기본 원형 홀드
      let color, glow;
      if (h.type === "start") { color = "#00e676"; glow = "rgba(0,230,118,0.5)"; }
      else if (h.type === "top") { color = "#ff6d00"; glow = "rgba(255,109,0,0.5)"; }
      else {
        color = gripped ? "#90caf9" : "#42a5f5";
        glow  = gripped ? "rgba(144,202,249,0.5)" : "rgba(66,165,245,0.25)";
      }
      const outerR = gripped ? 22 : 17;
      const innerR = gripped ? 9  : 6;
      ctx.save();
      ctx.shadowBlur  = gripped ? 32 : (hoverHold?.id === h.id ? 48 : 18);
      ctx.shadowColor = (!gripped && hoverHold?.id === h.id) ? "rgba(255,255,160,0.95)" : glow;
      ctx.beginPath();
      ctx.arc(h.x, screenY, outerR, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth   = gripped ? 3 : 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(h.x, screenY, innerR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();

      if (typeColor) {
        const typeR     = outerR + 6;
        const ringColor = h.type === "start" ? "#00d2a0" : "#ff9f43";
        ctx.save();
        ctx.beginPath();
        ctx.arc(h.x, screenY, typeR, 0, Math.PI * 2);
        ctx.strokeStyle = ringColor;
        ctx.lineWidth   = 2.5;
        ctx.shadowBlur  = 12;
        ctx.shadowColor = ringColor;
        ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.font         = "700 10px 'Poppins', sans-serif";
        ctx.fillStyle    = ringColor;
        ctx.textAlign    = "center";
        ctx.textBaseline = "top";
        ctx.fillText(h.type === "start" ? "START" : "TOP", h.x, screenY + typeR + 4);
        ctx.restore();
      }
    }
  }

  // ── 모션 감지 ────────────────────────────────────────────
  _detectMotion(pose) {
    const shoulderY = (pose.lShoulder.y + pose.rShoulder.y) / 2;
    const lUp = pose.lHand.y < shoulderY - 30;
    const rUp = pose.rHand.y < shoulderY - 30;
    if (lUp && rUp) return "SUMMIT";
    if (lUp || rUp) return "REACH";
    return "DEFAULT";
  }

  // ── 캐릭터 (월드 좌표 → 카메라 translate로 스크린 변환) ──
  drawCharacter(pose) {
    if (!pose) return;
    const ctx = this.ctx;

    // 카메라 오프셋 적용: 이후 모든 월드 좌표가 스크린 좌표로 변환됨
    ctx.save();
    ctx.translate(0, -this.scrollY);

    const MAIN  = "#c8855a";
    const PATCH = "#e8b48a";
    const LIMB  = "#b07040";
    const JOINT = "#d4956a";
    const EYE   = "#2a1a0a";
    const NOSE  = "#a06040";
    const WHITE = "#ffffff";
    const MOUTH = "#7a4030";

    const motion = this._detectMotion(pose);

    const circ = (x, y, r, color) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    };

    const bone = (a, b, w, color) => {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
    };

    // ── 꼬리 ────────────────────────────────────────────────
    {
      const p = pose.pelvis;
      let cp1y, cp2y, endY;
      if (motion === "SUMMIT")     { cp1y = p.y - 40; cp2y = p.y - 80; endY = p.y - 70; }
      else if (motion === "REACH") { cp1y = p.y + 10; cp2y = p.y - 30; endY = p.y - 20; }
      else                         { cp1y = p.y + 30; cp2y = p.y + 10; endY = p.y - 5;  }
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(p.x + 18, p.y);
      ctx.bezierCurveTo(p.x + 60, cp1y, p.x + 65, cp2y, p.x + 42, endY);
      ctx.strokeStyle = LIMB;
      ctx.lineWidth   = 8;
      ctx.lineCap     = "round";
      ctx.stroke();
      ctx.restore();
    }

    // ── 다리 ────────────────────────────────────────────────
    bone(pose.lHip, pose.lKnee, 10, LIMB);
    bone(pose.lKnee, pose.lFoot, 9, LIMB);
    bone(pose.rHip, pose.rKnee, 10, LIMB);
    bone(pose.rKnee, pose.rFoot, 9, LIMB);

    const drawFoot = f => {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, 12, 7, 0, 0, Math.PI * 2);
      ctx.fillStyle = LIMB; ctx.fill();
      ctx.restore();
      circ(f.x - 9, f.y - 5, 4,   LIMB);
      circ(f.x,     f.y - 7, 4,   LIMB);
      circ(f.x + 8, f.y - 5, 3.5, LIMB);
    };
    drawFoot(pose.lFoot);
    drawFoot(pose.rFoot);

    // ── 몸통 ────────────────────────────────────────────────
    {
      const cx = pose.pelvis.x;
      const cy = (pose.neck.y + pose.pelvis.y) / 2;
      const ry = (pose.pelvis.y - pose.neck.y) / 2 + 4;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, 22, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = MAIN; ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4, 13, ry * 0.7, 0, 0, Math.PI * 2);
      ctx.fillStyle = PATCH; ctx.fill();
      ctx.restore();
    }

    // ── 팔 ──────────────────────────────────────────────────
    bone(pose.lShoulder, pose.lElbow, 9, MAIN);
    bone(pose.lElbow,    pose.lHand,  8, MAIN);
    bone(pose.rShoulder, pose.rElbow, 9, MAIN);
    bone(pose.rElbow,    pose.rHand,  8, MAIN);

    const drawHand = h => {
      circ(h.x, h.y, 9, MAIN);
      circ(h.x - 8, h.y - 5, 5,   PATCH);
      circ(h.x,     h.y - 8, 5,   PATCH);
      circ(h.x + 7, h.y - 5, 4.5, PATCH);
    };
    drawHand(pose.lHand);
    drawHand(pose.rHand);

    // ── 관절 ────────────────────────────────────────────────
    circ(pose.lShoulder.x, pose.lShoulder.y, 5, JOINT);
    circ(pose.rShoulder.x, pose.rShoulder.y, 5, JOINT);
    circ(pose.lElbow.x,    pose.lElbow.y,    5, JOINT);
    circ(pose.rElbow.x,    pose.rElbow.y,    5, JOINT);
    circ(pose.lKnee.x,     pose.lKnee.y,     5, JOINT);
    circ(pose.rKnee.x,     pose.rKnee.y,     5, JOINT);

    // ── 머리 ────────────────────────────────────────────────
    {
      const hx = pose.head.x;
      const hy = pose.head.y;
      const R  = 30;

      circ(hx - R + 4, hy, 10, MAIN);
      circ(hx - R + 4, hy,  6, PATCH);
      circ(hx + R - 4, hy, 10, MAIN);
      circ(hx + R - 4, hy,  6, PATCH);
      circ(hx, hy, R, MAIN);

      ctx.save();
      ctx.beginPath();
      ctx.ellipse(hx, hy + 10, 16, 12, 0, 0, Math.PI * 2);
      ctx.fillStyle = PATCH; ctx.fill();
      ctx.restore();

      if (motion === "SUMMIT") {
        ctx.save();
        ctx.strokeStyle = EYE; ctx.lineWidth = 2.5; ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(hx - 10, hy - 4, 6, Math.PI + 0.3, Math.PI * 2 - 0.3); ctx.stroke();
        ctx.beginPath(); ctx.arc(hx + 10, hy - 4, 6, Math.PI + 0.3, Math.PI * 2 - 0.3); ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.beginPath(); ctx.ellipse(hx, hy + 6, 4, 3, 0, 0, Math.PI * 2);
        ctx.fillStyle = NOSE; ctx.fill(); ctx.restore();
        circ(hx - 2, hy + 6, 1.5, "#7a4030");
        circ(hx + 2, hy + 6, 1.5, "#7a4030");
        ctx.save();
        ctx.beginPath(); ctx.arc(hx, hy + 10, 10, 0.15, Math.PI - 0.15);
        ctx.strokeStyle = MOUTH; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.fillStyle = "#f4c842"; ctx.font = "bold 16px sans-serif";
        ctx.fillText("★", hx + R + 2, hy - R + 4);
        ctx.font = "bold 11px sans-serif"; ctx.fillText("✦", hx - R - 12, hy - R + 2);
        ctx.restore();

      } else if (motion === "REACH") {
        circ(hx - 10, hy - 6, 6,   WHITE);
        circ(hx + 10, hy - 6, 6,   WHITE);
        circ(hx - 9,  hy - 5, 4,   EYE);
        circ(hx + 11, hy - 5, 4,   EYE);
        circ(hx - 7,  hy - 8, 1.5, WHITE);
        circ(hx + 13, hy - 8, 1.5, WHITE);
        ctx.save();
        ctx.beginPath(); ctx.ellipse(hx, hy + 6, 4, 3, 0, 0, Math.PI * 2);
        ctx.fillStyle = NOSE; ctx.fill(); ctx.restore();
        circ(hx - 2, hy + 6, 1.5, "#7a4030");
        circ(hx + 2, hy + 6, 1.5, "#7a4030");
        ctx.save();
        ctx.beginPath(); ctx.moveTo(hx - 5, hy + 12); ctx.lineTo(hx + 5, hy + 12);
        ctx.strokeStyle = PATCH; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
        ctx.save();
        ctx.beginPath(); ctx.ellipse(hx, hy + 16, 5, 4, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#d04060"; ctx.fill(); ctx.restore();
        ctx.save();
        ctx.fillStyle = "#88bbdd"; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.ellipse(hx + R, hy - 6, 3, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(hx + R, hy - 11, 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

      } else {
        circ(hx - 10, hy - 6, 6,   WHITE);
        circ(hx + 10, hy - 6, 6,   WHITE);
        circ(hx - 9,  hy - 5, 3.5, EYE);
        circ(hx + 11, hy - 5, 3.5, EYE);
        circ(hx - 7,  hy - 8, 1.5, WHITE);
        circ(hx + 13, hy - 8, 1.5, WHITE);
        ctx.save();
        ctx.beginPath(); ctx.ellipse(hx, hy + 6, 4, 3, 0, 0, Math.PI * 2);
        ctx.fillStyle = NOSE; ctx.fill(); ctx.restore();
        circ(hx - 2, hy + 6, 1.5, "#7a4030");
        circ(hx + 2, hy + 6, 1.5, "#7a4030");
        ctx.save();
        ctx.beginPath(); ctx.arc(hx, hy + 10, 8, 0.2, Math.PI - 0.2);
        ctx.strokeStyle = MOUTH; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore(); // 카메라 translate 해제
  }

  // ── 마우스 모드 커서 ──────────────────────────────────────
  drawMouseCursors({ mouseMode, mouse, activeKey, lastKey }) {
    if (!mouseMode) return;
    const ctx    = this.ctx;
    const isLeft = (activeKey ?? lastKey) === 'a';
    const color  = isLeft ? "rgba(80,210,255,0.9)" : "rgba(255,165,80,0.9)";
    const bright = !!activeKey;

    ctx.save();
    ctx.globalAlpha = bright ? 0.9 : 0.35;
    ctx.shadowBlur  = bright ? 24 : 8;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  // ── 손 랜드마크 (뷰포트 좌표, scrollY 불필요) ─────────────
  drawHandLandmarks(hands) {
    const ctx = this.ctx;
    for (const hand of hands) {
      const pts = hand.landmarks;
      const isScreenLeft = hand.palmCenter.x < this.canvas.width / 2;
      const color = isScreenLeft ? "rgba(80,210,255,0.85)" : "rgba(255,165,80,0.85)";
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.shadowBlur = 8; ctx.shadowColor = color;
      for (const [a, b] of CONNECTIONS) {
        ctx.beginPath();
        ctx.moveTo(pts[a].x, pts[a].y);
        ctx.lineTo(pts[b].x, pts[b].y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      for (const pt of pts) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
      }
      ctx.restore();
    }
  }

  // ── UI (뷰포트 고정, scrollY 불필요) ─────────────────────
  drawUI(state) {
    const ctx = this.ctx;
    ctx.save();
    if (!state.ready) {
      ctx.font      = "700 22px 'Poppins', sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText("로딩 중...", 24, 44);
      ctx.restore();
      return;
    }
    if (state.noCam && !state.mouseMode) {
      ctx.font      = "600 15px 'Poppins', sans-serif";
      ctx.fillStyle = "rgba(255,200,50,0.92)";
      ctx.fillText("📷 카메라 없음 — 편집 모드만 가능", 24, 36);
      ctx.restore();
      return;
    }

    // 타이틀 (항상)
    ctx.font      = "700 18px 'Poppins', sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText("🧗 Climbing", 24, 36);

    if (state.mouseMode) {
      // 마우스 모드 표시
      ctx.font      = "600 12px 'Poppins', sans-serif";
      ctx.fillStyle = "#ff9f43";
      ctx.fillText("🖱 마우스 모드", 24, 58);
      // 홀드 상태
      ctx.font = "400 12px 'Poppins', sans-serif";
      if (state.lHold) {
        ctx.fillStyle = "rgba(80,210,255,0.85)";
        ctx.fillText(`L: Hold #${state.lHold.id} (${state.lHold.type})`, 24, 80);
      }
      if (state.rHold) {
        ctx.fillStyle = "rgba(255,165,80,0.85)";
        ctx.fillText(`R: Hold #${state.rHold.id} (${state.rHold.type})`, 24, 98);
      }
      // 하단 힌트
      ctx.font      = "400 12px 'Poppins', sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.textAlign = "center";
      ctx.fillText("A = 왼손  |  D = 오른손  |  클릭 = 확정", this.canvas.width / 2, this.canvas.height - 28);
    } else {
      // 카메라 모드 홀드 상태
      ctx.font = "400 12px 'Poppins', sans-serif";
      if (state.lHold) {
        ctx.fillStyle = "rgba(80,210,255,0.85)";
        ctx.fillText(`L: Hold #${state.lHold.id} (${state.lHold.type})`, 24, 62);
      }
      if (state.rHold) {
        ctx.fillStyle = "rgba(255,165,80,0.85)";
        ctx.fillText(`R: Hold #${state.rHold.id} (${state.rHold.type})`, 24, 80);
      }
    }

    // SUMMIT (공통)
    if (state.lHold?.type === "top" || state.rHold?.type === "top") {
      ctx.font      = "700 36px 'Poppins', sans-serif";
      ctx.fillStyle = "#ff9f43";
      ctx.textAlign = "center";
      ctx.fillText("🏆 SUMMIT!", this.canvas.width / 2, this.canvas.height / 2);
    }
    ctx.restore();
  }
}
