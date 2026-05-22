function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// 2-bone IK: returns joint (elbow/knee) position
function ik2(origin, target, len1, len2, bendSign) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  let d = Math.hypot(dx, dy);
  d = clamp(d, Math.abs(len1 - len2) + 0.001, len1 + len2 - 0.001);

  const cosA = (len1 * len1 + d * d - len2 * len2) / (2 * len1 * d);
  const a = Math.acos(clamp(cosA, -1, 1));
  const base = Math.atan2(dy, dx);
  const jAngle = base + bendSign * a;

  return {
    x: origin.x + Math.cos(jAngle) * len1,
    y: origin.y + Math.sin(jAngle) * len1,
  };
}

function clampTarget(origin, target, maxDist) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const d  = Math.hypot(dx, dy);
  if (d <= maxDist) return target;
  return {
    x: origin.x + (dx / d) * maxDist,
    y: origin.y + (dy / d) * maxDist,
  };
}

export class Character {
  constructor() {
    this.UA = 90;      // upper arm length
    this.FA = 85;      // forearm length
    this.TH = 95;      // thigh length
    this.SH = 88;      // shin length
    this.TORSO = 120;  // torso length
    this.HEAD_R = 22;
    this.SW = 62;      // shoulder width
    this.HW = 46;      // hip width
  }

  compute(lHold, rHold, footHolds) {
    const lh = lHold ?? { x: 320, y: 520 };
    const rh = rHold ?? { x: 620, y: 520 };

    const cx = (lh.x + rh.x) / 2;
    const cy = (lh.y + rh.y) / 2;

    const shoulderY  = cy + 55;
    const hipY       = shoulderY + this.TORSO;

    const lShoulder = { x: cx - this.SW / 2, y: shoulderY };
    const rShoulder = { x: cx + this.SW / 2, y: shoulderY };
    const lHip      = { x: cx - this.HW / 2, y: hipY };
    const rHip      = { x: cx + this.HW / 2, y: hipY };
    const neck      = { x: cx, y: shoulderY };
    const pelvis    = { x: cx, y: hipY };
    const head      = { x: cx, y: shoulderY - this.HEAD_R - 6 };

    // ── 팔 클램핑 ──────────────────────────────────────────
    const ARM_MAX = this.UA + this.FA;   // 175px
    const lHandClamped = clampTarget(lShoulder, lh, ARM_MAX);
    const rHandClamped = clampTarget(rShoulder, rh, ARM_MAX);

    const lArmDist = Math.hypot(lh.x - lShoulder.x, lh.y - lShoulder.y);
    const rArmDist = Math.hypot(rh.x - rShoulder.x, rh.y - rShoulder.y);

    const lElbow = ik2(lShoulder, lHandClamped, this.UA, this.FA, -1);
    const rElbow = ik2(rShoulder, rHandClamped, this.UA, this.FA,  1);

    // ── 다리 클램핑 ────────────────────────────────────────
    const LEG_MAX = this.TH + this.SH;   // 183px
    const lFootRaw = footHolds[0] ?? { x: lHip.x - 12, y: hipY + this.TH + this.SH };
    const rFootRaw = footHolds[1] ?? { x: rHip.x + 12, y: hipY + this.TH + this.SH };

    const lFootClamped = clampTarget(lHip, lFootRaw, LEG_MAX);
    const rFootClamped = clampTarget(rHip, rFootRaw, LEG_MAX);

    const lLegDist = Math.hypot(lFootRaw.x - lHip.x, lFootRaw.y - lHip.y);
    const rLegDist = Math.hypot(rFootRaw.x - rHip.x, rFootRaw.y - rHip.y);

    const lKnee = ik2(lHip, lFootClamped, this.TH, this.SH,  1);
    const rKnee = ik2(rHip, rFootClamped, this.TH, this.SH, -1);

    return {
      head, neck, pelvis,
      lShoulder, rShoulder,
      lElbow, rElbow,
      lHand:  lHandClamped,
      rHand:  rHandClamped,
      lHip,   rHip,
      lKnee,  rKnee,
      lFoot:  lFootClamped,
      rFoot:  rFootClamped,
      // 스트레치 여부 (renderer에서 색상 변환용)
      lArmStretched: lArmDist > ARM_MAX * 0.9,
      rArmStretched: rArmDist > ARM_MAX * 0.9,
      lLegStretched: lLegDist > LEG_MAX * 0.9,
      rLegStretched: rLegDist > LEG_MAX * 0.9,
    };
  }
}
