const SNAP_R = 70;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function createHolds(w, h) {
  // localStorage에 저장된 루트가 있으면 우선 사용
  const saved = localStorage.getItem("climbingRoute");
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (Array.isArray(data) && data.length > 0) return data;
    } catch {}
  }

  // 기본 홀드 10개 (화면 비율 기반)
  return [
    { id: 0, x: w * 0.25, y: h * 0.85, type: "start" },
    { id: 1, x: w * 0.75, y: h * 0.85, type: "start" },
    { id: 2, x: w * 0.50, y: h * 0.08, type: "top"   },
    { id: 3, x: w * 0.30, y: h * 0.72, type: "hold"  },
    { id: 4, x: w * 0.70, y: h * 0.68, type: "hold"  },
    { id: 5, x: w * 0.20, y: h * 0.57, type: "hold"  },
    { id: 6, x: w * 0.58, y: h * 0.52, type: "hold"  },
    { id: 7, x: w * 0.38, y: h * 0.40, type: "hold"  },
    { id: 8, x: w * 0.72, y: h * 0.33, type: "hold"  },
    { id: 9, x: w * 0.28, y: h * 0.22, type: "hold"  },
  ];
}

export class ClimbingState {
  constructor(holds) {
    this.holds = holds;

    this.leftHold  = null;
    this.rightHold = null;
  }

  update(hands, canvasWidth, physics, scrollY = 0) {
    const half = canvasWidth / 2;
    for (const hand of hands) {
      const isLeft = hand.palmCenter.x < half;
      const pos    = { x: hand.palmCenter.x, y: hand.palmCenter.y + scrollY };

      let nearest     = null;
      let nearestDist = Infinity;
      for (const h of this.holds) {
        const d = dist(pos, h);
        if (d < nearestDist) { nearest = h; nearestDist = d; }
      }

      if (nearest && nearestDist < SNAP_R) {
        const currentHold = isLeft ? this.leftHold : this.rightHold;
        if (physics && !physics.canReach(currentHold, nearest)) continue;
        if (isLeft) this.leftHold  = nearest;
        else        this.rightHold = nearest;
      }
    }
  }

  // Returns [leftFoot, rightFoot] — nearest holds below hipPos
  getFootHolds(hipPos, floorY = null) {
    const below = this.holds
      .filter((h) => h.y > hipPos.y)
      .sort((a, b) => dist(hipPos, a) - dist(hipPos, b))
      .slice(0, 2);

    if (below.length === 0) {
      const fy = floorY ?? hipPos.y + 183;
      return [
        { x: hipPos.x - 20, y: fy },
        { x: hipPos.x + 20, y: fy },
      ];
    }
    if (below.length === 1) return [below[0], below[0]];
    return below[0].x < below[1].x ? [below[0], below[1]] : [below[1], below[0]];
  }
}
