export class Physics {
  constructor() {
    this.maxReach         = 320
    this.maxSpan          = 380
    this.snapRadius       = 55
    this.balanceTolerance = 0.42
  }

  canReach(currentHold, targetHold) {
    if (!currentHold) return true
    const d = Math.hypot(targetHold.x - currentHold.x, targetHold.y - currentHold.y)
    return d <= this.maxReach
  }

  canSpan(otherHold, targetHold) {
    if (!otherHold) return true
    const d = Math.hypot(targetHold.x - otherHold.x, targetHold.y - otherHold.y)
    return d <= this.maxSpan
  }

  checkBalance(pose, lHold, rHold) {
    const cx = (
      pose.head.x   * 0.2 +
      pose.pelvis.x * 0.4 +
      pose.lHand.x  * 0.1 +
      pose.rHand.x  * 0.1 +
      pose.lFoot.x  * 0.1 +
      pose.rFoot.x  * 0.1
    )
    const baseX     = (pose.lHand.x + pose.rHand.x) / 2
    const span      = Math.max(Math.abs(pose.rHand.x - pose.lHand.x) + 80, 200)
    const deviation = Math.abs(cx - baseX) / span
    const oneHand   = (lHold == null) !== (rHold == null)
    const tol       = oneHand ? 0.28 : 0.42
    return { stable: deviation <= tol, centerX: cx, baseX, deviation }
  }

  reset() {}
}
