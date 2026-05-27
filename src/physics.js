export class Physics {
  constructor() {
    this.maxReach         = 320
    this.snapRadius       = 55
    this.balanceTolerance = 0.65
    this.fallState        = null  // null | 'hanging' | 'falling'
    this.fallTimer        = 0
    this.fallX            = 0
    this.fallY            = 0
    this.fallVY           = 0
  }

  canReach(currentHold, targetHold) {
    if (!currentHold) return true
    const d = Math.hypot(targetHold.x - currentHold.x, targetHold.y - currentHold.y)
    return d <= this.maxReach
  }

  checkBalance(pose) {
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
    return { stable: deviation <= this.balanceTolerance, centerX: cx, baseX, deviation }
  }

  triggerFall(pose) {
    if (this.fallState) return
    this.fallState = 'hanging'
    this.fallTimer = 0
    this.fallX     = pose.head.x
    this.fallY     = pose.head.y
    this.fallVY    = 0
  }

  updateFall(dt) {
    if (!this.fallState) return null
    this.fallTimer += dt

    if (this.fallState === 'hanging') {
      const swing = Math.sin(this.fallTimer * 8) * 14 * (1 - this.fallTimer / 0.6)
      if (this.fallTimer >= 0.6) {
        this.fallState = 'falling'
        this.fallVY    = 0
      }
      return { done: false, x: this.fallX + swing, y: this.fallY, alpha: 1 }
    }

    if (this.fallState === 'falling') {
      this.fallVY    += 980 * dt
      this.fallY     += this.fallVY * dt
      const alpha     = Math.max(0, 1 - (this.fallTimer - 0.6) / 0.8)
      if (alpha <= 0) {
        this.fallState = null
        return { done: true, x: this.fallX, y: this.fallY, alpha: 0 }
      }
      return { done: false, x: this.fallX, y: this.fallY, alpha }
    }
  }

  reset() {
    this.fallState = null
    this.fallTimer = 0
    this.fallVY    = 0
  }
}
