export class VerletBody {
  constructor() {
    // 신체 치수 (기존 character.js와 동일)
    this.UA = 90; this.FA = 85; this.TH = 95; this.SH = 88;
    this.TORSO = 120; this.SW = 62; this.HW = 46; this.HEAD_R = 22;

    this.gravity    = 1400;   // px/s^2
    this.damping    = 0.98;   // 감쇠 (출렁임 조절: 낮을수록 절제됨)
    this.iterations = 20;     // 제약 반복 (높을수록 단단함)

    this.points = {};   // { name: {x, y, px, py, pinned:{x,y}|null} }
    this.sticks = [];   // { a, b, len }
    this.groundY = Infinity;
    this._built = false;
  }

  // 매트 위 서있는 자세로 초기화
  init(cx, matY) {
    this.groundY = matY;
    const P = (name, x, y) => { this.points[name] = { x, y, px: x, py: y, pinned: null }; };

    const footY = matY;
    const kneeY = footY - this.SH;
    const hipY  = kneeY - this.TH;
    const shY   = hipY - this.TORSO;
    const headY = shY - this.HEAD_R - 12;

    P('head',      cx, headY);
    P('lShoulder', cx - this.SW/2, shY);
    P('rShoulder', cx + this.SW/2, shY);
    P('lElbow',    cx - this.SW/2 - 20, shY + this.UA);
    P('rElbow',    cx + this.SW/2 + 20, shY + this.UA);
    P('lHand',     cx - this.SW/2 - 25, shY + this.UA + this.FA);
    P('rHand',     cx + this.SW/2 + 25, shY + this.UA + this.FA);
    P('lHip',      cx - this.HW/2, hipY);
    P('rHip',      cx + this.HW/2, hipY);
    P('lKnee',     cx - this.HW/2, kneeY);
    P('rKnee',     cx + this.HW/2, kneeY);
    P('lFoot',     cx - this.HW/2 - 5, footY);
    P('rFoot',     cx + this.HW/2 + 5, footY);

    const S = (a, b, len) => this.sticks.push({ a, b, len });
    this.sticks = [];
    // 몸통 프레임
    S('lShoulder','rShoulder', this.SW);
    S('lHip','rHip',           this.HW);
    S('lShoulder','lHip',      this.TORSO);
    S('rShoulder','rHip',      this.TORSO);
    // 대각 보강 (몸통 접힘 방지)
    const diag = Math.hypot(this.SW/2 + this.HW/2, this.TORSO);
    S('lShoulder','rHip', diag);
    S('rShoulder','lHip', diag);
    // 머리
    S('head','lShoulder', Math.hypot(this.SW/2, this.HEAD_R + 12));
    S('head','rShoulder', Math.hypot(this.SW/2, this.HEAD_R + 12));
    // 팔
    S('lShoulder','lElbow', this.UA);
    S('lElbow','lHand',     this.FA);
    S('rShoulder','rElbow', this.UA);
    S('rElbow','rHand',     this.FA);
    // 다리
    S('lHip','lKnee',  this.TH);
    S('lKnee','lFoot', this.SH);
    S('rHip','rKnee',  this.TH);
    S('rKnee','rFoot', this.SH);

    // ── 소프트 스틱: 자세 붕괴 방지 (stiff = 복원 비율) ──
    const soft = (a, b, len, stiff) => this.sticks.push({ a, b, len, stiff });
    soft('lHip',      'lFoot', this.TH + this.SH,        0.15);
    soft('rHip',      'rFoot', this.TH + this.SH,        0.15);
    soft('lShoulder', 'lHand', (this.UA + this.FA) * 0.9, 0.05);
    soft('rShoulder', 'rHand', (this.UA + this.FA) * 0.9, 0.05);
    soft('lShoulder', 'lFoot', this.TORSO + this.TH + this.SH, 0.08);
    soft('rShoulder', 'rFoot', this.TORSO + this.TH + this.SH, 0.08);

    this._built = true;
  }

