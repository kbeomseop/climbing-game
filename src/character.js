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
    this.UA = 90;
    this.FA = 85;
    this.TH = 95;
    this.SH = 88;
    this.TORSO = 120;
    this.HEAD_R = 22;
    this.SW = 62;
    this.HW = 46;

    this.smoothL     = null;
    this.smoothR     = null;
    this.smoothLFoot = null;
    this.smoothRFoot = null;
  }

  compute(lHold, rHold, footHolds) {
    const lh = lHold ?? { x: 320, y: 520 };
    const rh = rHold ?? { x: 620, y: 520 };

    const LERP = 0.12;

    if (!this.smoothL) this.smoothL = { x: lh.x, y: lh.y };
    if (!this.smoothR) this.smoothR = { x: rh.x, y: rh.y };
    this.smoothL.x += (lh.x - this.smoothL.x) * LERP;
    this.smoothL.y += (lh.y - this.smoothL.y) * LERP;
    this.smoothR.x += (rh.x - this.smoothR.x) * LERP;
    this.smoothR.y += (rh.y - this.smoothR.y) * LERP;

    const lh_s = this.smoothL;
    const rh_s = this.smoothR;

    const cx = (lh_s.x + rh_s.x) / 2;
    const cy = (lh_s.y + rh_s.y) / 2;

    const shoulderY = cy + 55;
    const hipY      = shoulderY + this.TORSO;

    // 몸통 기울기: 양손 높이 차에 따라 어깨 Y 오프셋
    const handYDiff  = lh_s.y - rh_s.y;
    const tiltOffset = handYDiff * 0.15;
    const lShoulder  = { x: cx - this.SW / 2, y: shoulderY + tiltOffset };
    const rShoulder  = { x: cx + this.SW / 2, y: shoulderY - tiltOffset };

    const lHip   = { x: cx - this.HW / 2, y: hipY };
    const rHip   = { x: cx + this.HW / 2, y: hipY };
    const neck   = { x: cx, y: shoulderY };
    const pelvis = { x: cx, y: hipY };
    const head   = { x: cx, y: shoulderY - this.HEAD_R - 6 };

    // ── 팔 클램핑 ──────────────────────────────────────────
    const ARM_MAX      = this.UA + this.FA;
    const lHandClamped = clampTarget(lShoulder, lh_s, ARM_MAX);
    const rHandClamped = clampTarget(rShoulder, rh_s, ARM_MAX);

    const lArmDist = Math.hypot(lh_s.x - lShoulder.x, lh_s.y - lShoulder.y);
    const rArmDist = Math.hypot(rh_s.x - rShoulder.x, rh_s.y - rShoulder.y);

    const lElbow = ik2(lShoulder, lHandClamped, this.UA, this.FA, -1);
    const rElbow = ik2(rShoulder, rHandClamped, this.UA, this.FA,  1);

    // ── 다리 lerp ──────────────────────────────────────────
    const LEG_MAX    = this.TH + this.SH;
    const lFootTarget = footHolds[0] ?? { x: lHip.x - 12, y: hipY + LEG_MAX };
    const rFootTarget = footHolds[1] ?? { x: rHip.x + 12, y: hipY + LEG_MAX };

    const FOOT_LERP = 0.08;
    if (!this.smoothLFoot) this.smoothLFoot = { x: lHip.x, y: hipY + LEG_MAX };
    if (!this.smoothRFoot) this.smoothRFoot = { x: rHip.x, y: hipY + LEG_MAX };
    this.smoothLFoot.x += (lFootTarget.x - this.smoothLFoot.x) * FOOT_LERP;
    this.smoothLFoot.y += (lFootTarget.y - this.smoothLFoot.y) * FOOT_LERP;
    this.smoothRFoot.x += (rFootTarget.x - this.smoothRFoot.x) * FOOT_LERP;
    this.smoothRFoot.y += (rFootTarget.y - this.smoothRFoot.y) * FOOT_LERP;

    const lFootClamped = clampTarget(lHip, this.smoothLFoot, LEG_MAX);
    const rFootClamped = clampTarget(rHip, this.smoothRFoot, LEG_MAX);

    const lLegDist = Math.hypot(lFootTarget.x - lHip.x, lFootTarget.y - lHip.y);
    const rLegDist = Math.hypot(rFootTarget.x - rHip.x, rFootTarget.y - rHip.y);

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
      lArmStretched: lArmDist > ARM_MAX * 0.9,
      rArmStretched: rArmDist > ARM_MAX * 0.9,
      lLegStretched: lLegDist > LEG_MAX * 0.9,
      rLegStretched: rLegDist > LEG_MAX * 0.9,
    };
  }
}
