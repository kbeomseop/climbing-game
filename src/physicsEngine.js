import Matter from 'matter-js'

const { Engine, World, Bodies, Constraint } = Matter

const UA = 90
const FA = 85
const TH = 95
const SH = 88
const TORSO = 120
const SW = 62
const HW = 46

export class PhysicsEngine {
  constructor() {
    this.engine  = Engine.create({ gravity: { x: 0, y: 2.5 } })
    this.world   = this.engine.world
    this.bodies  = {}
    this.joints  = []
    this.grips   = {}
    this.running = false
    this._fallTimer = null
  }

  init(cx, cy, matY) {
    World.clear(this.world)
    Engine.clear(this.engine)
    this.joints = []
    this.grips  = {}

    const opt = { frictionAir: 0.15, friction: 0.5, restitution: 0.0, collisionFilter: { category: 0x0001, mask: 0x0002 } }
    const B = (x, y, w, h, label) => Bodies.rectangle(x, y, w, h, { ...opt, label })

    const torso  = B(cx, cy, SW + 10, TORSO, 'torso')
    const uArmL  = B(cx - SW/2 - UA/2, cy - TORSO/2 + 20, UA, 10, 'uArmL')
    const uArmR  = B(cx + SW/2 + UA/2, cy - TORSO/2 + 20, UA, 10, 'uArmR')
    const fArmL  = B(cx - SW/2 - UA - FA/2, cy - TORSO/2 + 20, FA, 8, 'fArmL')
    const fArmR  = B(cx + SW/2 + UA + FA/2, cy - TORSO/2 + 20, FA, 8, 'fArmR')
    const thighL = B(cx - HW/2, cy + TORSO/2 + TH/2, 10, TH, 'thighL')
    const thighR = B(cx + HW/2, cy + TORSO/2 + TH/2, 10, TH, 'thighR')
    const shinL  = B(cx - HW/2, cy + TORSO/2 + TH + SH/2, 8, SH, 'shinL')
    const shinR  = B(cx + HW/2, cy + TORSO/2 + TH + SH/2, 8, SH, 'shinR')

    const ground = Bodies.rectangle(cx, matY + 25, 10000, 50, {
      isStatic: true,
      label: 'ground',
      friction: 0.8,
      restitution: 0.0,
      collisionFilter: { category: 0x0002, mask: 0x0001 },
    })

    this.bodies = { torso, uArmL, uArmR, fArmL, fArmR, thighL, thighR, shinL, shinR, ground }
    World.add(this.world, Object.values(this.bodies))

    const J = (bA, pA, bB, pB) => Constraint.create({
      bodyA: bA, pointA: pA,
      bodyB: bB, pointB: pB,
      stiffness: 0.8, length: 0, damping: 0.1,
    })

    this.joints = [
      J(torso,  { x: -SW/2, y: -TORSO/2+20 }, uArmL,  { x:  UA/2, y: 0 }),
      J(torso,  { x:  SW/2, y: -TORSO/2+20 }, uArmR,  { x: -UA/2, y: 0 }),
      J(uArmL,  { x: -UA/2, y: 0 },           fArmL,  { x:  FA/2, y: 0 }),
      J(uArmR,  { x:  UA/2, y: 0 },           fArmR,  { x: -FA/2, y: 0 }),
      J(torso,  { x: -HW/2, y:  TORSO/2 },    thighL, { x: 0, y: -TH/2 }),
      J(torso,  { x:  HW/2, y:  TORSO/2 },    thighR, { x: 0, y: -TH/2 }),
      J(thighL, { x: 0,     y:  TH/2 },       shinL,  { x: 0, y: -SH/2 }),
      J(thighR, { x: 0,     y:  TH/2 },       shinR,  { x: 0, y: -SH/2 }),
    ]
    World.add(this.world, this.joints)
    this.running = true
  }

  grip(side, holdPos) {
    this.release(side)
    const arm = side === 'left' ? this.bodies.fArmL : this.bodies.fArmR
    const c = Constraint.create({
      bodyA: arm,
      pointA: { x: side === 'left' ? -FA/2 : FA/2, y: 0 },
      pointB: holdPos,
      stiffness: 0.9, length: 0, damping: 0.1,
    })
    World.add(this.world, c)
    this.grips[side] = c
  }

  release(side) {
    if (this.grips[side]) {
      World.remove(this.world, this.grips[side])
      this.grips[side] = null
    }
  }

  update(dt) {
    if (!this.running) return
    Engine.update(this.engine, dt * 1000)
  }

  getPose() {
    if (!this.running) return null
    const b = this.bodies

    const endPt = (body, dx, dy) => {
      const cos = Math.cos(body.angle)
      const sin = Math.sin(body.angle)
      return {
        x: body.position.x + dx * cos - dy * sin,
        y: body.position.y + dx * sin + dy * cos,
      }
    }

    const lShoulder = endPt(b.torso, -SW/2, -TORSO/2+20)
    const rShoulder = endPt(b.torso,  SW/2, -TORSO/2+20)
    const lHip      = endPt(b.torso, -HW/2,  TORSO/2)
    const rHip      = endPt(b.torso,  HW/2,  TORSO/2)
    const neck      = endPt(b.torso,  0,    -TORSO/2)
    const pelvis    = endPt(b.torso,  0,     TORSO/2)
    const head      = endPt(b.torso,  0,    -TORSO/2-28)
    const lElbow    = endPt(b.uArmL, -UA/2, 0)
    const rElbow    = endPt(b.uArmR,  UA/2, 0)
    const lHand     = endPt(b.fArmL, -FA/2, 0)
    const rHand     = endPt(b.fArmR,  FA/2, 0)
    const lKnee     = endPt(b.thighL, 0,  TH/2)
    const rKnee     = endPt(b.thighR, 0,  TH/2)
    const lFoot     = endPt(b.shinL,  0,  SH/2)
    const rFoot     = endPt(b.shinR,  0,  SH/2)

    return {
      head, neck, pelvis,
      lShoulder, rShoulder,
      lElbow, rElbow,
      lHand, rHand,
      lHip, rHip,
      lKnee, rKnee,
      lFoot, rFoot,
      lArmStretched: false,
      rArmStretched: false,
      lLegStretched: false,
      rLegStretched: false,
    }
  }

  isFalling() {
    if (!this.running) return false
    if (this.grips.left || this.grips.right) return false
    const v = this.bodies.torso.velocity
    return Math.abs(v.y) > 5
  }

  reset(cx, cy, matY) {
    if (this._fallTimer) { clearTimeout(this._fallTimer); this._fallTimer = null }
    this.release('left')
    this.release('right')
    this.init(cx, cy, matY)
  }
}