  // ── 핀 제어 ──────────────────────────────────────────────
  pin(name, x, y)  { const p = this.points[name]; if (p) p.pinned = { x, y }; }
  unpin(name)      { const p = this.points[name]; if (p) p.pinned = null; }
  unpinAll()       { for (const p of Object.values(this.points)) p.pinned = null; }

  // 부드러운 유도: 핀 대신 스프링으로 목표를 향해 끌어당김 (자유 손 이동용)
  attract(name, tx, ty, strength = 0.25) {
    const p = this.points[name];
    if (!p || p.pinned) return;
    p.x += (tx - p.x) * strength;
    p.y += (ty - p.y) * strength;
  }

  // ── 물리 스텝 ────────────────────────────────────────────
  update(dt) {
    if (!this._built) return;
    const dt2 = Math.min(dt, 1/30) ** 2;

    // 1) Verlet 적분 (관성 + 중력)
    for (const p of Object.values(this.points)) {
      if (p.pinned) { p.x = p.pinned.x; p.y = p.pinned.y; p.px = p.x; p.py = p.y; continue; }
      const vx = (p.x - p.px) * this.damping;
      const vy = (p.y - p.py) * this.damping;
      p.px = p.x; p.py = p.y;
      p.x += vx;
      p.y += vy + this.gravity * dt2;
    }

    // 2) 제약 반복
    for (let i = 0; i < this.iterations; i++) {
      for (const s of this.sticks) {
        const A = this.points[s.a], B = this.points[s.b];
        const dx = B.x - A.x, dy = B.y - A.y;
        const d  = Math.hypot(dx, dy) || 0.0001;
        let diff = (d - s.len) / d;
        if (s.stiff !== undefined) {
          if (d > s.len) continue;   // 소프트 스틱은 접힘만 복원 (늘어남은 관여 X)
          diff *= s.stiff;
        }
        const aw = A.pinned ? 0 : 0.5;
        const bw = B.pinned ? 0 : 0.5;
        const total = aw + bw || 1;
        A.x += dx * diff * (aw / total);
        A.y += dy * diff * (aw / total);
        B.x -= dx * diff * (bw / total);
        B.y -= dy * diff * (bw / total);
      }
      // 바닥 충돌 (매트) — 발 우선 보정
      for (const p of Object.values(this.points)) {
        if (!p.pinned && p.y > this.groundY) {
          p.y = this.groundY;
          p.py = p.y - (p.x - p.px) * 0; // 수직속도 제거
          p.py = this.groundY - (this.groundY - p.py) * 0.3; // 약한 반발 감쇠만 유지
          p.px = p.x - (p.x - p.px) * 0.6; // 수평 마찰
        }
      }
    }
  }

  // ── 상태 조회 ────────────────────────────────────────────
  isOnGround() {
    const lf = this.points.lFoot, rf = this.points.rFoot;
    const still = Math.abs(lf.y - lf.py) < 1.5 && Math.abs(rf.y - rf.py) < 1.5;
    return still && lf.y >= this.groundY - 2 && rf.y >= this.groundY - 2;
  }

  // renderer.drawCharacter 호환 pose 반환
  getPose() {
    const p = this.points;
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    return {
      head: { x: p.head.x, y: p.head.y },
      neck:   mid(p.lShoulder, p.rShoulder),
      pelvis: mid(p.lHip, p.rHip),
      lShoulder: p.lShoulder, rShoulder: p.rShoulder,
      lElbow: p.lElbow, rElbow: p.rElbow,
      lHand:  p.lHand,  rHand:  p.rHand,
      lHip:   p.lHip,   rHip:   p.rHip,
      lKnee:  p.lKnee,  rKnee:  p.rKnee,
      lFoot:  p.lFoot,  rFoot:  p.rFoot,
      lArmStretched: false, rArmStretched: false,
      lLegStretched: false, rLegStretched: false,
    };
  }
}
