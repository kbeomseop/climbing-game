function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// 2-bone IK: returns joint (elbow/knee) position
// bendSign: +1 = clockwise bend in canvas coords, -1 = counter-clockwise
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

    // Body hangs below the midpoint of hands
    const shoulderY = cy + 55;
    const hipY = shoulderY + this.TORSO;

    const lShoulder = { x: cx - this.SW / 2, y: shoulderY };
    const rShoulder = { x: cx + this.SW / 2, y: shoulderY };
    const lHip = { x: cx - this.HW / 2, y: hipY };
    const rHip = { x: cx + this.HW / 2, y: hipY };
    const neck = { x: cx, y: shoulderY };
    const pelvis = { x: cx, y: hipY };
    const head = { x: cx, y: shoulderY - this.HEAD_R - 6 };

    // Arms: left elbow bends left (-1), right elbow bends right (+1)
    const lElbow = ik2(lShoulder, lh, this.UA, this.FA, -1);
    const rElbow = ik2(rShoulder, rh, this.UA, this.FA, 1);

    // Feet default to hanging position if no hold
    const lFoot = footHolds[0] ?? { x: lHip.x - 12, y: hipY + this.TH + this.SH };
    const rFoot = footHolds[1] ?? { x: rHip.x + 12, y: hipY + this.TH + this.SH };

    // Knees: spread outward (+1 left, -1 right)
    const lKnee = ik2(lHip, lFoot, this.TH, this.SH, 1);
    const rKnee = ik2(rHip, rFoot, this.TH, this.SH, -1);

    return {
      head, neck, pelvis,
      lShoulder, rShoulder,
      lElbow, rElbow,
      lHand: lh, rHand: rh,
      lHip, rHip,
      lKnee, rKnee,
      lFoot, rFoot,
    };
  }
}
